'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import type { AdminStats } from '@/types';

type AdminDashboardClientProps = {
  stats: AdminStats;
};

const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  submitted: 'border-blue-200 bg-blue-50 text-blue-800',
  approved: 'border-green-200 bg-green-50 text-green-800',
  rejected: 'border-red-200 bg-red-50 text-red-800',
};

const STATUS_BAR_CLASSES: Record<string, string> = {
  draft: 'bg-slate-400',
  submitted: 'bg-blue-500',
  approved: 'bg-green-500',
  rejected: 'bg-red-500',
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU');
}

function getPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

export function AdminDashboardClient({ stats }: AdminDashboardClientProps) {
  const router = useRouter();
  const projectStatuses = [
    { key: 'draft', label: 'draft', value: stats.projects.draft },
    { key: 'submitted', label: 'submitted', value: stats.projects.submitted },
    { key: 'approved', label: 'approved', value: stats.projects.approved },
    { key: 'rejected', label: 'rejected', value: stats.projects.rejected },
  ];

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Дашборд</h1>
          <p className="mt-1 text-sm text-muted-foreground">Сводная аналитика платформы</p>
        </div>
        <Button type="button" onClick={() => router.refresh()}>
          Обновить
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Всего проектов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.projects.total}</div>
            <p className="mt-1 text-sm text-slate-500">На модерации: {stats.projects.submitted}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Одобрено / Отклонено</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.projects.approved} / {stats.projects.rejected}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Всего пользователей</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.users.total}</div>
            <p className="mt-1 text-sm text-slate-500">Инвесторов: {stats.users.investor}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Заявки инвесторов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.applications.total}</div>
            <p className="mt-1 text-sm text-slate-500">Ожидают: {stats.applications.pending}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Зафиксировано инвестиций</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.portfolio.total_records}</div>
            <p className="mt-1 text-sm text-slate-500">записей</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Инвайты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.invites.used} / {stats.invites.total}
            </div>
            <p className="mt-1 text-sm text-slate-500">использовано</p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Проекты по статусам</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {projectStatuses.map((item) => {
            const percent = getPercent(item.value, stats.projects.total);
            return (
              <div key={item.key} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.label}</span>
                  <span className="text-slate-500">{item.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-100">
                  <div
                    className={`h-full ${STATUS_BAR_CLASSES[item.key]}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Последняя активность</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Проект</TableHead>
                <TableHead>Новый статус</TableHead>
                <TableHead>Дата</TableHead>
                <TableHead>Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recent_activity.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500">
                    Нет записей
                  </TableCell>
                </TableRow>
              ) : (
                stats.recent_activity.map((item) => (
                  <TableRow key={`${item.project_id}-${item.changed_at}`}>
                    <TableCell>{item.project_name ?? item.project_id}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={STATUS_BADGE_CLASSES[item.status] ?? STATUS_BADGE_CLASSES.draft}
                      >
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(item.changed_at)}</TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/moderation/${item.project_id}`}>Перейти</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
