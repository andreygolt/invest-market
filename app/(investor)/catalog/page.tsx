import { Suspense } from 'react';
import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CatalogResponse, InvestorCatalogItem } from '@/types';
import { CatalogFilters } from './catalog-filters';
import { CatalogCard } from './catalog-card';
import PaginationControls from './pagination-controls';

export const dynamic = 'force-dynamic';

type CatalogSearchParams = Record<string, string | undefined> & {
  industry?: string;
  stage?: string;
  min_amount?: string;
  max_amount?: string;
  country?: string;
  investment_type?: string;
  sort?: string;
  page?: string;
  q?: string;
};

interface PageProps {
  searchParams: Promise<CatalogSearchParams>;
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

async function getCatalogData(searchParams: CatalogSearchParams) {
  const headersList = await headers();
  const host = headersList.get('host') ?? 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const cookie = headersList.get('cookie') ?? '';

  const params = new URLSearchParams();
  if (searchParams.industry) params.set('industry', searchParams.industry);
  if (searchParams.stage) params.set('stage', searchParams.stage);
  if (searchParams.min_amount) params.set('min_amount', searchParams.min_amount);
  if (searchParams.max_amount) params.set('max_amount', searchParams.max_amount);
  if (searchParams.country) params.set('country', searchParams.country);
  if (searchParams.investment_type) params.set('investment_type', searchParams.investment_type);
  if (searchParams.sort) params.set('sort', searchParams.sort);
  if (searchParams.q) params.set('q', searchParams.q);
  if (searchParams.page) params.set('page', searchParams.page);
  params.set('per_page', '12');

  const res = await fetch(`${protocol}://${host}/api/investor/catalog?${params}`, {
    cache: 'no-store',
    headers: cookie ? { cookie } : undefined,
  });

  const catalog: CatalogResponse = res.ok
    ? await res.json()
    : { items: [], total: 0, page: 1, per_page: 12, total_pages: 0 };

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('v_investor_catalog')
    .select('*');

  if (error || !data) {
    return {
      catalog,
      filters: { industries: [], stages: [], countries: [], investmentTypes: [] },
    };
  }

  const items = data as InvestorCatalogItem[];

  const unique = <T,>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== ''))];

  const filters = {
    industries: unique(items.map((i) => i.industry)),
    stages: unique(items.map((i) => i.stage)),
    countries: unique(items.map((i) => i.country)),
    investmentTypes: unique(items.map((i) => i.investment_type)),
  };

  return { catalog, filters };
}

export default async function CatalogPage({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams;
  const { catalog, filters } = await getCatalogData(resolvedSearchParams);

  const activeFilters = [
    resolvedSearchParams.industry,
    resolvedSearchParams.stage
      ? (STAGE_LABELS[resolvedSearchParams.stage] ?? resolvedSearchParams.stage)
      : null,
    resolvedSearchParams.country,
    resolvedSearchParams.investment_type
      ? (INVESTMENT_TYPE_LABELS[resolvedSearchParams.investment_type] ?? resolvedSearchParams.investment_type)
      : null,
  ].filter(Boolean);

  return (
    <div className="container mx-auto py-8 max-w-7xl">
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

        <main className="flex-1">
          <form method="GET" className="flex gap-2 mb-4">
            {resolvedSearchParams.industry && (
              <input type="hidden" name="industry" value={resolvedSearchParams.industry} />
            )}
            {resolvedSearchParams.stage && (
              <input type="hidden" name="stage" value={resolvedSearchParams.stage} />
            )}
            {resolvedSearchParams.min_amount && (
              <input type="hidden" name="min_amount" value={resolvedSearchParams.min_amount} />
            )}
            {resolvedSearchParams.max_amount && (
              <input type="hidden" name="max_amount" value={resolvedSearchParams.max_amount} />
            )}
            {resolvedSearchParams.country && (
              <input type="hidden" name="country" value={resolvedSearchParams.country} />
            )}
            {resolvedSearchParams.investment_type && (
              <input
                type="hidden"
                name="investment_type"
                value={resolvedSearchParams.investment_type}
              />
            )}
            {resolvedSearchParams.sort && (
              <input type="hidden" name="sort" value={resolvedSearchParams.sort} />
            )}

            <input
              type="text"
              name="q"
              defaultValue={resolvedSearchParams.q ?? ''}
              placeholder="Поиск по названию..."
              className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md border text-sm bg-gray-900 text-white hover:bg-gray-700"
            >
              Найти
            </button>
            {resolvedSearchParams.q && (
              <a
                href={`/catalog?${new URLSearchParams(
                  Object.fromEntries(
                    Object.entries({
                      industry: resolvedSearchParams.industry,
                      stage: resolvedSearchParams.stage,
                      min_amount: resolvedSearchParams.min_amount,
                      max_amount: resolvedSearchParams.max_amount,
                      country: resolvedSearchParams.country,
                      investment_type: resolvedSearchParams.investment_type,
                      sort: resolvedSearchParams.sort,
                    }).filter(([, v]) => v != null) as [string, string][]
                  )
                )}`}
                className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
              >
                Сбросить
              </a>
            )}
          </form>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {activeFilters.length > 0
                ? `${catalog.total} проектов по фильтрам: ${activeFilters.join(', ')}`
                : `${catalog.total} проектов`}
            </p>
          </div>

          {resolvedSearchParams.q && (
            <p className="text-sm text-gray-500 mb-2">
              Результаты поиска: «{resolvedSearchParams.q}» — {catalog.total} проектов
            </p>
          )}

          {catalog.items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
              <p className="text-lg font-medium">Проекты не найдены</p>
              <p className="text-sm mt-1">Попробуйте изменить фильтры</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {catalog.items.map((item) => (
                <CatalogCard key={item.id} item={item} />
              ))}
            </div>
          )}

          {catalog.total_pages > 1 && (
            <PaginationControls
              page={catalog.page}
              totalPages={catalog.total_pages}
              searchParams={resolvedSearchParams}
            />
          )}
        </main>
      </div>
    </div>
  );
}
