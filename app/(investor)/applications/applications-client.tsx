'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
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
  pending:
    'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
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

export function ApplicationsClient() {
  const [applications, setApplications] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      fetch(`/api/investor/applications?investor_id=${user.id}`)
        .then((r) => r.json())
        .then((json) => setApplications(json.applications ?? []))
        .finally(() => setLoading(false));
    });
  }, []);

  async function handleWithdraw(applicationId: string) {
    if (!userId) return;
    setWithdrawingId(applicationId);
    try {
      const res = await fetch(`/api/investor/applications/${applicationId}?investor_id=${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setApplications((prev) =>
          prev.map((a) =>
            a.id === applicationId ? { ...a, status: 'withdrawn' as ApplicationStatus } : a
          )
        );
      }
    } finally {
      setWithdrawingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-slate-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">Мои заявки</h1>
          <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
            <Link href="/catalog">← Каталог</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <strong className="font-semibold">Важно:</strong> Заявки носят ознакомительный характер.
          Сделки заключаются вне платформы. Доходность не гарантируется.
        </div>

        {applications.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <p className="text-slate-500">
              Заявок пока нет.{' '}
              <Link href="/catalog" className="text-blue-600 hover:text-blue-700">
                Перейти в каталог
              </Link>
            </p>
          </div>
        ) : (
          applications.map((app) => (
            <div
              key={app.id}
              className="space-y-3 rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/deals/${app.project_id}`}
                    className="text-base font-semibold text-slate-900 hover:text-slate-700"
                  >
                    {app.project_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(app.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/applications/${app.id}`}
                    className="text-xs text-slate-500 hover:text-slate-700 underline"
                  >
                    Подробнее
                  </Link>
                  <span className={STATUS_CLASSES[app.status]}>{STATUS_LABELS[app.status]}</span>
                </div>
              </div>
              {app.amount !== null && (
                <p className="text-sm text-slate-700">
                  <span className="text-slate-500">Сумма:</span>{' '}
                  {app.amount.toLocaleString('ru-RU')} ₽
                </p>
              )}
              {app.message && (
                <p className="line-clamp-3 text-sm text-slate-600">{app.message}</p>
              )}
              {app.status === 'rejected' && app.rejection_reason && (
                <p className="text-sm text-slate-600">
                  <span className="text-slate-500">Причина отклонения:</span>{' '}
                  {app.rejection_reason}
                </p>
              )}
              {app.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-red-600 hover:text-red-700"
                  disabled={withdrawingId === app.id}
                  onClick={() => handleWithdraw(app.id)}
                >
                  {withdrawingId === app.id ? 'Отзываем...' : 'Отозвать заявку'}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
