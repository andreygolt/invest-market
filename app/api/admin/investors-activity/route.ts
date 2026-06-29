import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { InvestorActivityRow } from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin'];

type InvestorProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ViewRow = {
  investor_id: string;
  viewed_at: string;
};

type TimestampRow = {
  investor_id: string;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: investors, error: investorsError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'investor')
    .order('created_at', { ascending: false });

  if (investorsError) {
    return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 });
  }

  if (!investors || investors.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const investorRows = investors as InvestorProfileRow[];
  const investorIds = investorRows.map((investor) => investor.id);

  const [viewsResult, favoritesResult, applicationsResult, portfolioResult] = await Promise.all([
    admin.from('deal_room_views').select('investor_id, viewed_at').in('investor_id', investorIds),
    admin.from('investor_favorites').select('investor_id, created_at').in('investor_id', investorIds),
    admin
      .from('investor_applications')
      .select('investor_id, created_at')
      .in('investor_id', investorIds),
    admin.from('investor_portfolio').select('investor_id, created_at').in('investor_id', investorIds),
  ]);

  const firstError =
    viewsResult.error ??
    favoritesResult.error ??
    applicationsResult.error ??
    portfolioResult.error;

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch activity data' }, { status: 500 });
  }

  const viewRows = (viewsResult.data ?? []) as ViewRow[];
  const favoriteRows = (favoritesResult.data ?? []) as TimestampRow[];
  const applicationRows = (applicationsResult.data ?? []) as TimestampRow[];
  const portfolioRows = (portfolioResult.data ?? []) as TimestampRow[];

  const rows: InvestorActivityRow[] = investorRows.map((investor) => {
    const investorViews = viewRows.filter((row) => row.investor_id === investor.id);
    const investorFavorites = favoriteRows.filter((row) => row.investor_id === investor.id);
    const investorApplications = applicationRows.filter((row) => row.investor_id === investor.id);
    const investorPortfolio = portfolioRows.filter((row) => row.investor_id === investor.id);

    const allTimestamps = [
      ...investorViews.map((row) => row.viewed_at),
      ...investorFavorites.map((row) => row.created_at),
      ...investorApplications.map((row) => row.created_at),
      ...investorPortfolio.map((row) => row.created_at),
    ].filter(Boolean);

    const lastActiveAt =
      allTimestamps.length > 0 ? allTimestamps.reduce((a, b) => (a > b ? a : b)) : null;

    return {
      investor_id: investor.id,
      investor_name: investor.full_name ?? '',
      email: investor.email ?? '',
      views_count: investorViews.length,
      favorites_count: investorFavorites.length,
      applications_count: investorApplications.length,
      portfolio_count: investorPortfolio.length,
      last_active_at: lastActiveAt,
    };
  });

  rows.sort((a, b) => b.views_count - a.views_count);

  return NextResponse.json({ rows });
}
