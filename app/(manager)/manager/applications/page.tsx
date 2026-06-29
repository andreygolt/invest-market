import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { AdminApplicationItem } from '@/types';

type ProjectJoin = { name: string | null } | { name: string | null }[] | null;
type UserJoin = { email: string | null } | { email: string | null }[] | null;
type ManagerApplicationStatus = AdminApplicationItem['status'];
type ApplicationRow = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  instrument: string | null;
  status: string;
  message: string | null;
  created_at: string;
  projects: ProjectJoin;
  users: UserJoin;
};
type ManagerApplicationRow = ApplicationRow & { status: ManagerApplicationStatus };

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

const STATUSES: ManagerApplicationStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

function isManagerApplicationStatus(value: string | undefined): value is ManagerApplicationStatus {
  return STATUSES.includes(value as ManagerApplicationStatus);
}

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? null;
}

function getInvestorEmail(users: UserJoin) {
  return (Array.isArray(users) ? users[0]?.email : users?.email) ?? null;
}

function formatAmount(amount: number | null) {
  if (amount === null) return '-';
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

export default async function ManagerApplicationsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { status } = await searchParams;
  const statusFilter = isManagerApplicationStatus(status) ? status : null;
  const exportHref = statusFilter
    ? `/api/manager/export/applications?status=${statusFilter}`
    : '/api/manager/export/applications';
  const adminSupabase = createAdminClient();

  let query = adminSupabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, instrument, status, message, created_at, projects(name), users(email)'
    )
    .order('created_at', { ascending: false })
    .limit(50);

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }

  const { data } = await query;
  const applications: ManagerApplicationRow[] = ((data ?? []) as ApplicationRow[]).filter((row) =>
    isManagerApplicationStatus(row.status)
  ) as ManagerApplicationRow[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Заявки инвесторов</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/manager/applications"
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
          >
            Все
          </Link>
          {STATUSES.map((item) => (
            <Link
              key={item}
              href={`/manager/applications?status=${item}`}
              className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
            >
              {item}
            </Link>
          ))}
          <a
            href={exportHref}
            className="rounded border px-3 py-1 text-sm hover:bg-gray-50"
            download
          >
            Экспорт CSV
          </a>
        </div>
      </div>

      {applications.length === 0 ? (
        <p className="text-gray-500">Заявок нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">ID</th>
                <th className="px-4 py-2 text-left font-medium">Проект</th>
                <th className="px-4 py-2 text-left font-medium">Инвестор</th>
                <th className="px-4 py-2 text-left font-medium">Сумма</th>
                <th className="px-4 py-2 text-left font-medium">Инструмент</th>
                <th className="px-4 py-2 text-left font-medium">Статус</th>
                <th className="px-4 py-2 text-left font-medium">Дата</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => (
                <tr key={application.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{application.id}</td>
                  <td className="px-4 py-2">
                    {getProjectName(application.projects) ?? application.project_id}
                  </td>
                  <td className="px-4 py-2">
                    {getInvestorEmail(application.users) ?? application.investor_id}
                  </td>
                  <td className="px-4 py-2">{formatAmount(application.amount)}</td>
                  <td className="px-4 py-2">{application.instrument ?? '-'}</td>
                  <td className="px-4 py-2">{application.status}</td>
                  <td className="px-4 py-2">
                    {new Date(application.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/manager/applications/${application.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
