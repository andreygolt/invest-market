import { Suspense } from 'react';
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

type QuestionnaireRow = {
  answers: Record<string, unknown>;
};

type AiReportRow = {
  report: Record<string, unknown>;
  status: string | null;
};

type ProjectCatalogRow = {
  id: string;
  name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  project_questionnaire: QuestionnaireRow[] | QuestionnaireRow | null;
  ai_reports: AiReportRow[] | AiReportRow | null;
};

function asArray<T>(value: T[] | T | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function numberValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapProjectToCatalogItem(row: ProjectCatalogRow): InvestorCatalogItem {
  const answers = asArray(row.project_questionnaire).reduce<Record<string, unknown>>(
    (acc, questionnaire) => ({ ...acc, ...questionnaire.answers }),
    {}
  );
  const reports = asArray(row.ai_reports);
  const report = reports.find((item) => item.status === 'done')?.report ?? reports[0]?.report ?? {};
  const score = numberValue(report.score);

  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
    industry: stringValue(answers.industry),
    stage: stringValue(answers.investment_stage) ?? stringValue(answers.stage),
    country: stringValue(answers.country),
    city: stringValue(answers.city),
    description: stringValue(answers.description),
    short_description: stringValue(answers.short_description),
    investment_ask:
      stringValue(answers.investment_amount) ?? stringValue(answers.investment_ask),
    investment_type: stringValue(answers.investment_type) as InvestorCatalogItem['investment_type'],
    valuation_pre_money: stringValue(answers.valuation_pre_money),
    team_size: stringValue(answers.team_size),
    ai_score: score,
    ai_summary: stringValue(report.summary),
  };
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function amountNumber(value: string | null) {
  if (!value) return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function getCatalogData(searchParams: CatalogSearchParams) {
  const page = parsePositiveInteger(searchParams.page, 1);
  const perPage = 12;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('projects')
    .select(`
      id, name, status, created_at, updated_at,
      project_questionnaire!inner(answers),
      ai_reports(report, status)
    `)
    .eq('status', 'approved');

  if (error || !data) {
    return {
      catalog: { items: [], total: 0, page, per_page: perPage, total_pages: 0 },
      filters: { industries: [], stages: [], countries: [], investmentTypes: [] },
    };
  }

  const items = (data as ProjectCatalogRow[]).map(mapProjectToCatalogItem);

  const unique = <T,>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== ''))];

  const filters = {
    industries: unique(items.map((i) => i.industry)),
    stages: unique(items.map((i) => i.stage)),
    countries: unique(items.map((i) => i.country)),
    investmentTypes: unique(items.map((i) => i.investment_type)),
  };

  const q = searchParams.q?.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (searchParams.industry && item.industry !== searchParams.industry) return false;
    if (searchParams.stage && item.stage !== searchParams.stage) return false;
    if (searchParams.country && item.country !== searchParams.country) return false;
    if (searchParams.investment_type && item.investment_type !== searchParams.investment_type) {
      return false;
    }
    if (searchParams.min_amount && amountNumber(item.investment_ask) < Number(searchParams.min_amount)) {
      return false;
    }
    if (searchParams.max_amount && amountNumber(item.investment_ask) > Number(searchParams.max_amount)) {
      return false;
    }
    if (q) {
      const searchable = [item.name, item.short_description, item.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(q);
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (searchParams.sort === 'score_desc') {
      return (b.ai_score ?? 0) - (a.ai_score ?? 0);
    }
    if (searchParams.sort === 'ask_asc') {
      return amountNumber(a.investment_ask) - amountNumber(b.investment_ask);
    }
    return b.created_at.localeCompare(a.created_at);
  });

  const total = sorted.length;
  const start = (page - 1) * perPage;
  const catalog: CatalogResponse = {
    items: sorted.slice(start, start + perPage),
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
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
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <strong>Важно:</strong> Платформа не является брокером или инвестиционным советником.
        Информация носит ознакомительный характер и не является офертой.
        Платформа не гарантирует доходность и не несёт ответственности за результаты инвестиций.
        Сделки заключаются вне платформы. Инвестирование сопряжено с риском потери вложенных средств.
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Каталог проектов</h1>
        <p className="text-slate-400 mt-2">Проверенные инвестиционные возможности</p>
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
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600"
            />
            <button
              type="submit"
              className="rounded-md border border-slate-700 bg-slate-900 px-4 py-1.5 text-sm text-white hover:bg-slate-800"
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
                className="rounded-md border border-slate-800 px-3 py-1.5 text-sm text-slate-400 hover:text-white"
              >
                Сбросить
              </a>
            )}
          </form>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              {activeFilters.length > 0
                ? `${catalog.total} проектов по фильтрам: ${activeFilters.join(', ')}`
                : `${catalog.total} проектов`}
            </p>
          </div>

          {resolvedSearchParams.q && (
            <p className="text-sm text-slate-500 mb-2">
              Результаты поиска: «{resolvedSearchParams.q}» — {catalog.total} проектов
            </p>
          )}

          {catalog.items.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-slate-500 text-lg">Проектов пока нет</p>
              <p className="text-slate-600 text-sm mt-2">
                Проекты появятся после прохождения модерации
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
    </div>
  );
}
