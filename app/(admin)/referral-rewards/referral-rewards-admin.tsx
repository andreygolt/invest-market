'use client';

import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
import type { ReferralRewardStatus } from '@/types';

type RewardStatusFilter = 'all' | ReferralRewardStatus;

type ReferralRewardItem = {
  id: string;
  referrer_email: string;
  referee_email: string;
  level: 1 | 2 | 3;
  amount: number;
  status: ReferralRewardStatus;
};

export type ReferralRewardsResponse = {
  items: ReferralRewardItem[];
  total: number;
};

type ReferralRewardsAdminProps = {
  initialRewards: ReferralRewardsResponse;
};

const STATUS_FILTERS: Array<{ value: RewardStatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'pending' },
  { value: 'approved', label: 'approved' },
  { value: 'paid', label: 'paid' },
];

const STATUS_BADGE_CLASSES: Record<ReferralRewardStatus, string> = {
  pending: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  approved: 'border-blue-200 bg-blue-50 text-blue-800',
  paid: 'border-green-200 bg-green-50 text-green-800',
};

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

function nextStatus(status: ReferralRewardStatus): ReferralRewardStatus | null {
  if (status === 'pending') return 'approved';
  if (status === 'approved') return 'paid';
  return null;
}

function actionLabel(status: ReferralRewardStatus) {
  if (status === 'pending') return 'Подтвердить';
  if (status === 'approved') return 'Отметить выплаченным';
  return '';
}

export function ReferralRewardsAdmin({ initialRewards }: ReferralRewardsAdminProps) {
  const [status, setStatus] = useState<RewardStatusFilter>('all');
  const [rewards, setRewards] = useState(initialRewards.items);
  const [total, setTotal] = useState(initialRewards.total);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadRewards = useCallback(async (nextStatusFilter: RewardStatusFilter) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextStatusFilter !== 'all') params.set('status', nextStatusFilter);

      const query = params.toString();
      const response = await fetch(`/api/admin/referral-rewards${query ? `?${query}` : ''}`);
      if (!response.ok) return;

      const data = (await response.json()) as ReferralRewardsResponse;
      setRewards(data.items);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleStatusFilter(nextStatusFilter: RewardStatusFilter) {
    setStatus(nextStatusFilter);
    void loadRewards(nextStatusFilter);
  }

  async function handleUpdate(rewardId: string, targetStatus: ReferralRewardStatus) {
    setUpdatingId(rewardId);
    try {
      const response = await fetch(`/api/admin/referral-rewards/${rewardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (response.ok) {
        await loadRewards(status);
      }
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="container mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Реферальные вознаграждения</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Управление статусами начислений партнёрской программы
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-lg">Вознаграждения</CardTitle>
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={status === filter.value ? 'default' : 'outline'}
                  onClick={() => handleStatusFilter(filter.value)}
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
                <TableHead>Реферер</TableHead>
                <TableHead>Реферал</TableHead>
                <TableHead>Уровень</TableHead>
                <TableHead>Сумма</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rewards.map((reward) => {
                const targetStatus = nextStatus(reward.status);
                return (
                  <TableRow key={reward.id}>
                    <TableCell>{reward.referrer_email}</TableCell>
                    <TableCell>{reward.referee_email}</TableCell>
                    <TableCell>{reward.level}</TableCell>
                    <TableCell>{formatRub(reward.amount)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASSES[reward.status]}>
                        {reward.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {targetStatus ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingId === reward.id}
                          onClick={() => void handleUpdate(reward.id, targetStatus)}
                        >
                          {updatingId === reward.id ? 'Обновляем...' : actionLabel(reward.status)}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
              {rewards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                    Вознаграждений нет
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="text-sm text-muted-foreground">
            {loading ? 'Загрузка...' : `Всего записей: ${total}`}
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
