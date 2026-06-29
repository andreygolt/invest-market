import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { InvestorDashboard } from '@/types';

async function getDashboard(): Promise<InvestorDashboard | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [portfolioResult, applicationsResult, favoritesResult, recentDealsResult] =
    await Promise.all([
      supabase
        .from('investor_portfolio')
        .select('amount_invested, deal_status')
        .eq('investor_id', user.id),
      supabase.from('applications').select('status').eq('investor_id', user.id),
      supabase.from('investor_favorites').select('id').eq('investor_id', user.id),
      supabase
        .from('v_investor_catalog')
        .select('id, name, industry, investment_stage, min_investment')
        .order('created_at', { ascending: false })
        .limit(5),
    ]);

  const portfolioRows = portfolioResult.data ?? [];
  const appRows = applicationsResult.data ?? [];

  const portfolio = portfolioRows.reduce(
    (s, r) => {
      const amt = (r.amount_invested as number | null) ?? 0;
      const st = r.deal_status as string | null;
      if (st === 'confirmed' || st === 'active') {
        s.total_invested += amt;
        s.active_count += 1;
      } else if (st === 'exited') {
        s.total_invested += amt;
        s.exited_count += 1;
      } else if (st === 'defaulted' || st === 'written_off') {
        s.defaulted_count += 1;
      }
      return s;
    },
    { total_invested: 0, active_count: 0, exited_count: 0, defaulted_count: 0 }
  );

  const applications = appRows.reduce(
    (s, r) => {
      s.total += 1;
      const st = r.status as string | null;
      if (st === 'submitted' || st === 'reviewing' || st === 'pending') s.pending += 1;
      else if (st === 'approved') s.approved += 1;
      else if (st === 'rejected') s.rejected += 1;
      return s;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 }
  );

  return {
    portfolio,
    applications,
    favorites_count: (favoritesResult.data ?? []).length,
    recent_deals: (recentDealsResult.data ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      industry: d.industry as string | null,
      investment_stage: d.investment_stage as string | null,
      min_investment: d.min_investment as number | null,
    })),
  };
}

export default async function InvestorDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const dashboard = await getDashboard();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Главная</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Инвестировано</div>
          <div className="text-xl font-semibold text-slate-900">
            {dashboard
              ? new Intl.NumberFormat('ru-RU', {
                  style: 'currency',
                  currency: 'RUB',
                  maximumFractionDigits: 0,
                }).format(dashboard.portfolio.total_invested)
              : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Активных сделок</div>
          <div className="text-xl font-semibold text-slate-900">
            {dashboard?.portfolio.active_count ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Заявок</div>
          <div className="text-xl font-semibold text-slate-900">
            {dashboard?.applications.total ?? 0}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Избранное</div>
          <div className="text-xl font-semibold text-slate-900">
            {dashboard?.favorites_count ?? 0}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-slate-900">Новые проекты</h2>
          <Link
            href="/catalog"
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            Весь каталог →
          </Link>
        </div>
        {dashboard && dashboard.recent_deals.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {dashboard.recent_deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{deal.name}</div>
                  <div className="text-xs text-slate-500">
                    {deal.industry ?? '—'} · {deal.investment_stage ?? '—'}
                  </div>
                </div>
                {deal.min_investment && (
                  <div className="text-sm text-slate-600 shrink-0">
                    от{' '}
                    {new Intl.NumberFormat('ru-RU', {
                      style: 'currency',
                      currency: 'RUB',
                      maximumFractionDigits: 0,
                    }).format(deal.min_investment)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Проектов пока нет</p>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Доходность не гарантирована. Инвестирование сопряжено с риском потери капитала.
        Платформа не принимает денежные средства и не является брокером.
      </p>
    </div>
  );
}
