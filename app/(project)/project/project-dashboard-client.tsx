'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { StatusTimeline } from '@/components/project/status-timeline';
import { buildChecklist } from '@/lib/project/checklist';
import type {
  ProjectDashboardData,
  ProjectStats,
  ProjectStatus,
  ProjectStatusLogEntry,
} from '@/types';

const STATUS_META: Record<ProjectStatus, { label: string; className: string }> = {
  draft: { label: 'Черновик', className: 'bg-slate-800 text-slate-300 border-slate-700' },
  submitted: { label: 'На проверке', className: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  under_review: { label: 'На проверке', className: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  approved: { label: 'Одобрен', className: 'bg-emerald-900/50 text-emerald-300 border-emerald-800' },
  rejected: { label: 'Отклонён', className: 'bg-red-900/50 text-red-300 border-red-800' },
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
    <Button onClick={handleResubmit} disabled={loading} size="sm" className="bg-red-600 text-white hover:bg-red-700">
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
    <main className="min-h-screen bg-[#0a0a0a] px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="mb-3">
            <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <h1 className="text-3xl font-semibold text-white">{project.name}</h1>
          {project.status === 'approved' && (
            <div className="mt-6 rounded-md border border-emerald-800 bg-emerald-900/30 p-4 text-sm text-emerald-300">
              Ваш проект одобрен и виден инвесторам.
            </div>
          )}
        </div>

        {project.status === 'rejected' && (
          <div className="space-y-2 rounded-xl border border-red-800 bg-red-900/20 p-5">
            <p className="font-semibold text-red-400">Проект отклонён</p>
            {project.rejection_reason && (
              <p className="text-sm text-red-300">
                <span className="font-medium">Причина: </span>
                {project.rejection_reason}
              </p>
            )}
            <p className="text-sm text-slate-400">
              Исправьте анкету и документы, затем отправьте проект на повторную проверку.
            </p>
            <ResubmitButton />
          </div>
        )}

        {project.status === 'approved' && stats && (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-xl font-semibold text-white">Интерес инвесторов</h2>
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.views_count}</div>
                <div className="mt-1 text-slate-500">Просмотров</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.unique_viewers}</div>
                <div className="mt-1 text-slate-500">Уникальных зрителей</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.favorites_count}</div>
                <div className="mt-1 text-slate-500">В избранном</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.applications.total}</div>
                <div className="mt-1 text-slate-500">Заявок всего</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.applications.pending}</div>
                <div className="mt-1 text-slate-500">На рассмотрении</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.applications.approved}</div>
                <div className="mt-1 text-slate-500">Одобрено</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
                <div className="text-2xl font-semibold text-white">{stats.portfolio_count}</div>
                <div className="mt-1 text-slate-500">В портфелях</div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-1 text-xl font-semibold text-white">Чеклист шагов</h2>
          <p className="mb-4 text-sm text-slate-500">Выполнено {completedCount} из 5</p>
          <ul className="space-y-3">
            {steps.map(step => (
              <li key={step.label} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 p-3">
                <div className="flex items-center gap-3">
                  <span className={step.done ? 'font-semibold text-emerald-400' : 'text-slate-600'}>
                    {step.done ? '✓' : '○'}
                  </span>
                  <span className={`text-sm font-medium ${step.done ? 'text-slate-300' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
                {!step.done && (
                  <Button asChild size="sm" variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">
                    <Link href={step.href}>{step.action}</Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {actions.filter(action => action.show).map(action => (
            <Link key={action.href} href={action.href}>
              <div className="h-full rounded-xl border border-slate-800 bg-slate-900 px-5 py-6 transition-colors hover:border-slate-700 hover:bg-slate-800">
                <div className="text-sm font-semibold text-slate-300">{action.label}</div>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="mb-4 text-sm font-semibold text-white">История изменений статуса</h2>
          <StatusTimeline log={statusLog} />
        </div>
      </div>
    </main>
  );
}
