# ТЗ T8 — Закрытый каталог инвестора с фильтрами и сортировкой

**Дата:** 2026-06-27
**Зависимости:** T7 выполнен (проекты переходят в статус `approved`)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать Deal Room (детальная карточка проекта) — это T9
- Не делать заявку инвестора — это T10
- Не делать избранное/заметки — это T11
- Не делать калькулятор доходности — это T12
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t7.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- NO новых npm-зависимостей

---

## Контекст

После T7 проекты со статусом `approved` готовы к показу инвесторам.
Инвестор (роль `investor`) открывает закрытый каталог — видит карточки одобренных проектов.
Может фильтровать по отрасли, стадии, стране, типу инвестиций.
Может сортировать по дате или AI-оценке.
Нажимает на карточку → переходит в Deal Room (T9).

**Данные для каталога:**
- `projects` — `id`, `name`, `status`, `created_at`
- `project_questionnaire` секция `s1` — `industry`, `stage`, `country`, `city`, `description`
- `project_questionnaire` секция `s6` — `investment_ask`, `investment_type`, `valuation_pre_money`
- `ai_reports` — `ai_score`, `summary` (если `status = 'done'`)

**Дисклеймер обязателен** в каталоге: платформа не является брокером, не гарантирует доходность.

---

## Шаг 1 — Миграция: view для каталога инвестора

Создать `supabase/migrations/006_investor_catalog_view.sql`:

```sql
-- 006_investor_catalog_view.sql
-- Денормализованный view для каталога инвестора.
-- Показывает только approved проекты с данными из анкеты и AI-анализа.

CREATE OR REPLACE VIEW v_investor_catalog AS
SELECT
  p.id,
  p.name,
  p.created_at,
  p.updated_at,
  qs1.answers->>'industry'       AS industry,
  qs1.answers->>'stage'          AS stage,
  qs1.answers->>'country'        AS country,
  qs1.answers->>'city'           AS city,
  qs1.answers->>'description'    AS description,
  qs6.answers->>'investment_ask' AS investment_ask,
  qs6.answers->>'investment_type' AS investment_type,
  qs6.answers->>'valuation_pre_money' AS valuation_pre_money,
  CASE
    WHEN ar.status = 'done' THEN (ar.report->>'ai_score')::numeric
    ELSE NULL
  END AS ai_score,
  CASE
    WHEN ar.status = 'done' THEN ar.report->>'summary'
    ELSE NULL
  END AS ai_summary
FROM projects p
LEFT JOIN project_questionnaire qs1
  ON qs1.project_id = p.id AND qs1.section = 's1'
LEFT JOIN project_questionnaire qs6
  ON qs6.project_id = p.id AND qs6.section = 's6'
LEFT JOIN ai_reports ar
  ON ar.project_id = p.id
WHERE p.status = 'approved';

-- View не поддерживает RLS напрямую.
-- Доступ контролируется через API-роут (admin client).
-- В будущем можно добавить security_invoker=true.
```

---

## Шаг 2 — TypeScript тип для каталога

Добавить в `types/index.ts` в конец файла:

```typescript
export interface InvestorCatalogItem {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  industry: string | null;
  stage: ProjectStage | null;
  country: string | null;
  city: string | null;
  description: string | null;
  investment_ask: string | null;
  investment_type: QS6Answers['investment_type'] | null;
  valuation_pre_money: string | null;
  ai_score: number | null;
  ai_summary: string | null;
}

export type CatalogSortOrder = 'newest' | 'score_desc' | 'ask_asc';
```

---

## Шаг 3 — API: каталог проектов для инвестора

