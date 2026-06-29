import { NextRequest, NextResponse } from 'next/server';
import { notifyModerators } from '@/lib/notifications/notify-moderators';
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, status, name')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  const submittableStatuses = ['draft', 'rejected'];
  if (!submittableStatuses.includes(project.status as string)) {
    return NextResponse.json({ error: 'project already submitted' }, { status: 400 });
  }

  // Проверяем что анкета заполнена (секция s1 обязательна)
  const { data: questionnaire } = await supabase
    .from('project_questionnaire')
    .select('section')
    .eq('project_id', project.id);

  const filledSections = (questionnaire ?? []).map((q: { section: string }) => q.section);
  if (!filledSections.includes('s1')) {
    return NextResponse.json({ error: 'questionnaire not filled' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();
  const isResubmit = project.status === 'rejected';

  // Обновляем статус
  const { error: updateError } = await adminSupabase
    .from('projects')
    .update({
      status: 'submitted',
      ...(isResubmit ? { rejection_reason: null, moderated_by: null, moderated_at: null } : {}),
    })
    .eq('id', project.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Пишем в лог
  await adminSupabase
    .from('project_status_log')
    .insert({
      project_id: project.id,
      from_status: project.status,
      to_status: 'submitted',
      changed_by: user.id,
    });

  void notifyModerators(project.id, project.name ?? 'Без названия').catch(() => {});

  let recipientIds: string[] = [];
  try {
    const { data: staff } = await adminSupabase
      .from('users')
      .select('id')
      .in('role', ['moderator', 'admin', 'superadmin']);

    recipientIds = (staff ?? []).map((u: { id: string }) => u.id);
  } catch {
    /* fire-and-forget */
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  void notifyProjectStatus({
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    newStatus: 'submitted',
    recipientIds,
    baseUrl,
  });

  // Запускаем AI-извлечение текста асинхронно
  const extractUrl = new URL('/api/ai/extract', request.url);
  fetch(extractUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: project.id }),
  }).catch(() => {
    /* fire-and-forget */
  });

  return NextResponse.json({ status: 'submitted' });
}
