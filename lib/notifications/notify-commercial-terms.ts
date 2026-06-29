import { createAdminClient } from '@/lib/supabase/admin';

type ProjectOwnerRow = {
  owner_id: string | null;
  name: string;
};

type InsertedNotification = {
  id: string;
};

/**
 * Уведомить владельца проекта об установке/обновлении коммерческих условий.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyCommercialTerms(params: {
  projectId: string;
  successFeePct: number;
  fixedFee: number;
  baseUrl: string;
}): Promise<void> {
  const { projectId, successFeePct, fixedFee, baseUrl } = params;

  try {
    const admin = createAdminClient();

    const { data: project } = (await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()) as { data: ProjectOwnerRow | null };

    if (!project?.owner_id) return;

    const title = 'Коммерческие условия установлены';
    const feeLine =
      fixedFee > 0
        ? `Success fee: ${successFeePct}%, фиксированное вознаграждение: ${fixedFee.toLocaleString('ru-RU')} ₽.`
        : `Success fee: ${successFeePct}%.`;
    const body = `По проекту «${project.name}» администратор установил коммерческие условия. ${feeLine} Подробности в кабинете проекта.`;
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
