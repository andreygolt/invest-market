import { NextRequest } from 'next/server';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new NextRequest(url);
}

// ─── shared auth mock builder ─────────────────────────────────────────────────

function buildServerClientMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId } : null },
        })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: userId ? { role } : null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  }));
}

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

describe('T121 GET /api/admin/analytics', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeAnalyticsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    regDates?: string[];
    viewDates?: string[];
    appDates?: string[];
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const regDates = options.regDates ?? [];
    const viewDates = options.viewDates ?? [];
    const appDates = options.appDates ?? [];

    function makeGteMock(
      rows: Array<Record<string, string>>,
      error: { message: string } | null = null
    ) {
      return {
        select: jest.fn(() => ({
          gte: jest.fn(async () => ({
            data: error ? null : rows,
            error,
          })),
        })),
      };
    }

    const dbError = options.dbError ? { message: 'db error' } : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (options.dbError && table === 'profiles') {
            return makeGteMock([], dbError);
          }
          switch (table) {
            case 'profiles':
              return makeGteMock(regDates.map((d) => ({ created_at: d })));
            case 'projects':
              return makeGteMock([]);
            case 'deal_room_views':
              return makeGteMock(viewDates.map((d) => ({ viewed_at: d })));
            case 'investor_applications':
              return makeGteMock(appDates.map((d) => ({ created_at: d })));
            case 'investor_portfolio':
              return makeGteMock([]);
            default:
              return makeGteMock([]);
          }
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeAnalyticsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeAnalyticsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeAnalyticsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with 7 day buckets for period=7d', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=7d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      period: string;
      buckets: unknown[];
      totals: Record<string, number>;
    };
    expect(json.period).toBe('7d');
    expect(json.buckets).toHaveLength(7);
  });

  it('returns 200 with 30 day buckets for period=30d (default)', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { period: string; buckets: unknown[] };
    expect(json.period).toBe('30d');
    expect(json.buckets).toHaveLength(30);
  });

  it('returns 200 with 13 weekly buckets for period=90d', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=90d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { period: string; buckets: unknown[] };
    expect(json.period).toBe('90d');
    expect(json.buckets).toHaveLength(13);
  });

  it('totals.registrations equals sum of registrations across buckets', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    makeAnalyticsMock({ regDates: [`${yesterday}T10:00:00Z`] });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=7d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      buckets: Array<{ registrations: number }>;
      totals: { registrations: number };
    };
    const sumFromBuckets = json.buckets.reduce((acc, b) => acc + b.registrations, 0);
    expect(json.totals.registrations).toBe(sumFromBuckets);
    expect(json.totals.registrations).toBe(1);
  });
});

// ─── GET /api/admin/funnel ────────────────────────────────────────────────────

describe('T121 GET /api/admin/funnel', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeFunnelMock(options: {
    userId?: string | null;
    role?: string | null;
    projectsError?: boolean;
    secondaryError?: boolean;
    projects?: Array<{ id: string; name: string; category: string }>;
    views?: Array<{ project_id: string; investor_id: string }>;
    favorites?: Array<{ project_id: string }>;
    applications?: Array<{ project_id: string }>;
    portfolio?: Array<{ project_id: string }>;
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const projects = options.projects ?? [];
    const views = options.views ?? [];
    const favorites = options.favorites ?? [];
    const applications = options.applications ?? [];
    const portfolio = options.portfolio ?? [];

    const projectsOrderMock = jest.fn(async () => ({
      data: options.projectsError ? null : projects,
      error: options.projectsError ? { message: 'db error' } : null,
    }));
    const projectsEqMock = jest.fn(() => ({ order: projectsOrderMock }));
    const projectsSelectMock = jest.fn(() => ({ eq: projectsEqMock }));

    function makeInMock(data: unknown[], error: { message: string } | null = null) {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({ data: error ? null : data, error })),
        })),
      };
    }

    const secondaryError = options.secondaryError ? { message: 'secondary error' } : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return { select: projectsSelectMock };
          if (table === 'deal_room_views') return makeInMock(views, secondaryError);
          if (table === 'investor_favorites') return makeInMock(favorites);
          if (table === 'investor_applications') return makeInMock(applications);
          if (table === 'investor_portfolio') return makeInMock(portfolio);
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeFunnelMock({ userId: null });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeFunnelMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 for moderator (moderator is in ALLOWED_ROLES)', async () => {
    makeFunnelMock({ role: 'moderator', projects: [] });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('returns 500 on projects DB error', async () => {
    makeFunnelMock({ projectsError: true });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns { rows: [] } when no approved projects exist', async () => {
    makeFunnelMock({ projects: [] });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: unknown[] };
    expect(json.rows).toEqual([]);
  });

  it('returns 500 on secondary DB error when projects exist', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      secondaryError: true,
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('calculates counts and conversion_rate correctly', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      views: [
        { project_id: 'proj-1', investor_id: 'inv-1' },
        { project_id: 'proj-1', investor_id: 'inv-2' },
        { project_id: 'proj-1', investor_id: 'inv-1' },
      ],
      favorites: [{ project_id: 'proj-1' }],
      applications: [{ project_id: 'proj-1' }, { project_id: 'proj-1' }],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{
        project_id: string;
        views_count: number;
        unique_viewers: number;
        favorites_count: number;
        applications_count: number;
        portfolio_count: number;
        conversion_rate: number;
      }>;
    };
    expect(json.rows).toHaveLength(1);
    const row = json.rows[0];
    expect(row.project_id).toBe('proj-1');
    expect(row.views_count).toBe(3);
    expect(row.unique_viewers).toBe(2);
    expect(row.favorites_count).toBe(1);
    expect(row.applications_count).toBe(2);
    expect(row.portfolio_count).toBe(0);
    expect(row.conversion_rate).toBe(100);
  });

  it('conversion_rate is 0 when unique_viewers is 0', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      views: [],
      applications: [{ project_id: 'proj-1' }],
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: Array<{ conversion_rate: number }> };
    expect(json.rows[0].conversion_rate).toBe(0);
  });
});