Создать `app/api/investor/catalog/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorCatalogItem, CatalogSortOrder } from '@/types';

// GET /api/investor/catalog
// Query params (все необязательны):
//   industry=FinTech
//   stage=seed
//   country=Russia
//   investment_type=equity
//   sort=newest|score_desc|ask_asc
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const filterIndustry = searchParams.get('industry') ?? '';
  const filterStage = searchParams.get('stage') ?? '';
  const filterCountry = searchParams.get('country') ?? '';
  const filterInvestmentType = searchParams.get('investment_type') ?? '';
  const sort = (searchParams.get('sort') ?? 'newest') as CatalogSortOrder;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('v_investor_catalog')
    .select('*');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items = (data ?? []) as InvestorCatalogItem[];

  // Фильтрация
  if (filterIndustry) {
    items = items.filter(
      (item) => item.industry?.toLowerCase() === filterIndustry.toLowerCase()
    );
  }
  if (filterStage) {
    items = items.filter((item) => item.stage === filterStage);
  }
  if (filterCountry) {
    items = items.filter(
      (item) => item.country?.toLowerCase() === filterCountry.toLowerCase()
    );
  }
  if (filterInvestmentType) {
    items = items.filter((item) => item.investment_type === filterInvestmentType);
  }

  // Сортировка
  if (sort === 'score_desc') {
    items = items.sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  } else if (sort === 'ask_asc') {
    items = items.sort((a, b) => {
      const aAsk = parseFloat((a.investment_ask ?? '').replace(/\D/g, '')) || 0;
      const bAsk = parseFloat((b.investment_ask ?? '').replace(/\D/g, '')) || 0;
      return aAsk - bAsk;
    });
  } else {
    // newest (default)
    items = items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return NextResponse.json({ items, total: items.length });
}
```

---

## Шаг 4 — API: список уникальных значений для фильтров

Создать `app/api/investor/catalog/filters/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorCatalogItem } from '@/types';

// GET /api/investor/catalog/filters
// Возвращает уникальные значения для построения фильтров в UI.
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('v_investor_catalog')
    .select('industry, stage, country, investment_type');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data ?? []) as Pick<
    InvestorCatalogItem,
    'industry' | 'stage' | 'country' | 'investment_type'
  >[];

  const unique = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== '')];

  return NextResponse.json({
    industries: unique(items.map((i) => i.industry)),
    stages: unique(items.map((i) => i.stage)),
    countries: unique(items.map((i) => i.country)),
    investment_types: unique(items.map((i) => i.investment_type)),
  });
}
```

---

## Шаг 5 — UI: клиентский компонент фильтров

Создать `app/(investor)/catalog/catalog-filters.tsx`:

```typescript
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
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">По дате (новые)</SelectItem>
            <SelectItem value="score_desc">По AI-оценке</SelectItem>
            <SelectItem value="ask_asc">По сумме (возр.)</SelectItem>
          </SelectContent>
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
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все отрасли</SelectItem>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
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
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все стадии</SelectItem>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
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
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все страны</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
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
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VALUE}>Все типы</SelectItem>
              {investmentTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {INVESTMENT_TYPE_LABELS[t] ?? t}
                </SelectItem>
              ))}
            </SelectContent>
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
```

---

## Шаг 6 — UI: карточка проекта в каталоге

Создать `app/(investor)/catalog/catalog-card.tsx`:

```typescript
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export function CatalogCard({ item }: CatalogCardProps) {
  return (
    <Link href={`/deals/${item.id}`} className="block group">
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-tight line-clamp-2">
              {item.name}
            </CardTitle>
            {item.ai_score !== null && (
              <Badge variant="outline" className="shrink-0 text-xs">
                AI {item.ai_score}/10
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {item.stage && (
              <Badge variant="secondary" className="text-xs">
                {STAGE_LABELS[item.stage] ?? item.stage}
              </Badge>
            )}
            {item.investment_type && item.investment_type !== '' && (
              <Badge variant="outline" className="text-xs">
                {INVESTMENT_TYPE_LABELS[item.investment_type] ?? item.investment_type}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {item.description && (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {item.description}
            </p>
          )}
          <div className="text-xs text-muted-foreground space-y-1">
            {item.industry && (
              <p>
                <span className="font-medium">Отрасль:</span> {item.industry}
              </p>
            )}
            {(item.country || item.city) && (
              <p>
                <span className="font-medium">Локация:</span>{' '}
                {[item.city, item.country].filter(Boolean).join(', ')}
              </p>
            )}
            {item.investment_ask && (
              <p>
                <span className="font-medium">Запрос:</span> {item.investment_ask}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
```

