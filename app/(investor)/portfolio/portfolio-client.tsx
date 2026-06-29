'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
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

const STATUS_CLASSES: Record<PortfolioDealStatus, string> = {
  active: 'rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400',
  exited: 'rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs text-blue-400',
  written_off: 'rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400',
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
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-500">Загрузка портфеля...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Мой портфель</h1>
          <Button asChild className="bg-white text-black hover:bg-slate-200">
            <Link href="/portfolio/add">+ Добавить инвестицию</Link>
          </Button>
        </div>

        {/* Дисклеймер */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <strong className="font-semibold">Дисклеймер:</strong> Данный раздел предназначен для учёта фактов инвестирования,
          совершённых вне платформы. Платформа не является организатором сделок, не принимает
          денежные средства и не несёт ответственности за инвестиционные решения. Прошлые результаты
          не гарантируют будущих. Инвестирование в стартапы сопряжено с риском полной потери вложений.
        </div>

        {/* Статистика */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-2xl font-bold text-white">{fmt(stats.total_invested)} ₽</div>
              <div className="text-xs text-slate-500 mt-1">Всего инвестировано</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-2xl font-bold text-white">{stats.total_entries}</div>
              <div className="text-xs text-slate-500 mt-1">Позиций в портфеле</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="text-2xl font-bold text-white">{stats.total_active}</div>
              <div className="text-xs text-slate-500 mt-1">
                Активных · {stats.total_exited} выходов · {stats.total_written_off} списано
              </div>
            </div>
            {stats.total_exit_amount > 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-2xl font-bold text-white">{fmt(stats.total_exit_amount)} ₽</div>
                <div className="text-xs text-slate-500 mt-1">Получено при выходах</div>
              </div>
            )}
          </div>
        )}

        {/* Список позиций */}
        {portfolio.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-slate-400">В портфеле пока нет записей.</p>
            <p className="text-slate-600 text-sm mt-2">
              Зафиксируйте инвестицию со страницы проекта или нажмите «Добавить инвестицию».
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {portfolio.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/deals/${entry.project_id}`}
                      className="text-base font-semibold text-white hover:text-slate-300"
                    >
                      {entry.project_name}
                    </Link>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      <span className={STATUS_CLASSES[entry.deal_status]}>
                        {STATUS_LABELS[entry.deal_status]}
                      </span>
                      {entry.project_industry && (
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                          {entry.project_industry}
                        </span>
                      )}
                      {entry.project_stage && (
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                          {entry.project_stage}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-white">{fmt(entry.amount_invested)} ₽</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {INSTRUMENT_LABELS[entry.instrument] ?? entry.instrument}
                    </div>
                    <div className="text-xs text-slate-600">{formatDate(entry.date_invested)}</div>
                  </div>
                </div>
                {entry.exit_amount !== null && entry.deal_status === 'exited' && (
                  <div className="mt-3 text-sm text-slate-300">
                    <span className="text-slate-500">Получено при выходе: </span>
                    <span className="font-medium text-white">{fmt(entry.exit_amount)} ₽</span>
                  </div>
                )}
                {entry.notes && (
                  <p className="mt-3 text-sm text-slate-500">{entry.notes}</p>
                )}
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <select
                    className="text-sm border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-300"
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
                    variant="ghost"
                    size="sm"
                    className="text-red-400 hover:text-red-300"
                    disabled={deletingId === entry.id}
                    onClick={() => void handleDelete(entry.id)}
                  >
                    {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
