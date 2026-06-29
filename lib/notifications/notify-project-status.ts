import { createAdminClient } from '@/lib/supabase/admin';

type ProjectStatusNotificationStatus = 'submitted' | 'approved' | 'rejected';

type InsertedNotification = {
  id: string;
  user_id: string;
};

/**
 * Уведомить пользователей об изменении статуса проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyProjectStatus(params: {
  projectId: string;
  projectName: string;
  newStatus: ProjectStatusNotificationStatus;
  rejectionReason?: string | null;
  recipientIds: string[];
  baseUrl: string;
}): Promise<void> {
  const { projectId, projectName, newStatus, rejectionReason, recipientIds, baseUrl } = params;
  if (recipientIds.length === 0) return;

  const admin = createAdminClient();

  const titleMap: Record<ProjectStatusNotificationStatus, string> = {
    submitted: 'Новый проект на проверке',
    approved: 'Проект одобрен',
    rejected: 'Проект отклонён',
  };
  const bodyMap = (
    name: string,
    reason?: string | null
  ): Record<ProjectStatusNotificationStatus, string> => ({
    submitted: `Проект «${name}» подан на проверку и ожидает модерации.`,
    approved: `Поздравляем! Проект «${name}» одобрен и будет опубликован в каталоге.`,
    rejected: `Проект «${name}» отклонён.${reason ? ` Причина: ${reason}` : ''}`,
  });

  const title = titleMap[newStatus];
  const body = bodyMap(projectName, rejectionReason)[newStatus];

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    title,
    body,
    link: newStatus === 'submitted' ? `/moderation/${projectId}` : '/project',
  }));

  try {
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
