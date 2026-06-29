import { createAdminClient } from '@/lib/supabase/admin';

type InsertedNotification = {
  id: string;
};

/**
 * Уведомить реферера об изменении статуса реферального вознаграждения.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyReferralReward(params: {
  rewardId: string;
  referrerId: string;
  newStatus: 'approved' | 'paid';
  amount: number;
  baseUrl: string;
}): Promise<void> {
  const { referrerId, newStatus, amount, baseUrl } = params;
  const admin = createAdminClient();

  try {
    const isApproved = newStatus === 'approved';
    const title = isApproved
      ? 'Реферальное вознаграждение одобрено'
      : 'Реферальное вознаграждение выплачено';
    const body = isApproved
      ? `Ваше реферальное вознаграждение в размере ${amount.toLocaleString('ru-RU')} ₽ одобрено и будет выплачено в ближайшее время.`
      : `Ваше реферальное вознаграждение в размере ${amount.toLocaleString('ru-RU')} ₽ выплачено.`;
    const link = '/referral';

    const { data: inserted } = (await admin
      .from('notifications')
      .insert({
        user_id: referrerId,
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
      body: JSON.stringify({ notificationId: inserted.id, userId: referrerId }),
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* fire-and-forget */
  }
}
