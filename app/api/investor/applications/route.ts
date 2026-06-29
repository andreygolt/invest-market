import { NextRequest, NextResponse } from 'next/server';
import { notifyManagers } from '@/lib/notifications/notify-managers';
import { notifyManagersNewApplication } from '@/lib/notifications/notify-managers-new-application';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApplicationDetail } from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// POST /api/investor/applications
// Body: { investor_id, project_id, amount?, message }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    amount?: number | null;
    message?: string;
  };

  const { investor_id, project_id, amount, message } = body;

  if (!investor_id || !project_id || !message?.trim()) {
    return NextResponse.json(
      { error: 'investor_id, project_id и message обязательны' },
      { status: 400 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, owner_id')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден или не одобрен' }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from('applications')
    .select('id, status')
    .eq('investor_id', investor_id)
    .eq('project_id', project_id)
    .in('status', ['pending', 'reviewing'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'У вас уже есть активная заявка на этот проект' },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data: app, error } = await supabase
    .from('applications')
    .insert({
      investor_id,
      project_id,
      amount: amount ?? null,
      status: 'pending',
      message: message.trim(),
      updated_at: now,
    })
    .select('id, project_id, amount, status, message, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (project.owner_id) {
    void supabase.from('notifications').insert({
      user_id: project.owner_id,
      type: 'new_application',
      title: 'Новая заявка от инвестора',
      body: `По проекту «${project.name}» поступила новая заявка на рассмотрение.`,
      link: '/project',
    });
  }

  void notifyManagersNewApplication({
    applicationId: app.id,
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  void notifyManagers(project.id, project.name, app.id).catch(() => {});

  const result: ApplicationDetail = {
    id: app.id,
    project_id: app.project_id,
    project_name: project.name,
    amount: app.amount,
    status: app.status,
    message: app.message,
    rejection_reason: null,
    created_at: app.created_at,
    updated_at: app.updated_at,
  };

  return NextResponse.json(result, { status: 201 });
}

// GET /api/investor/applications?investor_id=xxx
// Возвращает список заявок инвестора
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)')
    .eq('investor_id', investor_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications: ApplicationDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    amount: row.amount,
    status: row.status,
    message: row.message,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ applications });
}
