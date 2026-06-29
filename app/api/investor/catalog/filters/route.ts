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

  const unique = <T,>(arr: (T | null | undefined)[]): T[] =>
    [...new Set(arr.filter((v): v is T => v !== null && v !== undefined && v !== ''))];

  return NextResponse.json({
    industries: unique(items.map((i) => i.industry)),
    stages: unique(items.map((i) => i.stage)),
    countries: unique(items.map((i) => i.country)),
    investment_types: unique(items.map((i) => i.investment_type)),
  });
}
