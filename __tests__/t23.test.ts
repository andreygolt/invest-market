import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/stats/route';
import type { AdminActivityItem, AdminStats } from '@/types';

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

type CountQuery = {
  select: jest.Mock;
  eq: jest.Mock;
  not: jest.Mock;
  then: <TResult1 = { count: number; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { count: number; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) => Promise<TResult1 | TResult2>;
  order?: jest.Mock;
  limit?: jest.Mock;
};

type ActivityRow = {
  project_id: string;
  to_status: string;
  changed_at: string;
  projects: { name: string | null } | null;
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

const activityRows: ActivityRow[] = Array.from({ length: 12 }, (_, index) => ({
  project_id: `project-${index + 1}`,
  to_status: index % 2 === 0 ? 'approved' : 'submitted',
  changed_at: `2026-06-${String(20 - index).padStart(2, '0')}T10:00:00Z`,
  projects: { name: `Проект ${index + 1}` },
}));

function mockAuthorizedStats(role: string) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'users') {
      const roleQuery = makeRoleQuery(role);
      const statsQuery = makeTableQuery(table, counts, activityRows);
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
    return makeTableQuery(table, counts, activityRows);
  });
}

describe('T23 admin stats', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/admin/stats returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/admin/stats returns 403 for role=investor', async () => {
    mockAuthorizedStats('investor');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET /api/admin/stats returns 403 for role=project', async () => {
    mockAuthorizedStats('project');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/stats returns AdminStats structure', async () => {
    mockAuthorizedStats('admin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = (await response.json()) as AdminStats;

    expect(response.status).toBe(200);
    expect(body).toHaveProperty('projects');
    expect(body).toHaveProperty('users');
    expect(body).toHaveProperty('applications');
    expect(body).toHaveProperty('portfolio');
    expect(body).toHaveProperty('invites');
    expect(body).toHaveProperty('recent_activity');
  });

  it('projects.total equals sum of draft+submitted+approved+rejected', async () => {
    mockAuthorizedStats('admin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = (await response.json()) as AdminStats;

    expect(body.projects.total).toBe(
      body.projects.draft + body.projects.submitted + body.projects.approved + body.projects.rejected
    );
  });

  it('invites.used + invites.unused equals invites.total', async () => {
    mockAuthorizedStats('admin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = (await response.json()) as AdminStats;

    expect(body.invites.used + body.invites.unused).toBe(body.invites.total);
  });

  it('recent_activity contains no more than 10 items', async () => {
    mockAuthorizedStats('admin');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));
    const body = (await response.json()) as AdminStats;

    expect(body.recent_activity.length).toBeLessThanOrEqual(10);
  });

  it('GET /api/admin/stats returns 403 for role=moderator', async () => {
    mockAuthorizedStats('moderator');

    const response = await GET(new NextRequest('http://localhost/api/admin/stats'));

    expect(response.status).toBe(403);
  });

  it('AdminStats projects has all fields', () => {
    const projects: AdminStats['projects'] = {
      draft: 0,
      submitted: 0,
      approved: 0,
      rejected: 0,
      total: 0,
    };

    expect(Object.keys(projects).sort()).toEqual(
      ['approved', 'draft', 'rejected', 'submitted', 'total'].sort()
    );
  });

  it('recent_activity item has required fields', () => {
    const item: AdminActivityItem = {
      project_id: 'project-1',
      status: 'approved',
      changed_at: '2026-06-28T10:00:00Z',
      project_name: 'Проект',
    };

    expect(item).toHaveProperty('project_id');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('changed_at');
    expect(item).toHaveProperty('project_name');
  });
});
