import { createNotification } from '@/lib/notifications/create';
import { createAdminClient } from '@/lib/supabase/admin';

type InvestorIdRow = {
  investor_id: string;
};

function toInvestorIdRows(rows: unknown): InvestorIdRow[] {
  if (!Array.isArray(rows)) return [];

  return rows.filter(
    (row): row is InvestorIdRow =>
      typeof row === 'object' &&
      row !== null &&
      'investor_id' in row &&
      typeof row.investor_id === 'string'
  );
}

export async function notifyProjectInvestors(
  projectId: string,
  projectName: string,
  updateTitle: string
): Promise<void> {
  try {
    const adminSupabase = createAdminClient();

    const { data: appRows } = await adminSupabase
      .from('applications')
      .select('investor_id')
      .eq('project_id', projectId)
      .in('status', ['pending', 'approved']);

    const { data: portfolioRows } = await adminSupabase
      .from('investor_portfolio')
      .select('investor_id')
      .eq('project_id', projectId);

    const { data: favRows } = await adminSupabase
      .from('investor_favorites')
      .select('investor_id')
      .eq('project_id', projectId);

    const investorIds = new Set<string>([
      ...toInvestorIdRows(appRows).map((row) => row.investor_id),
      ...toInvestorIdRows(portfolioRows).map((row) => row.investor_id),
      ...toInvestorIdRows(favRows).map((row) => row.investor_id),
    ]);

    const notifications = Array.from(investorIds).map((investorId) =>
      createNotification({
        user_id: investorId,
        type: 'project_update',
        title: `Обновление: ${projectName}`,
        body: updateTitle,
        link: `/deals/${projectId}`,
      })
    );

    await Promise.allSettled(notifications);
  } catch {}
}
