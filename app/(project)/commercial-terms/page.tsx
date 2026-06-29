import { cookies, headers } from 'next/headers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Мои коммерческие условия</h1>
      </div>

      {summary.terms === null ? (
        <Card>
          <CardContent className="py-10 text-gray-600">
            Условия сотрудничества ещё не установлены. Обратитесь к администратору платформы.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Условия сотрудничества</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm">
              <div>
                <div className="text-gray-500">Success fee (%)</div>
                <div className="text-lg font-semibold">{summary.terms.success_fee_pct}</div>
              </div>
              <div>
                <div className="text-gray-500">Фиксированная часть (₽)</div>
                <div className="text-lg font-semibold">{formatRub(summary.terms.fixed_fee)}</div>
              </div>
              <div>
                <div className="text-gray-500">Заметки</div>
                <div>{summary.terms.notes ?? 'Нет заметок'}</div>
              </div>
            </CardContent>
          </Card>

          {summary.estimated_fee !== null ? (
            <Card>
              <CardContent className="py-6">
                <div className="text-lg font-semibold">
                  Ориентировочное вознаграждение платформы: {formatRub(summary.estimated_fee)}
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  Расчёт носит оценочный характер и основан на зафиксированных инвестициях.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}
    </div>
  );
}
