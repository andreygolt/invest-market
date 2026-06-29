'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'На проверке',
  approved: 'Одобрен',
  rejected: 'Отклонен',
};

const quickLinks = [
  { label: 'Модерация проектов', href: '/moderation' },
  { label: 'Заявки инвесторов', href: '/applications' },
  { label: 'Пользователи', href: '/users' },
  { label: 'Инвайты', href: '/invites' },
  { label: 'Реферальные вознаграждения', href: '/referral-rewards' },
  { label: 'Коммерческие условия', href: '/commercial-terms' },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU');
}

export function AdminDashboardClient({ stats }: AdminDashboardClientProps) {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ключевые метрики платформы</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Проекты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.projects.total}</div>
            <p className="mt-2 text-sm text-slate-500">
              Черновик: {stats.projects.draft} | На проверке: {stats.projects.submitted} | Одобрен:{' '}
              {stats.projects.approved} | Отклонен: {stats.projects.rejected}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Инвесторы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.users.investor}</div>
            <p className="mt-2 text-sm text-slate-500">всего инвесторов</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Заявки</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.applications.total}</div>
            <p className="mt-2 text-sm text-slate-500">
              Ожидают: {stats.applications.pending} | Одобрено: {stats.applications.approved} |
              Отклонено: {stats.applications.rejected}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Инвайты</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.invites.total}</div>
            <p className="mt-2 text-sm text-slate-500">использовано: {stats.invites.used}</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Пользователи по ролям</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span>Администраторы:</span>
              <span className="font-medium">{stats.users.admin}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Модераторы:</span>
              <span className="font-medium">{stats.users.moderator}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Менеджеры:</span>
              <span className="font-medium">{stats.users.manager}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Проекты:</span>
              <span className="font-medium">{stats.users.project}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Инвесторы:</span>
              <span className="font-medium">{stats.users.investor}</span>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2">
              <span>Всего:</span>
              <span className="font-medium">{stats.users.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Быстрые ссылки</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <Button key={link.href} asChild variant="outline" className="justify-start">
                <Link href={link.href}>{link.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Последние события</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.recent_activity.length === 0 ? (
            <p className="text-sm text-slate-500">Нет последних событий</p>
          ) : (
            <div className="space-y-3">
              {stats.recent_activity.map((item) => (
                <div
                  key={`${item.project_id}-${item.changed_at}`}
                  className="flex flex-wrap items-center gap-2 text-sm"
                >
                  <span className="text-slate-500">{formatDate(item.changed_at)}</span>
                  <span>{item.project_name ?? item.project_id}</span>
                  <span className="text-slate-400">-&gt;</span>
                  <Badge
                    variant="outline"
                    className={STATUS_BADGE_CLASSES[item.status] ?? STATUS_BADGE_CLASSES.draft}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
