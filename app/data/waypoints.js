// Agent Earth — Supabase data loader
// Fetches walks and waypoints from DB instead of hardcoded JSON imports.
// Original JSON files are kept in data/ and travels/ for reference.

import { supabase } from '../../lib/supabase';

// ─── Agent profiles — fetch once ───
let _agents = null;

export async function getAgents() {
  if (_agents) return _agents;
  const { data, error } = await supabase.from('agents').select('*');
  if (error) {
    console.error('[getAgents] Supabase error:', error.message);
  }
  _agents = {};
  for (const a of data || []) {
    _agents[a.id] = a;
  }
  return _agents;
}

// ─── All travels — single nested query (no N+1) ───
export async function getTravels() {
  const agents = await getAgents();

  // Single query: fetch walks with their waypoints inline
  const { data: walks, error: walksError } = await supabase
    .from('walks')
    .select('*, waypoints(*)')
    .order('created_at', { ascending: false });

  if (walksError) {
    console.error('[getTravels] Supabase error fetching walks:', walksError.message);
    return { travels: [], agents };
  }

  const travels = (walks || []).map((walk) => {
    // Sort waypoints by seq (nested select doesn't guarantee order)
    const wps = (walk.waypoints || []).slice().sort((a, b) => a.seq - b.seq);

    const waypoints = wps.map((wp) => ({
      id: wp.seq,
      lat: wp.lat,
      lng: wp.lng,
      heading: wp.heading || 0,
      pitch: wp.pitch || 0,
      title: wp.title,
      hasStreetView: wp.has_street_view,
      localImage: wp.image_url,
      perspectives: {
        [walk.agent_id]: {
          waypointId: wp.seq,
          // subtitle omitted: column not yet in DB schema
          // (add via migration: ALTER TABLE waypoints ADD COLUMN subtitle TEXT)
          comment: wp.comment,
          see: wp.see,
          know: wp.know,
          never: wp.never,
          dataPoint: wp.data_point,
        },
      },
      agentIds: [walk.agent_id],
    }));

    return {
      meta: {
        id: walk.id,
        title: walk.title,
        subtitle: walk.subtitle,
        description: walk.description,
        location: {
          city: walk.city?.split(',')[0]?.trim() || walk.city,
          district: walk.title,
          country: walk.country || walk.city?.split(',')[1]?.trim() || '',
          center: { lat: walk.center_lat, lng: walk.center_lng },
        },
        stats: {
          distance: walk.distance || '~2km',
          timeSpan: walk.time_span || 'today',
        },
      },
      waypoints,
      agentOrder: [walk.agent_id],
    };
  });

  return { travels, agents };
}

// ─── Backward-compatible sync exports (empty until loaded) ───
// Use getTravels() async function instead.
export const agents = {};
export const travels = [];