---

## Шаг 7 — UI: страница каталога инвестора (серверный компонент)

Создать `app/(investor)/catalog/page.tsx`:

```typescript
import { Suspense } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorCatalogItem } from '@/types';
import { CatalogFilters } from './catalog-filters';
import { CatalogCard } from './catalog-card';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: {
    industry?: string;
    stage?: string;
    country?: string;
    investment_type?: string;
    sort?: string;
  };
}

type CatalogSortOrder = 'newest' | 'score_desc' | 'ask_asc';

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

async function getCatalogData(searchParams: PageProps['searchParams']) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('v_investor_catalog')
    .select('*');

  if (error || !data) return { items: [], filters: { industries: [], stages: [], countries: [], investmentTypes: [] } };

  let items = data as InvestorCatalogItem[];

  // Собираем уникальные значения для фильтров из всех данных (до фильтрации)
  const unique = <T>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== '' as unknown as T))];

  const filters = {
    industries: unique(items.map((i) => i.industry)),
    stages: unique(items.map((i) => i.stage)),
    countries: unique(items.map((i) => i.country)),
    investmentTypes: unique(items.map((i) => i.investment_type)),
  };

  // Фильтрация
  if (searchParams.industry) {
    items = items.filter(
      (item) => item.industry?.toLowerCase() === searchParams.industry!.toLowerCase()
    );
  }
  if (searchParams.stage) {
    items = items.filter((item) => item.stage === searchParams.stage);
  }
  if (searchParams.country) {
    items = items.filter(
      (item) => item.country?.toLowerCase() === searchParams.country!.toLowerCase()
    );
  }
  if (searchParams.investment_type) {
    items = items.filter((item) => item.investment_type === searchParams.investment_type);
  }

  // Сортировка
  const sort = (searchParams.sort ?? 'newest') as CatalogSortOrder;
  if (sort === 'score_desc') {
    items = items.sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
  } else if (sort === 'ask_asc') {
    items = items.sort((a, b) => {
      const aAsk = parseFloat((a.investment_ask ?? '').replace(/\D/g, '')) || 0;
      const bAsk = parseFloat((b.investment_ask ?? '').replace(/\D/g, '')) || 0;
      return aAsk - bAsk;
    });
  } else {
    items = items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  return { items, filters };
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const { items, filters } = await getCatalogData(searchParams);

  const activeFilters = [
    searchParams.industry,
    searchParams.stage ? (STAGE_LABELS[searchParams.stage] ?? searchParams.stage) : null,
    searchParams.country,
    searchParams.investment_type
      ? (INVESTMENT_TYPE_LABELS[searchParams.investment_type] ?? searchParams.investment_type)
      : null,
  ].filter(Boolean);

  return (
    <div className="container mx-auto py-8 max-w-7xl">
      {/* Дисклеймер */}
      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Важно:</strong> Платформа не является брокером или инвестиционным советником.
        Информация носит ознакомительный характер и не является офертой.
        Платформа не гарантирует доходность и не несёт ответственности за результаты инвестиций.
        Сделки заключаются вне платформы. Инвестирование сопряжено с риском потери вложенных средств.
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">Каталог проектов</h1>
        <p className="text-muted-foreground mt-1">
          Закрытый каталог для аккредитованных инвесторов
        </p>
      </div>

      <div className="flex gap-8">
        {/* Фильтры */}
        <aside className="w-56 shrink-0">
          <Suspense>
            <CatalogFilters
              industries={filters.industries as string[]}
              stages={filters.stages as string[]}
              countries={filters.countries as string[]}
              investmentTypes={filters.investmentTypes as string[]}
            />
          </Suspense>
        </aside>

        {/* Список проектов */}
        <main className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {activeFilters.length > 0
                ? `${items.length} проектов по фильтрам: ${activeFilters.join(', ')}`
                : `${items.length} проектов`}
            </p>
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Проекты не найдены</p>
              <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <CatalogCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
```

---

## Шаг 8 — Layout для investor-раздела

Создать `app/(investor)/layout.tsx`:

