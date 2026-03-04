import { NextResponse } from 'next/server';
import { supabase, getServiceClient } from '../../../lib/supabase';

// GET /api/walks — fetch all walks joined with agent info (for map markers)
export async function GET() {
  const { data, error } = await supabase
    .from('walks')
    .select('*, agents(*)')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/walks — create new walk + waypoints
// Body: { id, agent_id, title, subtitle, description, city, country,
//         center_lat, center_lng, distance, time_span, waypoints: [{seq, lat, lng, ...}] }
export async function POST(request) {
  const body = await request.json();
  const { waypoints, ...walkData } = body;

  const service = getServiceClient();

  // Insert walk
  const { data: walk, error: walkError } = await service
    .from('walks')
    .insert([walkData])
    .select()
    .single();

  if (walkError) {
    return NextResponse.json({ error: walkError.message }, { status: 500 });
  }

  // Bulk insert waypoints
  if (waypoints && waypoints.length > 0) {
    const waypointRows = waypoints.map((wp) => ({
      ...wp,
      walk_id: walk.id,
    }));

    const { error: wpError } = await service
      .from('waypoints')
      .insert(waypointRows);

    if (wpError) {
      return NextResponse.json({ error: wpError.message }, { status: 500 });
    }
  }

  return NextResponse.json(walk, { status: 201 });
}
