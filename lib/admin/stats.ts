import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminActivityItem, AdminStats } from '@/types';

type CountFilter =
  | { type: 'eq'; column: string; value: string }
  | { type: 'not_null'; column: string };

type CountResult = {
  count: number | null;
  error: { message: string } | null;
};

type CountQuery = PromiseLike<CountResult> & {
  eq(column: string, value: string): PromiseLike<CountResult>;
  not(column: string, operator: string, value: null): PromiseLike<CountResult>;
};

type ProjectActivityRow = {
  project_id: string;
  to_status: string;
  changed_at: string;
  projects: { name: string | null } | { name: string | null }[] | null;
};

type ActivityResult = {
  data: ProjectActivityRow[] | null;
  error: { message: string } | null;
};

function getProjectName(projects: ProjectActivityRow['projects']): string | null {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? null;
}

function mapActivity(rows: ProjectActivityRow[]): AdminActivityItem[] {
  return rows.slice(0, 10).map((row) => ({
    project_id: row.project_id,
    status: row.to_status,
    changed_at: row.changed_at,
    project_name: getProjectName(row.projects),
  }));
}

async function getCount(supabase: SupabaseClient, table: string, filter?: CountFilter) {
  const query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true }) as unknown as CountQuery;

  let result: CountResult;

  if (filter?.type === 'eq') {
    result = await query.eq(filter.column, filter.value);
  } else if (filter?.type === 'not_null') {
    result = await query.not(filter.column, 'is', null);
  } else {
    result = await query;
  }

  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

async function getRecentActivity(supabase: SupabaseClient) {
  const result = (await supabase
    .from('project_status_log')
    .select('project_id, to_status, changed_at, projects(name)')
    .order('changed_at', { ascending: false })
    .limit(10)) as unknown as ActivityResult;

  if (result.error) throw new Error(result.error.message);
  return mapActivity(result.data ?? []);
}

export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStats> {
  const [
    projectsDraft,
    projectsSubmitted,
    projectsApproved,
    projectsRejected,
    usersInvestor,
    usersProject,
    usersAdmin,
    usersModerator,
    usersManager,
    usersTotal,
    applicationsPending,
    applicationsApproved,
    applicationsRejected,
    portfolioTotal,
    invitesTotal,
    invitesUsed,
    recentActivity,
  ] = await Promise.all([
    getCount(supabase, 'projects', { type: 'eq', column: 'status', value: 'draft' }),
    getCount(supabase, 'projects', { type: 'eq', column: 'status', value: 'submitted' }),
    getCount(supabase, 'projects', { type: 'eq', column: 'status', value: 'approved' }),
    getCount(supabase, 'projects', { type: 'eq', column: 'status', value: 'rejected' }),
    getCount(supabase, 'users', { type: 'eq', column: 'role', value: 'investor' }),
    getCount(supabase, 'users', { type: 'eq', column: 'role', value: 'project' }),
    getCount(supabase, 'users', { type: 'eq', column: 'role', value: 'admin' }),
    getCount(supabase, 'users', { type: 'eq', column: 'role', value: 'moderator' }),
    getCount(supabase, 'users', { type: 'eq', column: 'role', value: 'manager' }),
    getCount(supabase, 'users'),
    getCount(supabase, 'applications', { type: 'eq', column: 'status', value: 'pending' }),
    getCount(supabase, 'applications', { type: 'eq', column: 'status', value: 'approved' }),
    getCount(supabase, 'applications', { type: 'eq', column: 'status', value: 'rejected' }),
    getCount(supabase, 'investor_portfolio'),
    getCount(supabase, 'invites'),
    getCount(supabase, 'invites', { type: 'not_null', column: 'used_at' }),
    getRecentActivity(supabase),
  ]);

  return {
    projects: {
      draft: projectsDraft,
      submitted: projectsSubmitted,
      approved: projectsApproved,
      rejected: projectsRejected,
      total: projectsDraft + projectsSubmitted + projectsApproved + projectsRejected,
    },
    users: {
      investor: usersInvestor,
      project: usersProject,
      admin: usersAdmin,
      moderator: usersModerator,
      manager: usersManager,
      total: usersTotal,
    },
    applications: {
      pending: applicationsPending,
      approved: applicationsApproved,
      rejected: applicationsRejected,
      total: applicationsPending + applicationsApproved + applicationsRejected,
    },
    portfolio: { total_records: portfolioTotal },
    invites: {
      total: invitesTotal,
      used: invitesUsed,
      unused: Math.max(invitesTotal - invitesUsed, 0),
    },
    recent_activity: recentActivity,
  };
}
