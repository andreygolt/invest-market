import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ApplicationStatus, ProjectStats, ProjectStatus } from '@/types';

type ProjectStatsRow = {
  id: string;
  status: ProjectStatus;
};

type ApplicationStatusRow = {
  status: ApplicationStatus;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id,status')
    .eq('owner_id', user.id)
    .maybeSingle<ProjectStatsRow>();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  if (!project) {
    return NextResponse.json({ error: 'project_not_found' }, { status: 404 });
  }

  if (project.status !== 'approved') {
    return NextResponse.json({ error: 'project_not_approved' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const projectId = project.id;

  const [
    favoritesResult,
    applicationsResult,
    portfolioResult,
    viewsResult,
  ] = await Promise.all([
    adminSupabase
      .from('investor_favorites')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    adminSupabase
      .from('applications')
      .select('status')
      .eq('project_id', projectId),
    adminSupabase
      .from('investor_portfolio')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId),
    adminSupabase
      .from('deal_room_views')
      .select('investor_id')
      .eq('project_id', projectId),
  ]);

  const firstError =
    favoritesResult.error ??
    applicationsResult.error ??
    portfolioResult.error ??
    viewsResult.error;

  if (firstError) {
    return NextResponse.json({ error: firstError.message }, { status: 500 });
  }

  const appRows = (applicationsResult.data ?? []) as ApplicationStatusRow[];
  const viewRows = (viewsResult.data ?? []) as { investor_id: string }[];
  const stats: ProjectStats = {
    favorites_count: favoritesResult.count ?? 0,
    portfolio_count: portfolioResult.count ?? 0,
    views_count: viewRows.length,
    unique_viewers: new Set(viewRows.map((row) => row.investor_id)).size,
    applications: {
      total: appRows.length,
      pending: appRows.filter((row) => row.status === 'pending').length,
      approved: appRows.filter((row) => row.status === 'approved').length,
      rejected: appRows.filter((row) => row.status === 'rejected').length,
      cancelled: appRows.filter((row) => row.status === 'cancelled').length,
      withdrawn: appRows.filter((row) => row.status === 'withdrawn').length,
    },
  };

  return NextResponse.json(stats);
}
