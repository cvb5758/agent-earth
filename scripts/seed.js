#!/usr/bin/env node
/**
 * seed.js — Migrate existing JSON data to Supabase
 *
 * Run with: node scripts/seed.js
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import 'dotenv/config';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── Load .env.local manually (dotenv loads .env by default) ───
import { config } from 'dotenv';
config({ path: join(ROOT, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ───
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function avg(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Map oscar perspective fields to DB columns
function mapOscarPerspective(p) {
  return {
    comment: p.comment || null,
    see: p.visual || p.see || null,    // visual → see
    know: p.known || p.know || null,   // known → know
    never: p.unknown || p.never || null, // unknown → never
    data_point: p.dataPoint || p.data_point || null,
    subtitle: p.subtitle || null,
  };
}

// Map claudie perspective fields to DB columns
function mapClaudiePerspective(p) {
  return {
    comment: p.comment || p.observation || null, // observation → comment
    see: p.see || null,
    know: p.know || null,
    never: p.never || null,
    data_point: p.dataPoint || p.data_point || null,
    subtitle: p.subtitle || null,
  };
}

function mapPerspective(agentId, p) {
  if (agentId === 'oscar') return mapOscarPerspective(p);
  return mapClaudiePerspective(p);
}

// ─── Seed agents ───
async function seedAgents() {
  console.log('\n📍 Seeding agents...');

  const agentFiles = ['oscar', 'claudie'];
  for (const name of agentFiles) {
    const agent = readJson(join(ROOT, 'data/agents', `${name}.json`));

    // Only insert columns that exist in the DB table
    const row = {
      id: agent.id,
      name: agent.name,
      emoji: agent.emoji || null,
      color: agent.color || null,
      description: agent.description || null,
    };

    const { error } = await supabase
      .from('agents')
      .upsert([row], { onConflict: 'id' });

    if (error) {
      console.error(`  ✗ ${name}: ${error.message}`);
    } else {
      console.log(`  ✓ agent: ${agent.id} (${agent.name})`);
    }
  }
}

// ─── Seed a single walk + waypoints ───
async function seedWalk(walkData, waypointRows) {
  // Upsert walk
  const { error: walkError } = await supabase
    .from('walks')
    .upsert([walkData], { onConflict: 'id' });

  if (walkError) {
    console.error(`  ✗ walk ${walkData.id}: ${walkError.message}`);
    return false;
  }
  console.log(`  ✓ walk: ${walkData.id}`);

  // Upsert waypoints
  if (waypointRows.length > 0) {
    const { error: wpError } = await supabase
      .from('waypoints')
      .upsert(waypointRows, { onConflict: 'walk_id,seq' });

    if (wpError) {
      console.error(`    ✗ waypoints for ${walkData.id}: ${wpError.message}`);
      return false;
    }
    console.log(`    ✓ ${waypointRows.length} waypoints`);
  }

  return true;
}

// ─── Seed data/travels/ (new format) ───
async function seedNewFormat(seededIds) {
  console.log('\n📍 Seeding data/travels/ (new format)...');

  const travelsDir = join(ROOT, 'data/travels');
  const folders = readdirSync(travelsDir);

  for (const folder of folders) {
    const folderPath = join(travelsDir, folder);
    const meta = readJson(join(folderPath, 'meta.json'));
    const folderId = meta.id || folder;

    // Discover agent JSON files in the folder
    const agentFiles = readdirSync(folderPath)
      .filter(f => f !== 'meta.json' && f.endsWith('.json'));

    const isMultiAgent = agentFiles.length > 1;

    for (const agentFile of agentFiles) {
      const agentId = agentFile.replace('.json', '');
      const agentData = readJson(join(folderPath, agentFile));

      // Walk ID: multi-agent → suffix; single-agent → folder name
      const walkId = isMultiAgent ? `${folderId}-${agentId}` : folderId;

      // Build perspective index by waypointId
      const perspIndex = {};
      for (const p of agentData.perspectives || []) {
        perspIndex[p.waypointId] = p;
      }

      // Build walk row
      const walkRow = {
        id: walkId,
        agent_id: agentData.agentId || agentId,
        title: meta.title,
        subtitle: meta.subtitle || null,
        description: meta.description || null,
        city: meta.location?.city || null,
        country: meta.location?.country || null,
        center_lat: meta.location?.center?.lat || null,
        center_lng: meta.location?.center?.lng || null,
        distance: meta.stats?.distance || null,
        time_span: meta.stats?.timeSpan || null,
      };

      // Build waypoint rows
      const waypointRows = (meta.waypoints || []).map((wp) => {
        const perspective = perspIndex[wp.id] || {};
        const mapped = mapPerspective(agentData.agentId || agentId, perspective);

        return {
          walk_id: walkId,
          seq: wp.id,
          lat: wp.lat,
          lng: wp.lng,
          heading: wp.heading || 0,
          pitch: wp.pitch || 0,
          title: wp.title || null,
          has_street_view: wp.hasStreetView !== false,
          image_url: wp.localImage || null,
          comment: mapped.comment || null,
          see: mapped.see || null,
          know: mapped.know || null,
          never: mapped.never || null,
          data_point: mapped.data_point || null,
        };
      });

      const ok = await seedWalk(walkRow, waypointRows);
      if (ok) seededIds.add(walkId);
    }
  }
}

// ─── Seed travels/ (legacy format) ───
async function seedLegacyFormat(seededIds) {
  console.log('\n📍 Seeding travels/ (legacy format)...');

  const legacyDir = join(ROOT, 'travels');
  const files = readdirSync(legacyDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const data = readJson(join(legacyDir, file));

    // Derive walk ID from filename: "claudie-jamsil-seokchon.json" → "jamsil-seokchon"
    const rawName = basename(file, '.json');
    const walkId = rawName.replace(/^(claudie|oscar)-/, '');

    // Skip if already seeded via new-format (new-format takes priority)
    if (seededIds.has(walkId)) {
      console.log(`  ⏭ skipping ${walkId} (already seeded from data/travels/)`);
      continue;
    }

    const waypoints = data.waypoints || [];

    // Compute center from average of waypoint coords
    const lats = waypoints.map(w => w.lat).filter(Boolean);
    const lngs = waypoints.map(w => w.lng).filter(Boolean);
    const centerLat = lats.length > 0 ? avg(lats) : null;
    const centerLng = lngs.length > 0 ? avg(lngs) : null;

    // Split city string: "Seoul, South Korea" → city="Seoul", country="South Korea"
    const cityRaw = data.city || '';
    const commaIdx = cityRaw.indexOf(',');
    const city = commaIdx >= 0 ? cityRaw.slice(0, commaIdx).trim() : cityRaw.trim();
    const country = commaIdx >= 0 ? cityRaw.slice(commaIdx + 1).trim() : '';

    const walkRow = {
      id: walkId,
      agent_id: data.walker,
      title: data.title || null,
      subtitle: data.subtitle || null,
      description: data.summary || null,
      city: city || null,
      country: country || null,
      center_lat: centerLat,
      center_lng: centerLng,
      distance: null,
      time_span: data.date || null,
    };

    const waypointRows = waypoints.map((wp) => ({
      walk_id: walkId,
      seq: wp.id,
      lat: wp.lat,
      lng: wp.lng,
      heading: 0,
      pitch: 0,
      title: wp.title || null,
      has_street_view: false, // legacy walks use local images
      image_url: wp.image || null,
      comment: wp.comment || null,
      see: wp.track?.see || null,
      know: wp.track?.know || null,
      never: wp.track?.never || null,
      data_point: null,
    }));

    await seedWalk(walkRow, waypointRows);
  }
}

// ─── Main ───
async function main() {
  console.log('🌍 Agent Earth — Supabase Seed Script');
  console.log(`   URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\n❌ Missing env vars. Check .env.local');
    process.exit(1);
  }

  await seedAgents();
  const seededIds = new Set();
  await seedNewFormat(seededIds);
  await seedLegacyFormat(seededIds);

  console.log('\n✅ Seed complete!');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
