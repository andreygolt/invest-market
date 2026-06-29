import { NextRequest } from 'next/server';
import { GET as getProjectStats } from '@/app/api/project/stats/route';
import type { ApplicationStatus, ProjectStats, ProjectStatus } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockServerFrom,
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

type ProjectStatsRow = {
  id: string;
  status: ProjectStatus;
};

type ApplicationStatusRow = {
  status: ApplicationStatus;
};

type ViewRow = {
  investor_id: string;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data?: T;
  count?: number | null;
  error: QueryError | null;
};

type SelectOptions = {
  count?: 'exact';
  head?: boolean;
};

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function makeProjectQuery(project: ProjectStatsRow | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async (): Promise<QueryResult<ProjectStatsRow | null>> => ({
          data: project,
          error: null,
        })),
      })),
    })),
  };
}

function makeAdminQuery(
  table: string,
  counts: { favorites: number; portfolio: number },
  applications: ApplicationStatusRow[],
  views: ViewRow[]
) {
  const result: QueryResult<ApplicationStatusRow[]> | QueryResult<ViewRow[]> | QueryResult<never[]> =
    table === 'investor_favorites'
      ? { data: [], count: counts.favorites, error: null }
      : table === 'investor_portfolio'
        ? { data: [], count: counts.portfolio, error: null }
        : table === 'deal_room_views'
          ? { data: views, error: null }
          : { data: applications, error: null };

  const query = {
    select: jest.fn((columns: string, options?: SelectOptions) => {
      expect(columns).toBeTruthy();
      if (table !== 'applications' && table !== 'deal_room_views') {
        expect(options).toEqual({ count: 'exact', head: true });
      }
      return query;
    }),
    eq: jest.fn((column: string, value: string) => {
      expect(column).toBe('project_id');
      expect(value).toBe('project-1');
      return query;
    }),
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return query;
}

function setupRoute(
  project: ProjectStatsRow | null,
  applications: ApplicationStatusRow[] = [
    { status: 'pending' },
    { status: 'approved' },
    { status: 'rejected' },
    { status: 'cancelled' },
    { status: 'withdrawn' },
  ],
  counts = { favorites: 3, portfolio: 2 },
  views: ViewRow[] = []
) {
  mockUser('user-1');
  mockServerFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeProjectQuery(project);
    return {};
  });
  mockAdminFrom.mockImplementation((table: string) => makeAdminQuery(table, counts, applications, views));
}

async function requestStats() {
  const response = await getProjectStats(new NextRequest('http://localhost/api/project/stats'));
  const body = (await response.json()) as ProjectStats | { error: string };
  return { response, body };
}

describe('T41 project investor interest stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/project/stats returns 401 without auth', async () => {
    mockUser(null);

    const { response } = await requestStats();

    expect(response.status).toBe(401);
  });

  it('GET /api/project/stats returns 404 if project is not found', async () => {
    setupRoute(null);

    const { response } = await requestStats();

    expect(response.status).toBe(404);
  });

  it("GET /api/project/stats returns 403 if project.status is not 'approved'", async () => {
    setupRoute({ id: 'project-1', status: 'draft' });

    const { response } = await requestStats();

    expect(response.status).toBe(403);
  });

  it('GET /api/project/stats returns favorites_count, portfolio_count, applications', async () => {
    setupRoute({ id: 'project-1', status: 'approved' });

    const { response, body } = await requestStats();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      favorites_count: 3,
      portfolio_count: 2,
      views_count: 0,
      unique_viewers: 0,
      applications: {
        total: 5,
        pending: 1,
        approved: 1,
        rejected: 1,
        cancelled: 1,
        withdrawn: 1,
      },
    });
  });

  it('GET /api/project/stats favorites_count matches investor_favorites count', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, [], { favorites: 7, portfolio: 0 });

    const { body } = await requestStats();

    expect((body as ProjectStats).favorites_count).toBe(7);
  });

  it('GET /api/project/stats applications.total equals all application rows', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, [
      { status: 'pending' },
      { status: 'approved' },
      { status: 'rejected' },
      { status: 'cancelled' },
    ]);

    const { body } = await requestStats();

    expect((body as ProjectStats).applications.total).toBe(4);
  });

  it('GET /api/project/stats applications.pending counts only pending rows', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, [
      { status: 'pending' },
      { status: 'pending' },
      { status: 'approved' },
    ]);

    const { body } = await requestStats();

    expect((body as ProjectStats).applications.pending).toBe(2);
  });

  it('GET /api/project/stats applications.approved counts only approved rows', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, [
      { status: 'approved' },
      { status: 'approved' },
      { status: 'pending' },
    ]);

    const { body } = await requestStats();

    expect((body as ProjectStats).applications.approved).toBe(2);
  });

  it('GET /api/project/stats portfolio_count matches investor_portfolio count', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, [], { favorites: 0, portfolio: 9 });

    const { body } = await requestStats();

    expect((body as ProjectStats).portfolio_count).toBe(9);
  });

  it('GET /api/project/stats returns zero application counters when there are no applications', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, []);

    const { body } = await requestStats();

    expect((body as ProjectStats).applications).toEqual({
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      withdrawn: 0,
    });
  });

  it('GET /api/project/stats applications includes cancelled and withdrawn fields', async () => {
    setupRoute({ id: 'project-1', status: 'approved' }, []);

    const { body } = await requestStats();

    expect((body as ProjectStats).applications).toHaveProperty('cancelled');
    expect((body as ProjectStats).applications).toHaveProperty('withdrawn');
  });

  it('ProjectStats type contains all response fields', () => {
    const stats: ProjectStats = {
      favorites_count: 1,
      portfolio_count: 2,
      views_count: 3,
      unique_viewers: 4,
      applications: {
        total: 3,
        pending: 4,
        approved: 5,
        rejected: 6,
        cancelled: 7,
        withdrawn: 8,
      },
    };

    expect(stats.favorites_count).toBe(1);
    expect(stats.portfolio_count).toBe(2);
    expect(stats.views_count).toBe(3);
    expect(stats.unique_viewers).toBe(4);
    expect(stats.applications.withdrawn).toBe(8);
  });
});
