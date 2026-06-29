'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApplicationDetail, ApplicationStatus } from '@/types';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'На рассмотрении',
  reviewing: 'Изучается',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
  withdrawn: 'Отозвана',
};

const STATUS_VARIANTS: Record<ApplicationStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  reviewing: 'default',
  approved: 'default',
  rejected: 'destructive',
  cancelled: 'outline',
  withdrawn: 'outline',
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
      <div className="container mx-auto max-w-3xl py-8">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мои заявки</h1>
        <Button asChild variant="outline">
          <Link href="/catalog">← Каталог проектов</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Заявки носят ознакомительный характер. Сделки заключаются вне платформы. Доходность не
        гарантируется.
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Заявок пока нет.{' '}
            <Link href="/catalog" className="text-blue-600 hover:underline">
              Перейти в каталог
            </Link>
          </CardContent>
        </Card>
      ) : (
        applications.map((app) => (
          <Card key={app.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/deals/${app.project_id}`} className="hover:underline">
                      {app.project_name}
                    </Link>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(app.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[app.status]}>{STATUS_LABELS[app.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {app.amount !== null && (
                <p className="text-sm">
                  <span className="font-medium">Сумма:</span>{' '}
                  {app.amount.toLocaleString('ru-RU')} руб.
                </p>
              )}
              {app.message && (
                <p className="line-clamp-3 text-sm text-muted-foreground">{app.message}</p>
              )}
              {app.status === 'rejected' && app.rejection_reason && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Причина отклонения:</span>{' '}
                  {app.rejection_reason}
                </p>
              )}
              {app.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  disabled={withdrawingId === app.id}
                  onClick={() => handleWithdraw(app.id)}
                >
                  {withdrawingId === app.id ? 'Отзываем...' : 'Отозвать заявку'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
