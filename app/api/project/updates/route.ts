import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateUpdateSummary } from '@/lib/ai/updates';
import { notifyProjectInvestors } from '@/lib/notifications/notify-project-investors';
import { notifyProjectUpdate } from '@/lib/notifications/notify-project-update';
import type { ProjectUpdate } from '@/types';

type UpdateBody = {
  title?: string;
  body?: string;
};

async function getCurrentProject(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name')
    .eq('owner_id', userId)
    .maybeSingle();

  return { project: data, error };
}

function validateUpdateBody(body: UpdateBody) {
  const title = body.title?.trim() ?? '';
  const text = body.body?.trim() ?? '';

  if (!title || title.length > 200) return null;
  if (!text || text.length > 5000) return null;

  return { title, body: text };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { project, error: projectError } = await getCurrentProject(supabase, user.id);
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json([]);

  const { data, error } = await supabase
    .from('project_updates')
    .select('id, project_id, title, body, ai_summary, created_at, updated_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []) as ProjectUpdate[]);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = validateUpdateBody((await request.json()) as UpdateBody);
  if (!parsed) return NextResponse.json({ error: 'Invalid update' }, { status: 400 });

  const { project, error: projectError } = await getCurrentProject(supabase, user.id);
  if (projectError) return NextResponse.json({ error: projectError.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const { data, error } = await supabase
    .from('project_updates')
    .insert({ project_id: project.id, title: parsed.title, body: parsed.body })
    .select('id, project_id, title, body, ai_summary, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const created = data as ProjectUpdate;
  void generateUpdateSummary(created.id);
  void notifyProjectInvestors(project.id, project.name, parsed.title).catch(() => {});
  void notifyProjectUpdate({
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    updateTitle: created.title,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json(created, { status: 201 });
}
