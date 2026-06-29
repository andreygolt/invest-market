import { createAdminClient } from '@/lib/supabase/admin';

type ApplicationInvestorRow = {
  investor_id: string;
};

type InsertedNotificationRow = {
  id: string;
  user_id: string;
};

function toApplicationInvestorRows(rows: unknown): ApplicationInvestorRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.filter(
    (row): row is ApplicationInvestorRow =>
      typeof row === 'object' &&
      row !== null &&
      'investor_id' in row &&
      typeof row.investor_id === 'string'
  );
}

/**
 * Уведомить инвесторов с активными заявками о новом обновлении проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyProjectUpdate(params: {
  projectId: string;
  projectName: string;
  updateTitle: string;
  baseUrl: string;
}): Promise<void> {
  const { projectId, projectName, updateTitle, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: applications } = await admin
      .from('applications')
      .select('investor_id')
      .eq('project_id', projectId)
      .not('status', 'in', '("withdrawn","rejected")');

    const uniqueInvestorIds = [...new Set(toApplicationInvestorRows(applications).map((row) => row.investor_id))];
    if (uniqueInvestorIds.length === 0) return;

    const title = 'Новое обновление от проекта';
    const body = `Проект «${projectName}» опубликовал новое обновление: «${updateTitle}».`;
    const link = `/deals/${projectId}`;

    const rows = uniqueInvestorIds.map((userId) => ({
      user_id: userId,
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
