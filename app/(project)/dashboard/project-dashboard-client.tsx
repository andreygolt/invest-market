'use client';

import Link from 'next/link';
import { Disclaimer } from '@/components/disclaimer';
import { StatusTimeline } from '@/components/project/status-timeline';
import type { ProjectStatusLogEntry } from '@/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'bg-slate-100 text-slate-700' },
  submitted: { label: 'На модерации', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Опубликован', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонён', color: 'bg-red-100 text-red-700' },
  ai_review: { label: 'AI-анализ', color: 'bg-blue-100 text-blue-700' },
};

interface RecentUpdate {
  id: string;
  title: string;
  created_at: string;
  ai_summary?: string | null;
}

interface ProjectDashboardClientProps {
  project: {
    id: string;
    name: string;
    status: string;
    created_at: string;
    category?: string | null;
    short_description?: string | null;
  } | null;
  viewsCount: number;
  applicationsCount: number;
  recentUpdates: RecentUpdate[];
  statusLog?: ProjectStatusLogEntry[];
}

export function ProjectDashboardClient({
  project,
  viewsCount,
  applicationsCount,
  recentUpdates,
  statusLog = [],
}: ProjectDashboardClientProps) {
  if (!project) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="mb-4 text-xl font-semibold">Проект не найден</h1>
        <p className="mb-6 text-sm text-slate-500">
          У вашего аккаунта нет зарегистрированного проекта.
        </p>
        <Link
          href="/questionnaire"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm text-white"
        >
          Заполнить анкету
        </Link>
      </div>
    );
  }

  const statusMeta = STATUS_LABELS[project.status] ?? {
    label: project.status,
    color: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.category && <p className="mt-1 text-sm text-slate-500">{project.category}</p>}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusMeta.color}`}>
          {statusMeta.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-5">
          <p className="text-3xl font-bold">{viewsCount}</p>
          <p className="mt-1 text-sm text-slate-500">Просмотров deal room</p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-3xl font-bold">{applicationsCount}</p>
          <p className="mt-1 text-sm text-slate-500">Заявок от инвесторов</p>
        </div>
      </div>

      <Disclaimer />

      <div className="rounded-lg border p-5">
        <h2 className="mb-3 text-sm font-semibold">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          {(project.status === 'draft' || project.status === 'rejected') && (
            <Link href="/questionnaire" className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">
              Редактировать анкету
            </Link>
          )}
          {project.status === 'draft' && (
            <Link
              href="/submit"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-700"
            >
              Отправить на модерацию
            </Link>
          )}
          {project.status === 'approved' && (
            <Link href="/updates" className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">
              Опубликовать обновление
            </Link>
          )}
          <Link href="/documents" className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">
            Документы
          </Link>
        </div>
      </div>

      {recentUpdates.length > 0 && (
        <div className="rounded-lg border p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Последние обновления</h2>
            <Link href="/updates" className="text-xs text-slate-500 hover:underline">
              Все обновления
            </Link>
          </div>
          <ul className="space-y-3">
            {recentUpdates.map((update) => (
              <li key={update.id} className="text-sm">
                <p className="font-medium">{update.title}</p>
                {update.ai_summary && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{update.ai_summary}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {new Date(update.created_at).toLocaleDateString('ru-RU')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border p-5">
        <h2 className="mb-4 text-sm font-semibold">История изменений статуса</h2>
        <StatusTimeline log={statusLog} />
      </div>
    </div>
  );
}
