import { createAdminClient } from '@/lib/supabase/admin';

type InvestorRow = {
  id: string;
};

type InsertedNotification = {
  id: string;
  user_id: string;
};

/**
 * Уведомить всех инвесторов о новом проекте в каталоге.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyInvestorsNewDeal(params: {
  projectId: string;
  projectName: string;
  baseUrl: string;
}): Promise<void> {
  const { projectId, projectName, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const { data: investors } = (await admin
      .from('users')
      .select('id')
      .eq('role', 'investor')) as { data: InvestorRow[] | null };

    if (!investors || investors.length === 0) return;

    const title = 'Новая инвестиционная возможность';
    const body = `Проект «${projectName}» доступен в каталоге. Ознакомьтесь с условиями инвестирования.`;
    const link = `/deals/${projectId}`;

    const rows = investors.map((user) => ({
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
