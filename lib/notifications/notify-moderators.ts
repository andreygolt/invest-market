import { createNotification } from '@/lib/notifications/create';
import { createAdminClient } from '@/lib/supabase/admin';

type ModeratorRow = {
  id: string;
};

export async function notifyModerators(projectId: string, projectName: string): Promise<void> {
  try {
    const adminSupabase = createAdminClient();

    const { data: moderators } = await adminSupabase
      .from('profiles')
      .select('id')
      .in('role', ['moderator', 'admin', 'superadmin']);

    if (!moderators || moderators.length === 0) return;

    const notifications = (moderators as ModeratorRow[]).map((moderator) =>
      createNotification({
        user_id: moderator.id,
        type: 'new_project_submission',
        title: 'Новый проект на модерацию',
        body: `Проект «${projectName}» отправлен на рассмотрение. Требуется проверка.`,
        link: `/moderation/${projectId}`,
      })
    );

    await Promise.allSettled(notifications);
  } catch {}
}
