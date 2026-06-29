import { createAdminClient } from '@/lib/supabase/admin';

type ProjectRow = {
  owner_id: string | null;
  name: string | null;
};

type StaffRow = {
  id: string;
};

type NotificationRow = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type InsertedNotification = {
  id: string;
  user_id: string;
};

/**
 * Уведомить владельца проекта и менеджеров об отзыве заявки инвестором.
 * Fire-and-forget - не бросает исключений.
 */
export async function notifyApplicationWithdrawn(params: {
  applicationId: string;
  projectId: string;
  baseUrl: string;
}): Promise<void> {
  const { projectId, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: project } = (await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()) as { data: ProjectRow | null };

    if (!project) return;

    const { data: staff } = (await admin
      .from('users')
      .select('id')
      .in('role', ['manager', 'admin', 'superadmin'])) as { data: StaffRow[] | null };

    const projectName = project.name ?? 'проект';
    const title = 'Инвестор отозвал заявку';
    const body = `По проекту «${projectName}» инвестор отозвал свою заявку.`;
    const staffLink = '/manager/applications';

    const ownerRows: NotificationRow[] = project.owner_id
      ? [{ user_id: project.owner_id, title, body, link: '/project' }]
      : [];
    const staffRows: NotificationRow[] = (staff ?? []).map((user) => ({
      user_id: user.id,
      title,
      body,
      link: staffLink,
    }));
    const rows = [...ownerRows, ...staffRows];

    if (rows.length === 0) return;

    const { data: inserted } = (await admin
      .from('notifications')
      .insert(rows)
      .select('id, user_id')) as { data: InsertedNotification[] | null };

    if (!inserted) return;

    for (const notification of inserted) {
      fetch(`${baseUrl}/api/notifications/dispatch-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: notification.id,
          userId: notification.user_id,
        }),
      }).catch(() => {
        /* ignore */
      });
    }
  } catch {
    /* fire-and-forget */
  }
}
