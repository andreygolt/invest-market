import { cookies, headers } from 'next/headers';
import type { SuccessFeeSummary } from '@/types';

export const dynamic = 'force-dynamic';

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

async function getCommercialTerms(): Promise<SuccessFeeSummary> {
  const headersList = await headers();
  const cookieStore = await cookies();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';

  const response = await fetch(`${protocol}://${host}/api/project/commercial-terms`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return { terms: null, estimated_fee: null };
  }

  return (await response.json()) as SuccessFeeSummary;
}

export default async function ProjectCommercialTermsPage() {
  const summary = await getCommercialTerms();

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Мои коммерческие условия</h1>
        </div>

        {summary.terms === null ? (
          <div className="rounded-xl border border-slate-200 bg-white py-10 px-6 text-slate-600">
            Условия сотрудничества ещё не установлены. Обратитесь к администратору платформы.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Условия сотрудничества</h2>
              <div>
                <div className="text-sm text-slate-500">Success fee (%)</div>
                <div className="text-lg font-semibold text-slate-900">{summary.terms.success_fee_pct}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Фиксированная часть (₽)</div>
                <div className="text-lg font-semibold text-slate-900">{formatRub(summary.terms.fixed_fee)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Заметки</div>
                <div className="text-sm text-slate-700">{summary.terms.notes ?? 'Нет заметок'}</div>
              </div>
            </div>

            {summary.estimated_fee !== null ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
                <div className="text-lg font-semibold text-slate-900">
                  Ориентировочное вознаграждение платформы: {formatRub(summary.estimated_fee)}
                </div>
                <p className="text-sm text-slate-500">
                  Расчёт носит оценочный характер и основан на зафиксированных инвестициях.
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
