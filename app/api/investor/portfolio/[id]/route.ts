import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PortfolioDetail, PortfolioInstrument, PortfolioDealStatus } from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin): string {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// PATCH /api/investor/portfolio/[id]
// Body: { investor_id, deal_status?, notes?, exit_amount?, amount_invested?, date_invested?, instrument? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;

  const body = (await request.json()) as {
    investor_id?: string;
    deal_status?: PortfolioDealStatus;
    notes?: string | null;
    exit_amount?: number | null;
    amount_invested?: number;
    date_invested?: string;
    instrument?: PortfolioInstrument;
  };

  const { investor_id, ...updates } = body;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_portfolio')
    .select('id')
    .eq('id', id)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from('investor_portfolio')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at, projects(name)'
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detail: PortfolioDetail = {
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    project_industry: null,
    project_stage: null,
    amount_invested: row.amount_invested,
    date_invested: row.date_invested,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    notes: row.notes,
    exit_amount: row.exit_amount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  return NextResponse.json(detail);
}

// DELETE /api/investor/portfolio/[id]?investor_id=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_portfolio')
    .select('id')
    .eq('id', id)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const { error } = await supabase
    .from('investor_portfolio')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
