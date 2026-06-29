'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface CatalogFiltersProps {
  industries: string[];
  stages: string[];
  countries: string[];
  investmentTypes: string[];
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a_plus: 'Series A+',
};

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  equity: 'Акции (equity)',
  convertible_note: 'Конвертируемый займ',
  safe: 'SAFE',
  debt: 'Долг',
};

const ALL_VALUE = '_all_';

export function CatalogFilters({
  industries,
  stages,
  countries,
  investmentTypes,
}: CatalogFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== ALL_VALUE) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/catalog?${params.toString()}`);
    },
    [router, searchParams]
  );

  const currentSort = searchParams.get('sort') ?? 'newest';
  const currentIndustry = searchParams.get('industry') ?? '';
  const currentStage = searchParams.get('stage') ?? '';
  const currentCountry = searchParams.get('country') ?? '';
  const currentInvestmentType = searchParams.get('investment_type') ?? '';

  const hasFilters = currentIndustry || currentStage || currentCountry || currentInvestmentType;

  function clearFilters() {
    const params = new URLSearchParams();
    if (currentSort !== 'newest') params.set('sort', currentSort);
    router.push(`/catalog${params.size > 0 ? '?' + params.toString() : ''}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Сортировка</Label>
        <Select value={currentSort} onValueChange={(v) => updateParam('sort', v)}>
          <SelectTrigger className="mt-1">
            <SelectValue />
            <SelectContent>
              <SelectItem value="newest">По дате (новые)</SelectItem>
              <SelectItem value="score_desc">По AI-оценке</SelectItem>
              <SelectItem value="ask_asc">По сумме (возр.)</SelectItem>
            </SelectContent>
          </SelectTrigger>
        </Select>
      </div>

      {industries.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Отрасль</Label>
          <Select
            value={currentIndustry || ALL_VALUE}
            onValueChange={(v) => updateParam('industry', v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Все отрасли" />
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все отрасли</SelectItem>
                {industries.map((ind) => (
                  <SelectItem key={ind} value={ind}>
                    {ind}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
      )}

      {stages.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Стадия</Label>
          <Select
            value={currentStage || ALL_VALUE}
            onValueChange={(v) => updateParam('stage', v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Все стадии" />
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все стадии</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s] ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
      )}

      {countries.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Страна</Label>
          <Select
            value={currentCountry || ALL_VALUE}
            onValueChange={(v) => updateParam('country', v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Все страны" />
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все страны</SelectItem>
                {countries.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
      )}

      {investmentTypes.length > 0 && (
        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Тип инвестиций</Label>
          <Select
            value={currentInvestmentType || ALL_VALUE}
            onValueChange={(v) => updateParam('investment_type', v)}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Все типы" />
              <SelectContent>
                <SelectItem value={ALL_VALUE}>Все типы</SelectItem>
                {investmentTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {INVESTMENT_TYPE_LABELS[t] ?? t}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full">
          Сбросить фильтры
        </Button>
      )}
    </div>
  );
}
