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
    'rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400',
  reviewing:
    'rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400',
  approved:
    'rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400',
  rejected: 'rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400',
  cancelled: 'rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-500',
  withdrawn: 'rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-500',
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
      <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
        <p className="text-slate-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Мои заявки</h1>
          <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <Link href="/catalog">← Каталог</Link>
          </Button>
        </div>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <strong className="font-semibold">Важно:</strong> Заявки носят ознакомительный характер.
          Сделки заключаются вне платформы. Доходность не гарантируется.
        </div>

        {applications.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-slate-400">
              Заявок пока нет.{' '}
              <Link href="/catalog" className="text-blue-400 hover:text-blue-300">
                Перейти в каталог
              </Link>
            </p>
          </div>
        ) : (
          applications.map((app) => (
            <div
              key={app.id}
              className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/deals/${app.project_id}`}
                    className="text-base font-semibold text-white hover:text-slate-300"
                  >
                    {app.project_name}
                  </Link>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {new Date(app.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <span className={STATUS_CLASSES[app.status]}>{STATUS_LABELS[app.status]}</span>
              </div>
              {app.amount !== null && (
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">Сумма:</span>{' '}
                  {app.amount.toLocaleString('ru-RU')} ₽
                </p>
              )}
              {app.message && (
                <p className="line-clamp-3 text-sm text-slate-500">{app.message}</p>
              )}
              {app.status === 'rejected' && app.rejection_reason && (
                <p className="text-sm text-slate-500">
                  <span className="text-slate-400">Причина отклонения:</span>{' '}
                  {app.rejection_reason}
                </p>
              )}
              {app.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-0 text-red-400 hover:text-red-300"
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
