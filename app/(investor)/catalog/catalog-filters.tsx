'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
interface CatalogFiltersProps {
  industries: string[];
  stages: string[];
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a_plus: 'Series A+',
};

export function CatalogFilters({
  industries,
  stages,
}: CatalogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.push(`/catalog?${params.toString()}`);
    },
    [router, searchParams]
  );

  const currentSort = searchParams.get('sort') ?? 'updated_at_desc';
  const currentIndustry = searchParams.get('industry') ?? '';
  const currentStage = searchParams.get('stage') ?? '';

  return (
    <div className="flex gap-3 items-center mb-6 flex-wrap">
      <form method="GET" className="flex-1 min-w-48">
        {currentIndustry && <input type="hidden" name="industry" value={currentIndustry} />}
        {currentStage && <input type="hidden" name="stage" value={currentStage} />}
        {currentSort && <input type="hidden" name="sort" value={currentSort} />}
        <input
          type="text"
          name="q"
          defaultValue={searchParams.get('q') ?? ''}
          placeholder="Поиск по названию..."
          className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
        />
      </form>
      <select
        value={currentIndustry}
        onChange={(event) => updateParam('industry', event.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400"
      >
        <option value="">Все отрасли</option>
        {industries.map((industry) => (
          <option key={industry} value={industry}>
            {industry}
          </option>
        ))}
      </select>
      <select
        value={currentStage}
        onChange={(event) => updateParam('stage', event.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400"
      >
        <option value="">Все стадии</option>
        {stages.map((stage) => (
          <option key={stage} value={stage}>
            {STAGE_LABELS[stage] ?? stage}
          </option>
        ))}
      </select>
      <select
        value={currentSort}
        onChange={(event) => updateParam('sort', event.target.value)}
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400"
      >
        <option value="updated_at_desc">Новые сначала</option>
        <option value="ai_score_desc">По AI Score</option>
        <option value="min_investment_asc">По мин. инвестиции</option>
      </select>
    </div>
  );
}
