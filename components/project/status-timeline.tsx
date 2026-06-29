'use client';

import type { ProjectStatusLogEntry } from '@/types';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Черновик', color: 'bg-slate-200 text-slate-700' },
  submitted: { label: 'Подано на проверку', color: 'bg-blue-100 text-blue-700' },
  under_review: { label: 'На проверке', color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Одобрен', color: 'bg-green-100 text-green-700' },
  rejected: { label: 'Отклонён', color: 'bg-red-100 text-red-700' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

interface Props {
  log: ProjectStatusLogEntry[];
}

export function StatusTimeline({ log }: Props) {
  if (log.length === 0) {
    return <p className="text-sm text-slate-400">История изменений статуса пока пуста.</p>;
  }

  return (
    <ol className="relative ml-3 space-y-6 border-l border-slate-200">
      {log.map((entry, index) => (
        <li key={entry.id} className="ml-6">
          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-xs font-bold text-slate-500">
            {index + 1}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              {entry.old_status && (
                <>
                  <StatusBadge status={entry.old_status} />
                  <span className="text-xs text-slate-400">→</span>
                </>
              )}
              <StatusBadge status={entry.new_status} />
            </div>
            <time className="text-xs text-slate-400">
              {new Date(entry.changed_at).toLocaleString('ru-RU')}
            </time>
          </div>
        </li>
      ))}
    </ol>
  );
}
