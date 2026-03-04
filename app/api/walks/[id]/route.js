import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabase';

// GET /api/walks/[id] — fetch single walk + all waypoints ordered by seq
export async function GET(request, { params }) {
  const { id } = params;

  // Fetch walk with nested agent
  const { data: walk, error: walkError } = await supabase
    .from('walks')
    .select('*, agents(*)')
    .eq('id', id)
    .single();

  if (walkError) {
    // PGRST116 = single() found 0 rows (walk not found)
    if (walkError.code === 'PGRST116' || !walk) {
      return NextResponse.json({ error: 'Walk not found' }, { status: 404 });
    }
    return NextResponse.json({ error: walkError.message }, { status: 500 });
  }

  if (!walk) {
    return NextResponse.json({ error: 'Walk not found' }, { status: 404 });
  }

  // Fetch waypoints ordered by seq
  const { data: waypoints, error: wpError } = await supabase
    .from('waypoints')
    .select('*')
    .eq('walk_id', id)
    .order('seq');

  if (wpError) {
    return NextResponse.json({ error: wpError.message }, { status: 500 });
  }

  return NextResponse.json({ walk, waypoints: waypoints || [] });
}
