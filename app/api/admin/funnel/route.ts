import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { FunnelRow } from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin', 'moderator'];

type ApprovedProjectRow = {
  id: string;
  name: string | null;
  category: string | null;
};

type ViewRow = {
  project_id: string;
  investor_id: string;
};

type ProjectIdRow = {
  project_id: string;
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

  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id, name, category')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (projectsError) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const approvedProjects = projects as ApprovedProjectRow[];
  const projectIds = approvedProjects.map((project) => project.id);

  const [viewsResult, favoritesResult, applicationsResult, portfolioResult] = await Promise.all([
    admin.from('deal_room_views').select('project_id, investor_id').in('project_id', projectIds),
    admin.from('investor_favorites').select('project_id').in('project_id', projectIds),
    admin.from('investor_applications').select('project_id').in('project_id', projectIds),
    admin.from('investor_portfolio').select('project_id').in('project_id', projectIds),
  ]);

  const firstError =
    viewsResult.error ??
    favoritesResult.error ??
    applicationsResult.error ??
    portfolioResult.error;

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch funnel data' }, { status: 500 });
  }

  const viewRows = (viewsResult.data ?? []) as ViewRow[];
  const favoriteRows = (favoritesResult.data ?? []) as ProjectIdRow[];
  const applicationRows = (applicationsResult.data ?? []) as ProjectIdRow[];
  const portfolioRows = (portfolioResult.data ?? []) as ProjectIdRow[];

  const rows: FunnelRow[] = approvedProjects.map((project) => {
    const projectViews = viewRows.filter((row) => row.project_id === project.id);
    const uniqueViewers = new Set(projectViews.map((row) => row.investor_id)).size;
    const applicationsCount = applicationRows.filter((row) => row.project_id === project.id).length;
    const conversionRate =
      uniqueViewers > 0 ? Math.round((applicationsCount / uniqueViewers) * 1000) / 10 : 0;

    return {
      project_id: project.id,
      project_name: project.name ?? '',
      category: project.category ?? '',
      views_count: projectViews.length,
      unique_viewers: uniqueViewers,
      favorites_count: favoriteRows.filter((row) => row.project_id === project.id).length,
      applications_count: applicationsCount,
      portfolio_count: portfolioRows.filter((row) => row.project_id === project.id).length,
      conversion_rate: conversionRate,
    };
  });

  rows.sort((a, b) => b.views_count - a.views_count);

  return NextResponse.json({ rows });
}
