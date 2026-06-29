import { NextRequest, NextResponse } from 'next/server';
import { getSettings, settingAsNumber } from '@/lib/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { CatalogSortOrder } from '@/types';

function parseIntegerParam(value: string | null, fallback: number) {
  const parsed = parseInt(value ?? String(fallback), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// GET /api/investor/catalog
// Query params (все необязательны):
//   industry=FinTech
//   stage=seed
//   country=Russia
//   investment_type=equity
//   sort=newest|score_desc|ask_asc
export async function GET(request: NextRequest) {
  const supabaseAuth = await createClient();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const settings = await getSettings();
  const defaultPageSize = settingAsNumber(settings, 'catalog_page_size', 12);

  const { searchParams } = new URL(request.url);

  const page = Math.max(1, parseIntegerParam(searchParams.get('page'), 1));
  const perPage = Math.min(
    50,
    Math.max(1, parseIntegerParam(searchParams.get('per_page'), defaultPageSize))
  );
  const offset = (page - 1) * perPage;

  const filterIndustry = searchParams.get('industry') ?? '';
  const filterStage = searchParams.get('stage') ?? '';
  const filterCountry = searchParams.get('country') ?? '';
  const filterInvestmentType = searchParams.get('investment_type') ?? '';
  const sort = (searchParams.get('sort') ?? 'newest') as CatalogSortOrder;
  const q = (searchParams.get('q') ?? '').trim();

  const supabase = createAdminClient();

  let query = supabase
    .from('v_investor_catalog')
    .select('*');

  let countQuery = supabase
    .from('v_investor_catalog')
    .select('*', { count: 'exact', head: true });

  if (filterIndustry) {
    query = query.eq('industry', filterIndustry);
    countQuery = countQuery.eq('industry', filterIndustry);
  }
  if (filterStage) {
    query = query.eq('stage', filterStage);
    countQuery = countQuery.eq('stage', filterStage);
  }
  if (filterCountry) {
    query = query.eq('country', filterCountry);
    countQuery = countQuery.eq('country', filterCountry);
  }
  if (filterInvestmentType) {
    query = query.eq('investment_type', filterInvestmentType);
    countQuery = countQuery.eq('investment_type', filterInvestmentType);
  }

  if (q) {
    query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
    countQuery = countQuery.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`);
  }

  if (sort === 'score_desc') {
    query = query.order('ai_score', { ascending: false, nullsFirst: false });
    countQuery = countQuery.order('ai_score', { ascending: false, nullsFirst: false });
  } else if (sort === 'ask_asc') {
    query = query.order('investment_ask', { ascending: true, nullsFirst: false });
    countQuery = countQuery.order('investment_ask', { ascending: true, nullsFirst: false });
  } else {
    query = query.order('created_at', { ascending: false });
    countQuery = countQuery.order('created_at', { ascending: false });
  }

  const [{ data, error }, { count, error: countError }] = await Promise.all([
    query.range(offset, offset + perPage - 1),
    countQuery,
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const total = count ?? 0;

  return NextResponse.json({
    items: data ?? [],
    total,
    page,
    per_page: perPage,
    total_pages: Math.ceil(total / perPage),
  });
}
