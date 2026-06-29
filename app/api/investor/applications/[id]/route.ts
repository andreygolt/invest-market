import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyApplicationWithdrawn } from '@/lib/notifications/notify-application-withdrawn';
import type { ApplicationDetail } from '@/types';

// GET /api/investor/applications/[id]?investor_id=xxx
// Возвращает одну заявку инвестора
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: applicationId } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)'
    )
    .eq('id', applicationId)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  type ProjectJoin = { name: string } | { name: string }[] | null;
  function getProjectName(projects: ProjectJoin) {
    return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
  }

  const result: ApplicationDetail = {
    id: data.id,
    project_id: data.project_id,
    project_name: getProjectName(data.projects as ProjectJoin),
    amount: data.amount,
    status: data.status,
    message: data.message,
    rejection_reason: data.rejection_reason,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return NextResponse.json(result);
}

// DELETE /api/investor/applications/[id]?investor_id=xxx
// Отзывает заявку (pending -> withdrawn). Только владелец заявки.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: applicationId } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, status, investor_id, project_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  if (app.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  if (app.status !== 'pending') {
    return NextResponse.json(
      { error: 'Можно отозвать только заявку со статусом pending' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('applications')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  notifyApplicationWithdrawn({
    applicationId,
    projectId: app.project_id,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json({ ok: true });
}
