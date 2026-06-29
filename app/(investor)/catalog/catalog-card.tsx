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

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  equity: 'Equity',
  convertible_note: 'Conv. Note',
  safe: 'SAFE',
  debt: 'Долг',
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
    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  }

  return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
}

export function CatalogCard({ item }: CatalogCardProps) {
  const amount = formatAmount(item.investment_ask);
  const score = item.ai_score;
  const showScore = score !== null && score >= 60;
  const stage = item.stage ? (STAGE_LABELS[item.stage] ?? item.stage) : null;
  const investmentType = item.investment_type
    ? (INVESTMENT_TYPE_LABELS[item.investment_type] ?? item.investment_type)
    : null;

  return (
    <article className="h-full rounded-xl border border-slate-800 bg-slate-900 p-6 transition-all duration-200 hover:border-slate-600 hover:shadow-lg hover:shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">
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
        <h2 className="line-clamp-2 text-lg font-semibold leading-tight text-white">
          {item.name}
        </h2>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">
          {item.short_description ?? item.description ?? 'Описание проекта пока не заполнено'}
        </p>
      </div>

      <div className="mt-5 border-t border-slate-800 pt-5">
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-300">
          {amount && <span>💰 {amount}</span>}
          {stage && <span>📈 {stage}</span>}
          {item.team_size && <span>👥 {item.team_size}</span>}
          {!amount && investmentType && <span>{investmentType}</span>}
        </div>
      </div>

      <Button
        asChild
        variant="ghost"
        className="mt-6 h-auto p-0 text-slate-400 hover:bg-transparent hover:text-white"
      >
        <Link href={`/deals/${item.id}`}>Открыть deal room →</Link>
      </Button>
    </article>
  );
}
