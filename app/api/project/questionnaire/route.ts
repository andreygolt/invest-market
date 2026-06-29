import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;

async function getProject(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', userId)
    .maybeSingle();
  return data;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const section = request.nextUrl.searchParams.get('section');
  if (!section || !VALID_SECTIONS.includes(section as typeof VALID_SECTIONS[number])) {
    return NextResponse.json({ error: 'invalid section' }, { status: 400 });
  }

  const project = await getProject(supabase, user.id);
  if (!project) return NextResponse.json({ answers: {} });

  const { data } = await supabase
    .from('project_questionnaire')
    .select('answers')
    .eq('project_id', project.id)
    .eq('section', section)
    .maybeSingle();

  return NextResponse.json({ answers: data?.answers ?? {} });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json() as { section?: string; answers?: Record<string, unknown> };
  if (!body.section || !VALID_SECTIONS.includes(body.section as typeof VALID_SECTIONS[number])) {
    return NextResponse.json({ error: 'invalid section' }, { status: 400 });
  }
  if (!body.answers || typeof body.answers !== 'object') {
    return NextResponse.json({ error: 'answers required' }, { status: 400 });
  }

  const project = await getProject(supabase, user.id);
  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const { error } = await supabase
    .from('project_questionnaire')
    .upsert(
      { project_id: project.id, section: body.section, answers: body.answers },
      { onConflict: 'project_id,section' }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
