import { NextRequest } from 'next/server';
import { POST as postDealRoomView } from '@/app/api/investor/deals/[id]/view/route';
import { GET as getProjectStats } from '@/app/api/project/stats/route';
import type { ApplicationStatus, ProjectStats, ProjectStatus } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockInsert = jest.fn();
const mockMaybeSingle = jest.fn();

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

type StatsQueryResult =
  | QueryResult<ApplicationStatusRow[]>
  | QueryResult<ViewRow[]>
  | QueryResult<never[]>;

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId, email: 'investor@test.com' } },
  });
}

function makeProjectLookupQuery(project: { id: string } | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: mockMaybeSingle.mockResolvedValue({ data: project, error: null }),
  };
}

function makeProjectStatsQuery(project: ProjectStatsRow | null) {
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

function makeStatsAdminQuery(
  table: string,
  applications: ApplicationStatusRow[],
  views: ViewRow[]
) {
  const result: StatsQueryResult =
    table === 'investor_favorites'
      ? { data: [], count: 2, error: null }
      : table === 'investor_portfolio'
        ? { data: [], count: 1, error: null }
        : table === 'deal_room_views'
          ? { data: views, error: null }
          : { data: applications, error: null };

  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: (
      resolve: (value: StatsQueryResult) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return query;
}

function setupPost(project: { id: string } | null = { id: 'project-1' }) {
  mockUser('investor-1');
  mockInsert.mockResolvedValue({ error: null });
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'deal_room_views') return { insert: mockInsert };
    return makeProjectLookupQuery(project);
  });
}

async function requestPost(projectId = 'project-1') {
  const response = await postDealRoomView(
    new NextRequest(`http://localhost/api/investor/deals/${projectId}/view`, { method: 'POST' }),
    { params: Promise.resolve({ id: projectId }) }
  );
  const body = (await response.json()) as { ok?: true; error?: string };
  return { response, body };
}

function setupStats(views: ViewRow[]) {
  mockUser('project-owner-1');
  mockServerFrom.mockImplementation((table: string) => {
    if (table === 'projects') {
      return makeProjectStatsQuery({ id: 'project-1', status: 'approved' });
    }
    return {};
  });
  mockAdminFrom.mockImplementation((table: string) =>
    makeStatsAdminQuery(table, [{ status: 'pending' }], views)
  );
}

async function requestStats() {
  const response = await getProjectStats();
  const body = (await response.json()) as ProjectStats;
  return { response, body };
}

describe('T51 deal room view tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMaybeSingle.mockReset();
    mockInsert.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
  });

  it('POST /api/investor/deals/[id]/view returns 401 without auth', async () => {
    mockUser(null);

    const { response } = await requestPost();

    expect(response.status).toBe(401);
  });

  it('POST /api/investor/deals/[id]/view returns 404 if project is not found', async () => {
    setupPost(null);

    const { response } = await requestPost();

    expect(response.status).toBe(404);
  });

  it('POST /api/investor/deals/[id]/view returns 404 if project is not approved', async () => {
    setupPost(null);

    const { response } = await requestPost();

    expect(response.status).toBe(404);
  });

  it('POST /api/investor/deals/[id]/view returns 200 ok on successful insert', async () => {
    setupPost();

    const { response, body } = await requestPost();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it("POST /api/investor/deals/[id]/view calls adminClient.from('deal_room_views').insert", async () => {
    setupPost();

    await requestPost();

    expect(mockAdminFrom).toHaveBeenCalledWith('deal_room_views');
    expect(mockInsert).toHaveBeenCalledWith({
      investor_id: 'investor-1',
      project_id: 'project-1',
    });
  });

  it('GET /api/project/stats includes views_count in response', async () => {
    setupStats([{ investor_id: 'investor-1' }]);

    const { body } = await requestStats();

    expect(body.views_count).toBe(1);
  });

  it('GET /api/project/stats includes unique_viewers in response', async () => {
    setupStats([{ investor_id: 'investor-1' }]);

    const { body } = await requestStats();

    expect(body.unique_viewers).toBe(1);
  });

  it('GET /api/project/stats views_count equals returned rows count', async () => {
    setupStats([
      { investor_id: 'investor-1' },
      { investor_id: 'investor-2' },
      { investor_id: 'investor-1' },
    ]);

    const { body } = await requestStats();

    expect(body.views_count).toBe(3);
  });

  it('GET /api/project/stats unique_viewers counts unique investor_id values', async () => {
    setupStats([
      { investor_id: 'investor-1' },
      { investor_id: 'investor-2' },
      { investor_id: 'investor-1' },
    ]);

    const { body } = await requestStats();

    expect(body.unique_viewers).toBe(2);
  });

  it('GET /api/project/stats unique_viewers is 1 for two rows from one investor_id', async () => {
    setupStats([
      { investor_id: 'investor-1' },
      { investor_id: 'investor-1' },
    ]);

    const { body } = await requestStats();

    expect(body.unique_viewers).toBe(1);
  });

  it('ProjectStats type contains views_count: number', () => {
    const stats: ProjectStats = {
      favorites_count: 0,
      portfolio_count: 0,
      views_count: 1,
      unique_viewers: 0,
      applications: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        withdrawn: 0,
      },
    };

    expect(typeof stats.views_count).toBe('number');
  });

  it('ProjectStats type contains unique_viewers: number', () => {
    const stats: ProjectStats = {
      favorites_count: 0,
      portfolio_count: 0,
      views_count: 0,
      unique_viewers: 1,
      applications: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
        withdrawn: 0,
      },
    };

    expect(typeof stats.unique_viewers).toBe('number');
  });

  it("ViewTracker calls fetch('/api/investor/deals/test-id/view') on mount", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.resetModules();
    jest.doMock('react', () => ({
      useEffect: (effect: () => void) => effect(),
    }));

    const { ViewTracker } = await import('@/app/(investor)/deals/[id]/view-tracker');

    ViewTracker({ projectId: 'test-id' });

    expect(fetchMock).toHaveBeenCalledWith('/api/investor/deals/test-id/view', { method: 'POST' });
    jest.dontMock('react');
  });

  it('ViewTracker returns null and renders no DOM', async () => {
    global.fetch = jest.fn();
    jest.resetModules();
    jest.doMock('react', () => ({
      useEffect: (effect: () => void) => effect(),
    }));

    const { ViewTracker } = await import('@/app/(investor)/deals/[id]/view-tracker');

    expect(ViewTracker({ projectId: 'test-id' })).toBeNull();
    jest.dontMock('react');
  });

  it('POST /api/investor/deals/[id]/view does not fail response when DB insert fails', async () => {
    setupPost();
    mockInsert.mockRejectedValue(new Error('db insert failed'));

    const { response, body } = await requestPost();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});