```typescript
export default function InvestorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold">Invest Market</span>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <a href="/catalog" className="hover:text-foreground">Каталог</a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

---

## Шаг 9 — Тесты

Создать `__tests__/t8.test.ts`:

```typescript
import type { InvestorCatalogItem, CatalogSortOrder } from '@/types';

const makeItem = (overrides: Partial<InvestorCatalogItem> = {}): InvestorCatalogItem => ({
  id: 'p-1',
  name: 'Test Project',
  created_at: '2026-06-27T00:00:00Z',
  updated_at: '2026-06-27T00:00:00Z',
  industry: 'FinTech',
  stage: 'seed',
  country: 'Russia',
  city: 'Moscow',
  description: 'Test description',
  investment_ask: '5000000',
  investment_type: 'equity',
  valuation_pre_money: '20000000',
  ai_score: 7,
  ai_summary: 'Strong team, clear market',
  ...overrides,
});

describe('T8 catalog filtering', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ id: 'p-1', industry: 'FinTech', stage: 'seed', country: 'Russia', investment_type: 'equity' }),
    makeItem({ id: 'p-2', industry: 'HealthTech', stage: 'pre_seed', country: 'Kazakhstan', investment_type: 'safe' }),
    makeItem({ id: 'p-3', industry: 'FinTech', stage: 'series_a_plus', country: 'Russia', investment_type: 'equity' }),
  ];

  it('filters by industry', () => {
    const result = items.filter(
      (i) => i.industry?.toLowerCase() === 'fintech'
    );
    expect(result).toHaveLength(2);
  });

  it('filters by stage', () => {
    const result = items.filter((i) => i.stage === 'seed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-1');
  });

  it('filters by country', () => {
    const result = items.filter(
      (i) => i.country?.toLowerCase() === 'russia'
    );
    expect(result).toHaveLength(2);
  });

  it('filters by investment_type', () => {
    const result = items.filter((i) => i.investment_type === 'safe');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-2');
  });

  it('combined filter: industry + country', () => {
    const result = items
      .filter((i) => i.industry?.toLowerCase() === 'fintech')
      .filter((i) => i.country?.toLowerCase() === 'russia');
    expect(result).toHaveLength(2);
  });

  it('no match returns empty array', () => {
    const result = items.filter((i) => i.industry?.toLowerCase() === 'biotech');
    expect(result).toHaveLength(0);
  });
});

describe('T8 catalog sorting', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ id: 'p-1', created_at: '2026-06-25T00:00:00Z', ai_score: 6, investment_ask: '10000000' }),
    makeItem({ id: 'p-2', created_at: '2026-06-27T00:00:00Z', ai_score: 9, investment_ask: '2000000' }),
    makeItem({ id: 'p-3', created_at: '2026-06-26T00:00:00Z', ai_score: 7, investment_ask: '5000000' }),
  ];

  it('sort newest: most recent first', () => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });

  it('sort score_desc: highest AI score first', () => {
    const sorted = [...items].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });

  it('sort ask_asc: smallest investment ask first', () => {
    const sorted = [...items].sort((a, b) => {
      const aAsk = parseFloat((a.investment_ask ?? '').replace(/\D/g, '')) || 0;
      const bAsk = parseFloat((b.investment_ask ?? '').replace(/\D/g, '')) || 0;
      return aAsk - bAsk;
    });
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });
});

describe('T8 InvestorCatalogItem type', () => {
  it('all required fields are present', () => {
    const item = makeItem();
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.created_at).toBe('string');
  });

  it('nullable fields can be null', () => {
    const item = makeItem({
      industry: null,
      stage: null,
      country: null,
      ai_score: null,
      ai_summary: null,
      investment_type: null,
    });
    expect(item.industry).toBeNull();
    expect(item.ai_score).toBeNull();
  });

  it('ai_score is numeric when present', () => {
    const item = makeItem({ ai_score: 8 });
    expect(typeof item.ai_score).toBe('number');
    expect(item.ai_score).toBeGreaterThanOrEqual(1);
    expect(item.ai_score).toBeLessThanOrEqual(10);
  });
});

