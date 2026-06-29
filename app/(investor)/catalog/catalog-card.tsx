import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { InvestorCatalogItem } from '@/types';

interface CatalogCardProps {
  item: InvestorCatalogItem;
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a_plus: 'Series A+',
};

function formatAmount(value: string | null) {
  if (!value) return null;

  const amount = Number(String(value).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return value;

  if (amount >= 1_000_000) {
    return `${Math.round(amount / 1_000_000)} млн ₽`;
  }

  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)} тыс ₽`;
  }

  return `${amount} ₽`;
}

function getScoreClass(score: number) {
  if (score >= 80) {
    return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
  }

  if (score >= 60) {
    return 'bg-amber-50 text-amber-700 border border-amber-200';
  }

  return 'bg-slate-100 text-slate-600 border border-slate-200';
}

export function CatalogCard({ item }: CatalogCardProps) {
  const amount = formatAmount(item.investment_ask);
  const score = item.ai_score;
  const showScore = score !== null;
  const stage = item.stage ? (STAGE_LABELS[item.stage] ?? item.stage) : null;

  return (
    <article className="h-full rounded-xl border border-slate-200 bg-white p-6 transition-all duration-200 hover:border-slate-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
          {item.industry ?? 'Отрасль'}
        </span>
        {showScore && (
          <span
            className={`rounded-md px-2 py-1 text-xs font-medium ${getScoreClass(score)}`}
          >
            AI {Math.round(score)}
          </span>
        )}
      </div>

      <div className="mt-6 min-h-[112px]">
        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-slate-900">
          {item.name}
        </h2>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-500">
          {item.short_description ?? item.description ?? 'Описание проекта пока не заполнено'}
        </p>
      </div>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600">
          {amount && (
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              {amount}
            </span>
          )}
          {stage && (
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              {stage}
            </span>
          )}
          {item.team_size && (
            <span className="flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {item.team_size}
            </span>
          )}
        </div>
      </div>

      <Button
        asChild
        variant="ghost"
        className="mt-6 h-auto p-0 text-slate-500 hover:bg-transparent hover:text-slate-900"
      >
        <Link href={`/deals/${item.id}`}>Открыть deal room →</Link>
      </Button>
    </article>
  );
}
