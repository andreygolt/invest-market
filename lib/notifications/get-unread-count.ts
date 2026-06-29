import { createClient as createServerClient } from '@/lib/supabase/server';

/**
 * Возвращает количество непрочитанных уведомлений текущего пользователя.
 * При ошибке или отсутствии сессии возвращает 0.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return 0;

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    return user?.id ?? null;
  } catch {
    return null;
  }
}
