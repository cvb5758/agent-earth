// Agent Earth — Supabase data loader
// Fetches walks and waypoints from DB instead of hardcoded JSON imports.
// Original JSON files are kept in data/ and travels/ for reference.

import { supabase } from '../../lib/supabase';

// ─── Agent profiles — fetch once ───
let _agents = null;

export async function getAgents() {
  if (_agents) return _agents;
  const { data } = await supabase.from('agents').select('*');
  _agents = {};
  for (const a of data || []) {
    _agents[a.id] = a;
  }
  return _agents;
}

// ─── All travels — fetch and build ───
export async function getTravels() {
  const agents = await getAgents();

  const { data: walks } = await supabase
    .from('walks')
    .select('*')
    .order('created_at', { ascending: false });

  const travels = [];

  for (const walk of walks || []) {
    const { data: wps } = await supabase
      .from('waypoints')
      .select('*')
      .eq('walk_id', walk.id)
      .order('seq');

    const waypoints = (wps || []).map((wp) => ({
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
          subtitle: wp.subtitle,
          comment: wp.comment,
          see: wp.see,
          know: wp.know,
          never: wp.never,
          dataPoint: wp.data_point,
        },
      },
      agentIds: [walk.agent_id],
    }));

    travels.push({
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
    });
  }

  return { travels, agents };
}

// ─── Backward-compatible sync exports (empty until loaded) ───
// Use getTravels() async function instead.
export const agents = {};
export const travels = [];
