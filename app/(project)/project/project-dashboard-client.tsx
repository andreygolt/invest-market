'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusTimeline } from '@/components/project/status-timeline';
import { buildChecklist } from '@/lib/project/checklist';
import type {
  ProjectDashboardData,
  ProjectStats,
  ProjectStatus,
  ProjectStatusLogEntry,
} from '@/types';

const STATUS_META: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-gray-100 text-gray-700 border-gray-200' },
  submitted: { label: 'На проверке', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  under_review: { label: 'На проверке', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  approved: { label: 'Одобрен', className: 'bg-green-100 text-green-700 border-green-200' },
  rejected: { label: 'Отклонён', className: 'bg-red-100 text-red-700 border-red-200' },
};

interface ProjectDashboardClientProps {
  project: ProjectDashboardData;
  docsCount: number;
  stats: ProjectStats | null;
  statusLog: ProjectStatusLogEntry[];
}

function ResubmitButton() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleResubmit() {
    setLoading(true);
    const res = await fetch('/api/project/submit', { method: 'POST' });
    if (res.ok) {
      router.refresh();
    } else {
      const { error } = (await res.json()) as { error: string };
      alert(error);
    }
    setLoading(false);
  }

  return (
    <Button onClick={handleResubmit} disabled={loading} variant="destructive" size="sm">
      {loading ? 'Отправка...' : 'Отправить на повторную проверку'}
    </Button>
  );
}

export default function ProjectDashboardClient({
  project,
  docsCount,
  stats,
  statusLog,
}: ProjectDashboardClientProps) {
  const checklist = buildChecklist(project, docsCount);
  const completedCount = Object.values(checklist).filter(Boolean).length;
  const status = STATUS_META[project.status];

  const steps = [
    {
      label: 'Анкета (секции 1-4)',
      done: checklist.questionnaire14,
      action: 'Заполнить',
      href: '/questionnaire',
    },
    {
      label: 'Анкета (секции 5-8)',
      done: checklist.questionnaire58,
      action: 'Заполнить',
      href: '/questionnaire/sections58',
    },
    {
      label: 'Документы загружены',
      done: checklist.hasDocuments,
      action: 'Загрузить',
      href: '/documents',
    },
    {
      label: 'Видео загружено',
      done: checklist.hasVideo,
      action: 'Загрузить',
      href: '/submit',
    },
    {
      label: 'Отправлен на модерацию',
      done: checklist.submitted,
      action: 'Отправить',
      href: '/submit',
    },
  ];

  const actions = [
    { label: 'Заполнить анкету', href: '/questionnaire', show: true },
    { label: 'Загрузить документы', href: '/documents', show: true },
    { label: 'Загрузить видео и отправить', href: '/submit', show: project.status === 'draft' },
    { label: 'Написать обновление', href: '/updates', show: project.status === 'approved' },
    { label: 'Коммерческие условия', href: '/commercial-terms', show: project.status === 'approved' },
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card>
          <CardHeader>
            <div className="mb-3">
              <Badge className={status.className} variant="outline">
                {status.label}
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-normal">{project.name}</h1>
          </CardHeader>
          {project.status === 'approved' && (
            <CardContent>
              <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Ваш проект одобрен и виден инвесторам.
              </div>
            </CardContent>
          )}
        </Card>

        {project.status === 'rejected' && (
          <div className="space-y-2 rounded-md border border-red-200 bg-red-50 p-4">
            <p className="font-semibold text-red-700">Проект отклонён</p>
            {project.rejection_reason && (
              <p className="text-sm text-red-600">
                <span className="font-medium">Причина: </span>
                {project.rejection_reason}
              </p>
            )}
            <p className="text-sm text-gray-600">
              Исправьте анкету и документы, затем отправьте проект на повторную проверку.
            </p>
            <ResubmitButton />
          </div>
        )}

        {project.status === 'approved' && stats && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Интерес инвесторов</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.views_count}</div>
                  <div className="mt-1 text-gray-500">Просмотров</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.unique_viewers}</div>
                  <div className="mt-1 text-gray-500">Уникальных зрителей</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.favorites_count}</div>
                  <div className="mt-1 text-gray-500">В избранном</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.applications.total}</div>
                  <div className="mt-1 text-gray-500">Заявок всего</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.applications.pending}</div>
                  <div className="mt-1 text-gray-500">На рассмотрении</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.applications.approved}</div>
                  <div className="mt-1 text-gray-500">Одобрено</div>
                </div>
                <div className="rounded-md border p-3 text-center">
                  <div className="text-2xl font-semibold">{stats.portfolio_count}</div>
                  <div className="mt-1 text-gray-500">В портфелях</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Чеклист шагов</CardTitle>
            <p className="text-sm text-gray-500">Выполнено {completedCount} из 5</p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {steps.map(step => (
                <li key={step.label} className="flex items-center justify-between gap-4 rounded-md border p-3">
                  <div className="flex items-center gap-3">
                    <span className={step.done ? 'font-semibold text-green-600' : 'text-gray-400'}>
                      {step.done ? '✓' : '○'}
                    </span>
                    <span className="text-sm font-medium">{step.label}</span>
                  </div>
                  {!step.done && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={step.href}>{step.action}</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {actions.filter(action => action.show).map(action => (
            <Link key={action.href} href={action.href}>
              <Card className="h-full transition-colors hover:bg-gray-50">
                <CardContent className="py-6">
                  <div className="text-sm font-semibold">{action.label}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card>
          <CardContent className="p-5">
            <h2 className="mb-4 text-sm font-semibold">История изменений статуса</h2>
            <StatusTimeline log={statusLog} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
