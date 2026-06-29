import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  return NextResponse.json({ project: project ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json() as { name?: string };
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('projects')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (existing) return NextResponse.json({ project: existing });

  const { data: project, error } = await supabase
    .from('projects')
    .insert({ owner_id: user.id, name: body.name.trim(), status: 'draft' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ project }, { status: 201 });
}