// ─── GET /api/admin/investors-activity ───────────────────────────────────────

describe('T121 GET /api/admin/investors-activity', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeInvestorsActivityMock(options: {
    userId?: string | null;
    role?: string | null;
    investorsError?: boolean;
    investors?: Array<{ id: string; full_name: string | null; email: string }>;
    views?: Array<{ investor_id: string; viewed_at: string }>;
    favorites?: Array<{ investor_id: string; created_at: string }>;
    applications?: Array<{ investor_id: string; created_at: string }>;
    portfolio?: Array<{ investor_id: string; created_at: string }>;
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const investors = options.investors ?? [];
    const views = options.views ?? [];
    const favorites = options.favorites ?? [];
    const applications = options.applications ?? [];
    const portfolio = options.portfolio ?? [];

    const investorsOrderMock = jest.fn(async () => ({
      data: options.investorsError ? null : investors,
      error: options.investorsError ? { message: 'db error' } : null,
    }));
    const investorsEqMock = jest.fn(() => ({ order: investorsOrderMock }));
    const investorsSelectMock = jest.fn(() => ({ eq: investorsEqMock }));

    function makeInMock(data: unknown[]) {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({ data, error: null })),
        })),
      };
    }

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'profiles') return { select: investorsSelectMock };
          if (table === 'deal_room_views') return makeInMock(views);
          if (table === 'investor_favorites') return makeInMock(favorites);
          if (table === 'investor_applications') return makeInMock(applications);
          if (table === 'investor_portfolio') return makeInMock(portfolio);
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeInvestorsActivityMock({ userId: null });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator (not in ALLOWED_ROLES)', async () => {
    makeInvestorsActivityMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is investor', async () => {
    makeInvestorsActivityMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on investors DB error', async () => {
    makeInvestorsActivityMock({ investorsError: true });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns { rows: [] } when no investors exist', async () => {
    makeInvestorsActivityMock({ investors: [] });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: unknown[] };
    expect(json.rows).toEqual([]);
  });

  it('aggregates counts and computes last_active_at correctly', async () => {
    makeInvestorsActivityMock({
      investors: [{ id: 'inv-1', full_name: 'Иван Иванов', email: 'ivan@example.com' }],
      views: [
        { investor_id: 'inv-1', viewed_at: '2026-06-28T10:00:00Z' },
        { investor_id: 'inv-1', viewed_at: '2026-06-29T15:00:00Z' },
      ],
      favorites: [{ investor_id: 'inv-1', created_at: '2026-06-27T08:00:00Z' }],
      applications: [{ investor_id: 'inv-1', created_at: '2026-06-25T12:00:00Z' }],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{
        investor_id: string;
        investor_name: string;
        email: string;
        views_count: number;
        favorites_count: number;
        applications_count: number;
        portfolio_count: number;
        last_active_at: string | null;
      }>;
    };
    expect(json.rows).toHaveLength(1);
    const row = json.rows[0];
    expect(row.investor_id).toBe('inv-1');
    expect(row.investor_name).toBe('Иван Иванов');
    expect(row.email).toBe('ivan@example.com');
    expect(row.views_count).toBe(2);
    expect(row.favorites_count).toBe(1);
    expect(row.applications_count).toBe(1);
    expect(row.portfolio_count).toBe(0);
    expect(row.last_active_at).toBe('2026-06-29T15:00:00Z');
  });

  it('last_active_at is null when investor has no activity', async () => {
    makeInvestorsActivityMock({
      investors: [{ id: 'inv-1', full_name: 'Без активности', email: 'idle@example.com' }],
      views: [],
      favorites: [],
      applications: [],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: Array<{ last_active_at: string | null }> };
    expect(json.rows[0].last_active_at).toBeNull();
  });
});
