import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { ApplicationDetail, ApplicationStatus } from '@/types';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'На рассмотрении',
  reviewing: 'Изучается',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
  withdrawn: 'Отозвана',
};

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  pending: 'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  reviewing:
    'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  approved:
    'rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700',
  rejected: 'rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600',
  cancelled:
    'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
  withdrawn:
    'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('applications')
    .select(
      'id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)'
    )
    .eq('id', id)
    .eq('investor_id', user.id)
    .maybeSingle();

  if (!data) notFound();

  type ProjectJoin = { name: string } | { name: string }[] | null;
  function getProjectName(projects: ProjectJoin) {
    return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
  }

  const app: ApplicationDetail = {
    id: data.id,
    project_id: data.project_id,
    project_name: getProjectName(data.projects as ProjectJoin),
    amount: data.amount,
    status: data.status as ApplicationStatus,
    message: data.message,
    rejection_reason: data.rejection_reason,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/applications"
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          ← Все заявки
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              <Link
                href={`/deals/${app.project_id}`}
                className="hover:text-slate-700 transition-colors"
              >
                {app.project_name}
              </Link>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Заявка от {new Date(app.created_at).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <span className={STATUS_CLASSES[app.status]}>{STATUS_LABELS[app.status]}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {app.amount !== null && (
            <div className="py-3 flex justify-between text-sm">
              <span className="text-slate-500">Сумма интереса</span>
              <span className="text-slate-900 font-medium">
                {new Intl.NumberFormat('ru-RU', {
                  style: 'currency',
                  currency: 'RUB',
                  maximumFractionDigits: 0,
                }).format(app.amount)}
              </span>
            </div>
          )}
          <div className="py-3 flex justify-between text-sm">
            <span className="text-slate-500">Статус</span>
            <span className="text-slate-900">{STATUS_LABELS[app.status]}</span>
          </div>
          <div className="py-3 flex justify-between text-sm">
            <span className="text-slate-500">Обновлено</span>
            <span className="text-slate-900">
              {new Date(app.updated_at).toLocaleString('ru-RU')}
            </span>
          </div>
        </div>

        {app.message && (
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-2">Ваше сообщение</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{app.message}</p>
          </div>
        )}

        {app.status === 'rejected' && app.rejection_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-medium text-red-700 mb-1">Причина отклонения</h2>
            <p className="text-sm text-red-600">{app.rejection_reason}</p>
          </div>
        )}

        <div className="pt-2 flex gap-3">
          <Link
            href={`/deals/${app.project_id}`}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            Открыть проект →
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Заявки носят ознакомительный характер. Сделки заключаются вне платформы. Доходность не
        гарантируется.
      </p>
    </div>
  );
}
