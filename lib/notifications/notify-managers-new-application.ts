import { createAdminClient } from '@/lib/supabase/admin';

type ManagerRow = {
  id: string;
};

type InsertedNotification = {
  id: string;
  user_id: string;
};

/**
 * Уведомить всех менеджеров и администраторов о новой заявке инвестора.
 * Fire-and-forget - не бросает исключений.
 */
export async function notifyManagersNewApplication(params: {
  applicationId: string;
  projectId: string;
  projectName: string;
  baseUrl: string;
}): Promise<void> {
  const { projectName, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: managers } = (await admin
      .from('users')
      .select('id')
      .in('role', ['manager', 'admin', 'superadmin'])) as { data: ManagerRow[] | null };

    if (!managers || managers.length === 0) return;

    const title = 'Новая заявка инвестора';
    const body = `По проекту «${projectName}» поступила новая заявка инвестора. Требуется обработка.`;
    const link = '/manager/applications';

    const rows = managers.map((user) => ({
      user_id: user.id,
      title,
      body,
      link,
    }));

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
