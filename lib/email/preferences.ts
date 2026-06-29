import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Возвращает true если пользователь согласен получать email-уведомления.
 * Если записи нет — email разрешён по умолчанию (opt-out модель).
 * При ошибке БД — возвращает true (fail-open: лучше отправить лишнее письмо).
 */
export async function isEmailEnabled(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', userId)
      .single();

    if (error || !data) return true;
    return data.email_enabled as boolean;
  } catch {
    return true;
  }
}
