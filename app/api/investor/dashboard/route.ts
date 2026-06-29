import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InvestorDashboard, RecentDeal } from '@/types';

type PortfolioDashboardRow = {
  amount_invested: number | null;
  deal_status: string | null;
};

type ApplicationDashboardRow = {
  status: string | null;
};

type FavoriteDashboardRow = {
  id: string;
};

type RecentDealRow = {
  id: string;
  name: string;
  industry: string | null;
  investment_stage: string | null;
  min_investment: number | null;
};

function buildPortfolioStats(rows: PortfolioDashboardRow[]) {
  return rows.reduce(
    (stats, row) => {
      const status = row.deal_status;
      const amount = row.amount_invested ?? 0;

      if (status === 'confirmed' || status === 'active') {
        stats.total_invested += amount;
        stats.active_count += 1;
      } else if (status === 'exited') {
        stats.total_invested += amount;
        stats.exited_count += 1;
      } else if (status === 'defaulted' || status === 'written_off') {
        stats.defaulted_count += 1;
      }

      return stats;
    },
    {
      total_invested: 0,
      active_count: 0,
      exited_count: 0,
      defaulted_count: 0,
    }
  );
}

function buildApplicationStats(rows: ApplicationDashboardRow[]) {
  return rows.reduce(
    (stats, row) => {
      const status = row.status;

      stats.total += 1;
      if (status === 'submitted' || status === 'reviewing' || status === 'pending') {
        stats.pending += 1;
      } else if (status === 'approved') {
        stats.approved += 1;
      } else if (status === 'rejected') {
        stats.rejected += 1;
      }

      return stats;
    },
    {
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    }
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [
    portfolioResult,
    applicationsResult,
    favoritesResult,
    recentDealsResult,
  ] = await Promise.all([
    supabase
      .from('investor_portfolio')
      .select('amount_invested, deal_status')
      .eq('investor_id', user.id),
    supabase
      .from('applications')
      .select('status')
      .eq('investor_id', user.id),
    supabase
      .from('investor_favorites')
      .select('id')
      .eq('investor_id', user.id),
    supabase
      .from('v_investor_catalog')
      .select('id, name, industry, investment_stage, min_investment')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const firstError =
    portfolioResult.error ??
    applicationsResult.error ??
    favoritesResult.error ??
    recentDealsResult.error;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const dashboard: InvestorDashboard = {
    portfolio: buildPortfolioStats(
      (portfolioResult.data ?? []) as PortfolioDashboardRow[]
    ),
    applications: buildApplicationStats(
      (applicationsResult.data ?? []) as ApplicationDashboardRow[]
    ),
    favorites_count: ((favoritesResult.data ?? []) as FavoriteDashboardRow[]).length,
    recent_deals: ((recentDealsResult.data ?? []) as RecentDealRow[]).map(
      (deal): RecentDeal => ({
        id: deal.id,
        name: deal.name,
        industry: deal.industry,
        investment_stage: deal.investment_stage,
        min_investment: deal.min_investment,
      })
    ),
  };

  return NextResponse.json(dashboard);
}
