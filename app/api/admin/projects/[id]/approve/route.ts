import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { writeAuditLog } from '@/lib/audit/log';
import { createNotification } from '@/lib/notifications/create';
import { notifyInvestorsNewDeal } from '@/lib/notifications/notify-investors-new-deal';
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: projectId } = await params;

  const body = (await request.json()) as { moderator_id?: string };
  const moderatorId = body.moderator_id;

  if (!moderatorId) {
    return NextResponse.json({ error: 'moderator_id required' }, { status: 400 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status, owner_id, name')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const approvableStatuses = ['submitted', 'under_review'];
  if (!approvableStatuses.includes(project.status as string)) {
    return NextResponse.json(
      { error: `cannot approve project with status: ${project.status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      status: 'approved',
      moderated_by: moderatorId,
      moderated_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq('id', projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from('admin_action_log').insert({
    actor_id: moderatorId,
    action: 'project_approved',
    target_table: 'projects',
    target_id: projectId,
    metadata: { from_status: project.status, to_status: 'approved' },
  });

  void writeAuditLog({
    actor_id: moderatorId,
    actor_email: null,
    action: 'project_approved',
    entity_type: 'project',
    entity_id: projectId,
  });

  void createNotification({
    user_id: project.owner_id,
    type: 'project_approved',
    title: 'Проект одобрен',
    body: `Ваш проект «${project.name}» прошёл модерацию и теперь виден инвесторам.`,
    link: '/project',
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  void notifyProjectStatus({
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    newStatus: 'approved',
    recipientIds: [project.owner_id],
    baseUrl,
  });

  void notifyInvestorsNewDeal({
    projectId: project.id,
    projectName: project.name ?? 'Без названия',
    baseUrl,
  });

  return NextResponse.json({ ok: true, status: 'approved' });
}
