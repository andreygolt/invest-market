'use client';

import Link from 'next/link';

import type { ManagerDashboardData } from '@/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Ожидают', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Одобрены', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонены', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Отменены', color: 'bg-gray-100 text-gray-600' },
};

interface Props {
  data: ManagerDashboardData;
}

export function ManagerDashboardClient({ data }: Props) {
  const { stats, recentApplications } = data;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Кабинет менеджера</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.entries(stats) as [string, number][]).map(([status, count]) => {
          const meta = STATUS_LABELS[status] ?? {
            label: status,
            color: 'bg-gray-100 text-gray-700',
          };

          return (
            <Link
              key={status}
              href={`/manager/applications?status=${status}`}
              className="rounded-lg border p-4 hover:bg-gray-50 transition-colors"
            >
              <p className="text-3xl font-bold">{count}</p>
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
              >
                {meta.label}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/manager/applications?status=pending"
            className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            Обработать заявки ({stats.pending})
          </Link>
          <Link
            href="/manager/applications"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Все заявки
          </Link>
        </div>
      </div>

      {recentApplications.length > 0 && (
        <div className="rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Последние заявки</h2>
            <Link href="/manager/applications" className="text-xs text-gray-500 hover:underline">
              Все заявки
            </Link>
          </div>
          <ul className="divide-y">
            {recentApplications.map((app) => {
              const meta = STATUS_LABELS[app.status] ?? {
                label: app.status,
                color: 'bg-gray-100 text-gray-700',
              };

              return (
                <li key={app.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{app.project_name ?? '-'}</p>
                    <p className="text-xs text-gray-500 truncate">{app.investor_email ?? '-'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(app.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.amount !== null && (
                      <span className="text-sm">{app.amount.toLocaleString('ru-RU')} ₽</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
