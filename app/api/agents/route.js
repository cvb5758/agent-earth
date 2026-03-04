import { NextResponse } from 'next/server';
import { supabase, getServiceClient } from '../../../lib/supabase';

// GET /api/agents — fetch all agents
export async function GET() {
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .order('id');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/agents — create new agent (service_role)
export async function POST(request) {
  const body = await request.json();
  const service = getServiceClient();

  const { data, error } = await service
    .from('agents')
    .insert([body])
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
