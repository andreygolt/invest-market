import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorFavoriteDetail, InvestorPersonalStatus, ProjectStage } from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// POST /api/investor/favorites
// Body: { investor_id, project_id, notes?, personal_status? }
// Upsert: если запись уже есть — обновляет notes/status, если нет — создаёт
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    notes?: string | null;
    personal_status?: InvestorPersonalStatus | null;
  };

  const { investor_id, project_id, notes, personal_status } = body;

  if (!investor_id || !project_id) {
    return NextResponse.json(
      { error: 'investor_id и project_id обязательны' },
      { status: 400 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден или не одобрен' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('investor_favorites')
    .upsert(
      {
        investor_id,
        project_id,
        notes: notes ?? null,
        personal_status: personal_status ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'investor_id,project_id' }
    )
    .select('id, investor_id, project_id, notes, personal_status, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// GET /api/investor/favorites?investor_id=xxx&personal_status=watching
// Список избранного инвестора с данными проекта
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');
  const statusFilter = searchParams.get('personal_status') as InvestorPersonalStatus | null;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  let query = supabase
    .from('investor_favorites')
    .select(
      'id, investor_id, project_id, notes, personal_status, created_at, updated_at, projects(name)'
    )
    .eq('investor_id', investor_id)
    .order('updated_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('personal_status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projectIds = (data ?? []).map((row) => row.project_id);
  const catalogMap: Record<
    string,
    { industry: string | null; stage: ProjectStage | null; ai_score: number | null }
  > = {};

  if (projectIds.length > 0) {
    const { data: catalog } = await supabase
      .from('v_investor_catalog')
      .select('id, industry, stage, ai_score')
      .in('id', projectIds);

    for (const row of catalog ?? []) {
      catalogMap[row.id] = {
        industry: row.industry ?? null,
        stage: (row.stage as ProjectStage | null) ?? null,
        ai_score: row.ai_score ?? null,
      };
    }
  }

  const favorites: InvestorFavoriteDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    project_industry: catalogMap[row.project_id]?.industry ?? null,
    project_stage: catalogMap[row.project_id]?.stage ?? null,
    project_ai_score: catalogMap[row.project_id]?.ai_score ?? null,
    notes: row.notes,
    personal_status: row.personal_status as InvestorPersonalStatus | null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ favorites });
}
