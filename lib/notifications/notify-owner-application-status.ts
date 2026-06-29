import { createAdminClient } from '@/lib/supabase/admin';

type ProjectRow = {
  owner_id: string | null;
  name: string | null;
};

type InsertedNotification = {
  id: string;
};

export async function notifyOwnerApplicationStatus(params: {
  applicationId: string;
  projectId: string;
  newStatus: 'approved' | 'rejected';
  baseUrl: string;
}): Promise<void> {
  const { projectId, newStatus, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: project } = (await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()) as { data: ProjectRow | null };

    if (!project?.owner_id) return;

    const projectName = project.name ?? 'проект';
    const isApproved = newStatus === 'approved';
    const title = isApproved ? 'Заявка инвестора одобрена' : 'Заявка инвестора отклонена';
    const body = isApproved
      ? `По проекту «${projectName}» одобрена заявка инвестора. Инвестор приглашён к участию.`
      : `По проекту «${projectName}» отклонена заявка инвестора.`;
    const link = '/project';

    const { data: inserted } = (await admin
      .from('notifications')
      .insert({
        user_id: project.owner_id,
        title,
        body,
        link,
      })
      .select('id')
      .single()) as { data: InsertedNotification | null };

    if (!inserted?.id) return;

    fetch(`${baseUrl}/api/notifications/dispatch-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: inserted.id, userId: project.owner_id }),
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* fire-and-forget */
  }
}
