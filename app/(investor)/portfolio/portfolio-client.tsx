'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PortfolioDetail, PortfolioStats, PortfolioDealStatus } from '@/types';

const MOCK_INVESTOR_ID = 'demo-investor-id';

const INSTRUMENT_LABELS: Record<string, string> = {
  equity: 'Акции (Equity)',
  convertible_note: 'Конвертируемый займ',
  safe: 'SAFE',
  debt: 'Долг',
  other: 'Другое',
};

const STATUS_LABELS: Record<PortfolioDealStatus, string> = {
  active: 'Активная',
  exited: 'Выход',
  written_off: 'Списана',
};

const STATUS_VARIANTS: Record<PortfolioDealStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  exited: 'secondary',
  written_off: 'destructive',
};

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU');
}

export function PortfolioClient() {
  const [portfolio, setPortfolio] = useState<PortfolioDetail[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const investorId = MOCK_INVESTOR_ID;

  const loadPortfolio = useCallback(async () => {
    try {
      const res = await fetch(`/api/investor/portfolio?investor_id=${investorId}`);
      if (!res.ok) throw new Error('Ошибка загрузки портфеля');
      const data = (await res.json()) as { portfolio: PortfolioDetail[]; stats: PortfolioStats };
      setPortfolio(data.portfolio);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }, [investorId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPortfolio();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadPortfolio]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/investor/portfolio/${id}?investor_id=${investorId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      setPortfolio((prev) => prev.filter((e) => e.id !== id));
      void loadPortfolio();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusChange(id: string, deal_status: PortfolioDealStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/investor/portfolio/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: investorId, deal_status }),
      });
      if (!res.ok) throw new Error('Ошибка обновления');
      const updated = (await res.json()) as PortfolioDetail;
      setPortfolio((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      void loadPortfolio();
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Загрузка портфеля...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мой портфель</h1>
        <Button asChild>
          <Link href="/portfolio/add">+ Добавить инвестицию</Link>
        </Button>
      </div>

      {/* Дисклеймер */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Дисклеймер:</strong> Данный раздел предназначен для учёта фактов инвестирования,
        совершённых вне платформы. Платформа не является организатором сделок, не принимает
        денежные средства и не несёт ответственности за инвестиционные решения. Прошлые результаты
        не гарантируют будущих. Инвестирование в стартапы сопряжено с риском полной потери вложений.
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{fmt(stats.total_invested)} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">Всего инвестировано</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_entries}</div>
              <div className="text-xs text-muted-foreground mt-1">Позиций в портфеле</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_active}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Активных · {stats.total_exited} выходов · {stats.total_written_off} списано
              </div>
            </CardContent>
          </Card>
          {stats.total_exit_amount > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{fmt(stats.total_exit_amount)} ₽</div>
                <div className="text-xs text-muted-foreground mt-1">Получено при выходах</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Список позиций */}
      {portfolio.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground py-12">
            <p>В портфеле пока нет записей.</p>
            <p className="text-sm mt-2">
              Зафиксируйте инвестицию со страницы проекта или нажмите «Добавить инвестицию».
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {portfolio.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">
                      <Link
                        href={`/deals/${entry.project_id}`}
                        className="hover:underline"
                      >
                        {entry.project_name}
                      </Link>
                    </CardTitle>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant={STATUS_VARIANTS[entry.deal_status]}>
                        {STATUS_LABELS[entry.deal_status]}
                      </Badge>
                      {entry.project_industry && (
                        <Badge variant="outline">{entry.project_industry}</Badge>
                      )}
                      {entry.project_stage && (
                        <Badge variant="outline">{entry.project_stage}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{fmt(entry.amount_invested)} ₽</div>
                    <div className="text-xs text-muted-foreground">
                      {INSTRUMENT_LABELS[entry.instrument] ?? entry.instrument}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(entry.date_invested)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {entry.exit_amount !== null && entry.deal_status === 'exited' && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Получено при выходе: </span>
                    <span className="font-medium">{fmt(entry.exit_amount)} ₽</span>
                  </div>
                )}
                {entry.notes && (
                  <p className="text-sm text-muted-foreground">{entry.notes}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-background"
                    value={entry.deal_status}
                    disabled={updatingId === entry.id}
                    onChange={(e) =>
                      void handleStatusChange(entry.id, e.target.value as PortfolioDealStatus)
                    }
                  >
                    <option value="active">Активная</option>
                    <option value="exited">Выход</option>
                    <option value="written_off">Списана</option>
                  </select>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === entry.id}
                    onClick={() => void handleDelete(entry.id)}
                  >
                    {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
