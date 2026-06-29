import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/types';

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Супер-администратор',
  admin: 'Администратор',
  moderator: 'Модератор',
  manager: 'Менеджер',
  investor: 'Инвестор',
  project: 'Проект',
};

/**
 * Уведомить пользователя об изменении роли или статуса аккаунта.
 * Fire-and-forget - не бросает исключений.
 */
export async function notifyUserAccountChange(params: {
  userId: string;
  newRole?: UserRole;
  newIsActive?: boolean;
  baseUrl: string;
}): Promise<void> {
  const { userId, newRole, newIsActive, baseUrl } = params;

  if (newRole === undefined && newIsActive === undefined) return;

  const admin = createAdminClient();

  try {
    let title: string;
    let body: string;

    if (newRole !== undefined && newIsActive !== undefined) {
      const roleLabel = ROLE_LABELS[newRole] ?? newRole;
      const activeText = newIsActive ? 'активирован' : 'деактивирован';
      title = 'Изменены роль и статус аккаунта';
      body = `Ваша роль изменена на «${roleLabel}», аккаунт ${activeText}.`;
    } else if (newRole !== undefined) {
      const roleLabel = ROLE_LABELS[newRole] ?? newRole;
      title = 'Ваша роль изменена';
      body = `Администратор изменил вашу роль на платформе: «${roleLabel}».`;
    } else {
      const activeText = newIsActive ? 'активирован' : 'деактивирован';
      title = newIsActive ? 'Аккаунт активирован' : 'Аккаунт деактивирован';
      body = `Ваш аккаунт на платформе ${activeText} администратором.`;
    }

    const link = '/profile';

    const { data: inserted } = await admin
      .from('notifications')
      .insert({ user_id: userId, title, body, link })
      .select('id')
      .single();

    if (!inserted?.id) return;

    fetch(`${baseUrl}/api/notifications/dispatch-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: inserted.id, userId }),
    }).catch(() => {
      /* ignore */
    });
  } catch {
    /* fire-and-forget */
  }
}
