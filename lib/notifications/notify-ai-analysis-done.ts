import { createAdminClient } from '@/lib/supabase/admin';

type ModeratorRow = {
  id: string;
};

type InsertedNotificationRow = {
  id: string;
  user_id: string;
};

/**
 * Уведомить модераторов о завершении AI-анализа проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyAiAnalysisDone(params: {
  projectId: string;
  projectName: string;
  baseUrl: string;
}): Promise<void> {
  const { projectId, projectName, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: moderators } = await admin
      .from('profiles')
      .select('id')
      .in('role', ['moderator', 'admin', 'superadmin']);

    if (!moderators || moderators.length === 0) return;

    const title = 'AI-анализ проекта завершён';
    const body = `AI-отчёт по проекту «${projectName}» готов к рассмотрению.`;
    const link = `/moderation/${projectId}`;

    const rows = (moderators as ModeratorRow[]).map((moderator) => ({
      user_id: moderator.id,
      title,
      body,
      link,
    }));

    const { data: inserted } = await admin.from('notifications').insert(rows).select('id, user_id');

    if (!inserted) return;

    for (const notification of inserted as InsertedNotificationRow[]) {
      fetch(`${baseUrl}/api/notifications/dispatch-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: notification.id, userId: notification.user_id }),
      }).catch(() => {});
    }
  } catch {}
}
