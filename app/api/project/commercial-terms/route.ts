import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CommercialTermsRow, SuccessFeeSummary } from '@/types';

type PortfolioAmountRow = {
  amount_invested: number | null;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ terms: null, estimated_fee: null } satisfies SuccessFeeSummary);
  }

  const { data: terms, error: termsError } = await supabase
    .from('commercial_terms')
    .select('id, project_id, success_fee_pct, fixed_fee, notes, created_by, created_at, updated_at')
    .eq('project_id', project.id)
    .maybeSingle();

  if (termsError) {
    return NextResponse.json({ error: termsError.message }, { status: 500 });
  }

  if (!terms) {
    return NextResponse.json({ terms: null, estimated_fee: null } satisfies SuccessFeeSummary);
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from('investor_portfolio')
    .select('amount_invested')
    .eq('project_id', project.id)
    .in('deal_status', ['confirmed', 'active']);

  if (portfolioError) {
    return NextResponse.json({ error: portfolioError.message }, { status: 500 });
  }

  const totalConfirmed = ((portfolio ?? []) as PortfolioAmountRow[]).reduce(
    (sum, row) => sum + (row.amount_invested ?? 0),
    0
  );
  const commercialTerms = terms as CommercialTermsRow;
  const estimated_fee =
    totalConfirmed > 0
      ? (totalConfirmed * commercialTerms.success_fee_pct) / 100 + commercialTerms.fixed_fee
      : null;

  return NextResponse.json({
    terms: commercialTerms,
    estimated_fee,
  } satisfies SuccessFeeSummary);
}