describe('T8 catalog sort orders', () => {
  const validSorts: CatalogSortOrder[] = ['newest', 'score_desc', 'ask_asc'];

  it('all valid sort orders are defined', () => {
    expect(validSorts).toHaveLength(3);
    expect(validSorts).toContain('newest');
    expect(validSorts).toContain('score_desc');
    expect(validSorts).toContain('ask_asc');
  });

  it('default sort is newest', () => {
    const sort: CatalogSortOrder = 'newest';
    expect(sort).toBe('newest');
  });
});

describe('T8 unique filter values extraction', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ industry: 'FinTech', stage: 'seed', country: 'Russia' }),
    makeItem({ industry: 'FinTech', stage: 'pre_seed', country: 'Kazakhstan' }),
    makeItem({ industry: 'HealthTech', stage: 'seed', country: 'Russia' }),
    makeItem({ industry: null, stage: null, country: null }),
  ];

  function unique<T>(arr: (T | null | undefined)[]): T[] {
    return [...new Set(arr.filter((v): v is T => v !== null && v !== undefined))] as T[];
  }

  it('extracts unique industries (excluding nulls)', () => {
    const industries = unique(items.map((i) => i.industry));
    expect(industries).toHaveLength(2);
    expect(industries).toContain('FinTech');
    expect(industries).toContain('HealthTech');
  });

  it('extracts unique stages', () => {
    const stages = unique(items.map((i) => i.stage));
    expect(stages).toHaveLength(2);
  });

  it('extracts unique countries', () => {
    const countries = unique(items.map((i) => i.country));
    expect(countries).toHaveLength(2);
    expect(countries).toContain('Russia');
    expect(countries).toContain('Kazakhstan');
  });
});

describe('T8 disclaimer requirement', () => {
  it('disclaimer text is defined and non-empty', () => {
    const disclaimer =
      'Платформа не является брокером или инвестиционным советником. ' +
      'Информация носит ознакомительный характер и не является офертой. ' +
      'Платформа не гарантирует доходность.';
    expect(disclaimer.length).toBeGreaterThan(50);
    expect(disclaimer).toContain('не гарантирует доходность');
    expect(disclaimer).toContain('не является брокером');
  });
});
```

---

## Шаг 10 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `supabase/migrations/006_investor_catalog_view.sql` — view `v_investor_catalog` создан
2. `types/index.ts` — добавлены `InvestorCatalogItem`, `CatalogSortOrder`
3. `app/api/investor/catalog/route.ts` — GET с фильтрацией и сортировкой
4. `app/api/investor/catalog/filters/route.ts` — GET уникальных значений фильтров
5. `app/(investor)/layout.tsx` — layout investor-раздела
6. `app/(investor)/catalog/catalog-filters.tsx` — клиентский компонент фильтров
7. `app/(investor)/catalog/catalog-card.tsx` — карточка проекта
8. `app/(investor)/catalog/page.tsx` — серверная страница каталога
9. `__tests__/t8.test.ts` — все тесты проходят
10. Дисклеймер присутствует на странице каталога
11. `npm run build` — без ошибок TypeScript
12. `npm test` — все тесты проходят (t1 … t8)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/*` — не изменять
- `lib/ai/*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t7.test.ts` — не изменять
- `supabase/migrations/001_*` … `005_*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T7":

```
DONE: T8
```

И в раздел "Выполненные задачи":

```
### T8 — Закрытый каталог инвестора с фильтрами и сортировкой
Создано/изменено:
- supabase/migrations/006_investor_catalog_view.sql — view v_investor_catalog
- types/index.ts — добавлены InvestorCatalogItem, CatalogSortOrder
- app/api/investor/catalog/route.ts — GET каталог с фильтрами и сортировкой
- app/api/investor/catalog/filters/route.ts — GET уникальные значения для фильтров
- app/(investor)/layout.tsx — layout investor-раздела
- app/(investor)/catalog/catalog-filters.tsx — клиентский компонент фильтров
- app/(investor)/catalog/catalog-card.tsx — карточка проекта в каталоге
- app/(investor)/catalog/page.tsx — серверная страница каталога с дисклеймером
- __tests__/t8.test.ts — тесты
```
