'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ReferralStats } from '@/types';

type ReferralLevelFilter = 'all' | '1' | '2' | '3';

type ReferralListItem = {
  referee_id: string;
  masked_email: string;
  level: 1 | 2 | 3;
  joined_at: string;
};

export type ReferralListResponse = {
  items: ReferralListItem[];
  total: number;
};

type ReferralDashboardProps = {
  appUrl: string;
  code: string | null;
  stats: ReferralStats;
  initialReferralList: ReferralListResponse;
};

const PAGE_SIZE = 20;

const LEVEL_FILTERS: Array<{ value: ReferralLevelFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3', label: '3' },
];

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU');
}

export function ReferralDashboard({
  appUrl,
  code,
  stats,
  initialReferralList,
}: ReferralDashboardProps) {
  const [level, setLevel] = useState<ReferralLevelFilter>('all');
  const [offset, setOffset] = useState(0);
  const [referrals, setReferrals] = useState(initialReferralList.items);
  const [total, setTotal] = useState(initialReferralList.total);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const inviteLink = useMemo(() => {
    if (!code) return '';
    return `${appUrl.replace(/\/$/, '')}/invite/${code}`;
  }, [appUrl, code]);

  const loadReferrals = useCallback(async (nextLevel: ReferralLevelFilter, nextOffset: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(nextOffset),
      });
      if (nextLevel !== 'all') params.set('level', nextLevel);

      const response = await fetch(`/api/referral/list?${params.toString()}`);
      if (!response.ok) return;

      const data = (await response.json()) as ReferralListResponse;
      setReferrals(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  async function copyText(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1500);
  }

  function handleLevelChange(nextLevel: ReferralLevelFilter) {
    setLevel(nextLevel);
    setOffset(0);
    void loadReferrals(nextLevel, 0);
  }

  function handlePageChange(nextOffset: number) {
    setOffset(nextOffset);
    void loadReferrals(level, nextOffset);
  }

  const metrics = [
    { label: 'Рефералы 1-го уровня', value: stats.level1_count },
    { label: 'Рефералы 2-го уровня', value: stats.level2_count },
    { label: 'Рефералы 3-го уровня', value: stats.level3_count },
    { label: 'Всего рефералов', value: stats.total_referrals },
    { label: 'Ожидает подтверждения', value: formatRub(stats.rewards_pending) },
    { label: 'Подтверждено', value: formatRub(stats.rewards_approved) },
    { label: 'Выплачено', value: formatRub(stats.rewards_paid) },
  ];

  const canGoBack = offset > 0;
  const canGoForward = offset + PAGE_SIZE < total;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Партнёрская программа</h1>
          <p className="mt-1 text-sm text-slate-500">
            Реферальный код, статистика приглашений и история вознаграждений
          </p>
        </div>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white">Мой реферальный код</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-600">Код</div>
              <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-300">
                {code ?? 'Код не создан'}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                disabled={!code}
                onClick={() => void copyText(code ?? '', 'code')}
              >
                {copied === 'code' ? 'Скопировано' : 'Копировать код'}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-slate-600">Реферальная ссылка</div>
              <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-300">
                {inviteLink || 'Ссылка недоступна'}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                disabled={!inviteLink}
                onClick={() => void copyText(inviteLink, 'link')}
              >
                {copied === 'link' ? 'Скопировано' : 'Копировать ссылку'}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <strong className="font-semibold">Важно:</strong> Вознаграждения начисляются согласно
            условиям партнёрской программы. Фактические выплаты осуществляются вне платформы.
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-white">Статистика рефералов</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="text-2xl font-bold text-white">{metric.value}</div>
                <div className="mt-1 text-xs text-slate-500">{metric.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-white">Рефералы</h2>
            <div className="flex flex-wrap gap-2">
              {LEVEL_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => handleLevelChange(filter.value)}
                  className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                    level === filter.value
                      ? 'bg-white text-black'
                      : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {filter.label === 'All' ? 'Все' : `Уровень ${filter.label}`}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Email
                  </th>
                  <th className="py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Уровень
                  </th>
                  <th className="py-2 text-left text-xs font-medium uppercase text-slate-500">
                    Дата
                  </th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-10 text-center text-slate-600">
                      Рефералов пока нет
                    </td>
                  </tr>
                ) : (
                  referrals.map((referral) => (
                    <tr key={referral.referee_id} className="border-b border-slate-800/50">
                      <td className="py-2.5 text-slate-300">{referral.masked_email}</td>
                      <td className="py-2.5 text-slate-400">{referral.level}</td>
                      <td className="py-2.5 text-slate-500">{formatDate(referral.joined_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500">
              {loading ? 'Загрузка...' : `Показано ${referrals.length} из ${total}`}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-400 hover:bg-slate-800"
                disabled={!canGoBack || loading}
                onClick={() => handlePageChange(Math.max(offset - PAGE_SIZE, 0))}
              >
                Назад
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-400 hover:bg-slate-800"
                disabled={!canGoForward || loading}
                onClick={() => handlePageChange(offset + PAGE_SIZE)}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </section>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <strong className="font-semibold">Важно:</strong> Информация о вознаграждениях носит
          справочный характер. Платформа не осуществляет денежные переводы. Все выплаты производятся
          согласно отдельному договору вне платформы.
        </div>
      </div>
    </div>
  );
}
