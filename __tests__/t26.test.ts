import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/stats/route';
import { getAdminStats } from '@/lib/admin/stats';
import type { AdminStats } from '@/types';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

type CountResult = {
  count: number;
  error: null;
};

type ActivityRow = {
  project_id: string;
  to_status: string;
  changed_at: string;
  projects: { name: string | null } | null;
};

type CountQuery = {
  select: jest.Mock;
  eq: jest.Mock<Promise<CountResult>, [string, string]>;
  not: jest.Mock<Promise<CountResult>, [string, string, null]>;
  then: <TResult1 = CountResult, TResult2 = never>(
    onfulfilled?: ((value: CountResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
};

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeCountQuery(table: string, counts: Record<string, number>) {
  const query: CountQuery = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string) =>
      Promise.resolve({ count: counts[`${table}.${column}.${value}`] ?? 0, error: null })
    ),
    not: jest.fn((column: string) =>
      Promise.resolve({ count: counts[`${table}.${column}.not_null`] ?? 0, error: null })
    ),
    then: (onfulfilled, onrejected) =>
      Promise.resolve({ count: counts[`${table}.total`] ?? 0, error: null }).then(
        onfulfilled,
        onrejected
      ),
  };
  return query;
}

function makeTableQuery(table: string, counts: Record<string, number>, activity: ActivityRow[]) {
  if (table === 'project_status_log') {
    const query = {
      select: jest.fn(() => query),
      order: jest.fn(() => query),
      limit: jest.fn(async (limit: number) => ({
        data: activity.slice(0, limit),
        error: null,
      })),
    };
    return query;
  }

  return makeCountQuery(table, counts);
}

const counts = {
  'projects.status.draft': 2,
  'projects.status.submitted': 3,
  'projects.status.approved': 5,
  'projects.status.rejected': 1,
  'users.role.investor': 7,
  'users.role.project': 4,
  'users.role.admin': 2,
  'users.role.moderator': 1,
  'users.role.manager': 1,
  'users.total': 16,
  'applications.status.pending': 6,
  'applications.status.approved': 8,
  'applications.status.rejected': 2,
  'investor_portfolio.total': 9,
  'invites.total': 10,
  'invites.used_at.not_null': 4,
};

const overflowingActivityRows: ActivityRow[] = Array.from({ length: 12 }, (_, index) => ({
  project_id: `project-${index + 1}`,
  to_status: index % 2 === 0 ? 'approved' : 'submitted',
  changed_at: `2026-06-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
  projects: { name: `Проект ${index + 1}` },
}));

function makeStatsClient(activity: ActivityRow[] = overflowingActivityRows) {
  return {
    from: (table: string) => makeTableQuery(table, counts, activity),
  };
}

function mockAuthorizedStats(role: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      const roleQuery = makeRoleQuery(role);
      const statsQuery = makeTableQuery(table, counts, overflowingActivityRows) as CountQuery;
      return {
        select: jest.fn((columns: string, options?: { count?: string; head?: boolean }) => {
          if (columns === 'role') return roleQuery.select(columns);
          return statsQuery.select(columns, options);
        }),
        eq: statsQuery.eq,
        not: statsQuery.not,
        then: statsQuery.then,
      };
    }
    return makeTableQuery(table, counts, overflowingActivityRows);
  });
}

describe('T26 admin dashboard stats', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/admin/stats returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/stats returns 403 for role=investor', async () => {
    mockAuthorizedStats('investor');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/stats returns 403 for role=project', async () => {
    mockAuthorizedStats('project');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/stats returns 403 for role=moderator', async () => {
    mockAuthorizedStats('moderator');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/stats returns 200 for role=admin', async () => {
    mockAuthorizedStats('admin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = (await response.json()) as AdminStats;

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('applications');
    expect(body).toHaveProperty('invites');
    expect(body).toHaveProperty('recent_activity');
  });

  it('GET /api/admin/stats returns 200 for role=superadmin', async () => {
    mockAuthorizedStats('superadmin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(200);
  });

  it('getAdminStats returns required top-level fields', async () => {
    const stats = await getAdminStats(makeStatsClient() as never);

    expect(stats).toHaveProperty('projects');
    expect(stats).toHaveProperty('users');
    expect(stats).toHaveProperty('applications');
    expect(stats).toHaveProperty('invites');
    expect(stats).toHaveProperty('recent_activity');
  });

  it('getAdminStats sets projects.total to status sum', async () => {
    const stats = await getAdminStats(makeStatsClient() as never);

    expect(stats.projects.total).toBe(
      stats.projects.draft + stats.projects.submitted + stats.projects.approved + stats.projects.rejected
    );
  });

  it('getAdminStats sets invites.unused to total minus used and not below zero', async () => {
    const stats = await getAdminStats(makeStatsClient() as never);
    const negativeUnusedStats = await getAdminStats(
      makeStatsClient().from
        ? ({
            from: (table: string) =>
              makeTableQuery(
                table,
                { ...counts, 'invites.total': 2, 'invites.used_at.not_null': 5 },
                overflowingActivityRows
              ),
          } as never)
        : (makeStatsClient() as never)
    );

    expect(stats.invites.unused).toBe(stats.invites.total - stats.invites.used);
    expect(negativeUnusedStats.invites.unused).toBe(0);
  });

  it('getAdminStats limits recent_activity to 10 records', async () => {
    const stats = await getAdminStats(makeStatsClient() as never);

    expect(stats.recent_activity.length).toBeLessThanOrEqual(10);
  });
});
