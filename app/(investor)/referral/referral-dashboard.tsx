'use client';

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Партнёрская программа</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Реферальный код, статистика приглашений и история вознаграждений
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Мой реферальный код</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Код</div>
              <div className="rounded-md border bg-gray-50 px-3 py-2 font-mono text-sm">
                {code ?? 'Код не создан'}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!code}
                onClick={() => void copyText(code ?? '', 'code')}
              >
                {copied === 'code' ? 'Скопировано' : 'Копировать код'}
              </Button>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase text-muted-foreground">Реферальная ссылка</div>
              <div className="rounded-md border bg-gray-50 px-3 py-2 font-mono text-sm">
                {inviteLink || 'Ссылка недоступна'}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!inviteLink}
                onClick={() => void copyText(inviteLink, 'link')}
              >
                {copied === 'link' ? 'Скопировано' : 'Копировать ссылку'}
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            Вознаграждения начисляются согласно условиям партнёрской программы. Фактические
            выплаты осуществляются вне платформы.
          </div>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Статистика рефералов</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{metric.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Рефералы</CardTitle>
            <div className="flex flex-wrap gap-2">
              {LEVEL_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={level === filter.value ? 'default' : 'outline'}
                  onClick={() => handleLevelChange(filter.value)}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Уровень</TableHead>
                <TableHead>Дата регистрации</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {referrals.map((referral) => (
                <TableRow key={referral.referee_id}>
                  <TableCell>{referral.masked_email}</TableCell>
                  <TableCell>{referral.level}</TableCell>
                  <TableCell>{formatDate(referral.joined_at)}</TableCell>
                </TableRow>
              ))}
              {referrals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-gray-500">
                    Рефералов пока нет
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Загрузка...' : `Показано ${referrals.length} из ${total}`}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!canGoBack || loading}
                onClick={() => handlePageChange(Math.max(offset - PAGE_SIZE, 0))}
              >
                Назад
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!canGoForward || loading}
                onClick={() => handlePageChange(offset + PAGE_SIZE)}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>
          Информация о вознаграждениях носит справочный характер. Платформа не осуществляет
          денежные переводы. Все выплаты производятся согласно отдельному договору вне платформы.
        </strong>
      </div>
    </div>
  );
}
