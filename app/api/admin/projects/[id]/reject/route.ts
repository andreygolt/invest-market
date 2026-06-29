import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit/log';
import { createNotification } from '@/lib/notifications/create';
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: projectId } = await params;

  const body = (await request.json()) as { moderator_id?: string; rejection_reason?: string };
  const { moderator_id: moderatorId, rejection_reason: rejectionReason } = body;

  if (!moderatorId) {
    return NextResponse.json({ error: 'moderator_id required' }, { status: 400 });
  }
  if (!rejectionReason || rejectionReason.trim().length < 10) {
    return NextResponse.json(
      { error: 'rejection_reason must be at least 10 characters' },
      { status: 400 }
    );
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status, owner_id, name')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const rejectableStatuses = ['submitted', 'under_review'];
  if (!rejectableStatuses.includes(project.status as string)) {
    return NextResponse.json(
      { error: `cannot reject project with status: ${project.status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      status: 'rejected',
      moderated_by: moderatorId,
      moderated_at: now,
      rejection_reason: rejectionReason.trim(),
      updated_at: now,
    })
    .eq('id', projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from('admin_action_log').insert({
    actor_id: moderatorId,
    action: 'project_rejected',
    target_table: 'projects',
    target_id: projectId,
    metadata: {
      from_status: project.status,
      to_status: 'rejected',
      rejection_reason: rejectionReason.trim(),
    },
  });

  void writeAuditLog({
    actor_id: moderatorId,
    actor_email: null,
    action: 'project_rejected',
    entity_type: 'project',
    entity_id: projectId,
    meta: { reason: rejectionReason.trim() },
  });

  void createNotification({
    user_id: project.owner_id,
    type: 'project_rejected',
    title: 'Проект отклонён',
    body: `Ваш проект «${project.name}» был отклонён. Причина: ${rejectionReason.trim()}`,
    link: '/project',
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  void notifyProjectStatus({
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    newStatus: 'rejected',
    rejectionReason,
    recipientIds: [project.owner_id],
    baseUrl,
  });

  return NextResponse.json({ ok: true, status: 'rejected' });
}
