import { createNotification } from '@/lib/notifications/create';
import { createAdminClient } from '@/lib/supabase/admin';

type ManagerRow = {
  id: string;
};

export async function notifyManagers(
  projectId: string,
  projectName: string,
  applicationId: string
): Promise<void> {
  try {
    const adminSupabase = createAdminClient();

    const { data: managers } = await adminSupabase
      .from('profiles')
      .select('id')
      .in('role', ['manager', 'admin', 'superadmin']);

    if (!managers || managers.length === 0) return;

    const notifications = (managers as ManagerRow[]).map((manager) =>
      createNotification({
        user_id: manager.id,
        type: 'new_application_manager',
        title: 'Новая заявка инвестора',
        body: `По проекту «${projectName}» поступила новая заявка. Требуется рассмотрение.`,
        link: `/manager/applications/${applicationId}`,
      })
    );

    await Promise.allSettled(notifications);
  } catch {}
}
