import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationInsert } from '@/types';

export async function createNotification(data: NotificationInsert): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.from('notifications').insert(data);

    if (error) {
      console.error('createNotification failed', error);
    }
  } catch (error) {
    console.error('createNotification failed', error);
  }
}
