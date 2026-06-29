import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computePortfolioStats } from '@/lib/portfolio/stats';
import type {
  PortfolioDetail,
  PortfolioInsert,
  PortfolioInstrument,
  PortfolioDealStatus,
  ProjectStage,
} from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin): string {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// GET /api/investor/portfolio?investor_id=xxx
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('investor_portfolio')
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at, projects(name)'
    )
    .eq('investor_id', investor_id)
    .order('date_invested', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projectIds = (data ?? []).map((row) => row.project_id);
  const catalogMap: Record<string, { industry: string | null; stage: ProjectStage | null }> = {};

  if (projectIds.length > 0) {
    const { data: catalog } = await supabase
      .from('v_investor_catalog')
      .select('id, industry, stage')
      .in('id', projectIds);

    for (const row of catalog ?? []) {
      catalogMap[row.id] = {
        industry: row.industry ?? null,
        stage: (row.stage as ProjectStage | null) ?? null,
      };
    }
  }

  const portfolio: PortfolioDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    project_industry: catalogMap[row.project_id]?.industry ?? null,
    project_stage: catalogMap[row.project_id]?.stage ?? null,
    amount_invested: row.amount_invested,
    date_invested: row.date_invested,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    notes: row.notes,
    exit_amount: row.exit_amount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const stats = computePortfolioStats(portfolio);

  return NextResponse.json({ portfolio, stats });
}

// POST /api/investor/portfolio
// Body: { investor_id, project_id, amount_invested, date_invested, instrument, deal_status?, notes?, exit_amount? }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    amount_invested?: number;
    date_invested?: string;
    instrument?: PortfolioInstrument;
    deal_status?: PortfolioDealStatus;
    notes?: string | null;
    exit_amount?: number | null;
  };

  const {
    investor_id,
    project_id,
    amount_invested,
    date_invested,
    instrument,
    deal_status,
    notes,
    exit_amount,
  } = body;

  if (
    !investor_id ||
    !project_id ||
    typeof amount_invested !== 'number' ||
    amount_invested <= 0 ||
    !date_invested ||
    !instrument
  ) {
    return NextResponse.json(
      {
        error:
          'investor_id, project_id, amount_invested (> 0), date_invested и instrument обязательны',
      },
      { status: 400 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { error: 'Проект не найден или не одобрен' },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const insert: PortfolioInsert = {
    investor_id,
    project_id,
    amount_invested,
    date_invested,
    instrument,
    deal_status: deal_status ?? 'active',
    notes: notes ?? null,
    exit_amount: exit_amount ?? null,
  };

  const { data: row, error } = await supabase
    .from('investor_portfolio')
    .insert({ ...insert, updated_at: now })
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at'
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detail: PortfolioDetail = {
    ...row,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    project_name: project.name,
    project_industry: null,
    project_stage: null,
  };

  return NextResponse.json(detail, { status: 201 });
}
