// ─── GET /api/investor/dashboard ─────────────────────────────────────────────

describe('T117 GET /api/investor/dashboard', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type MockOptions = {
    authed?: boolean;
    portfolioRows?: { amount_invested: number | null; deal_status: string | null }[];
    appRows?: { status: string | null }[];
    favoritesRows?: { id: string }[];
    recentDeals?: {
      id: string;
      name: string;
      industry: string | null;
      investment_stage: string | null;
      min_investment: number | null;
    }[];
    dbError?: boolean;
  };

  async function loadDashboardRoute(options?: MockOptions) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const portfolioRows = options?.portfolioRows ?? [];
    const appRows = options?.appRows ?? [];
    const favoritesRows = options?.favoritesRows ?? [];
    const recentDeals = options?.recentDeals ?? [];

    const makeQuery = (rows: unknown[]) => ({
      eq: jest.fn(async () => ({
        data: rows,
        error: options?.dbError ? { message: 'db error' } : null,
      })),
      order: jest.fn(() => ({
        limit: jest.fn(async () => ({
          data: rows,
          error: options?.dbError ? { message: 'db error' } : null,
        })),
      })),
    });

    const selectMock = jest.fn((cols: string) => {
      if (cols === 'amount_invested, deal_status') return makeQuery(portfolioRows);
      if (cols === 'status') return makeQuery(appRows);
      if (cols === 'id') return makeQuery(favoritesRows);
      if (cols === 'id, name, industry, investment_stage, min_investment') {
        return {
          order: jest.fn(() => ({
            limit: jest.fn(async () => ({
              data: recentDeals,
              error: options?.dbError ? { message: 'db error' } : null,
            })),
          })),
        };
      }
      return makeQuery([]);
    });

    const fromMock = jest.fn(() => ({ select: selectMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
        },
        from: fromMock,
      })),
    }));

    const { GET } = await import('@/app/api/investor/dashboard/route');
    return GET;
  }

  it('returns 401 when not authenticated', async () => {
    const GET = await loadDashboardRoute({ authed: false });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty stats when no data', async () => {
    const GET = await loadDashboardRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      portfolio: {
        total_invested: number;
        active_count: number;
        exited_count: number;
        defaulted_count: number;
      };
      applications: { total: number; pending: number; approved: number; rejected: number };
      favorites_count: number;
      recent_deals: unknown[];
    };
    expect(json.portfolio.total_invested).toBe(0);
    expect(json.portfolio.active_count).toBe(0);
    expect(json.applications.total).toBe(0);
    expect(json.favorites_count).toBe(0);
    expect(Array.isArray(json.recent_deals)).toBe(true);
  });

  it('calculates portfolio stats correctly', async () => {
    const GET = await loadDashboardRoute({
      portfolioRows: [
        { amount_invested: 500000, deal_status: 'active' },
        { amount_invested: 1000000, deal_status: 'confirmed' },
        { amount_invested: 300000, deal_status: 'exited' },
        { amount_invested: null, deal_status: 'defaulted' },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      portfolio: {
        total_invested: number;
        active_count: number;
        exited_count: number;
        defaulted_count: number;
      };
    };
    expect(json.portfolio.total_invested).toBe(1800000);
    expect(json.portfolio.active_count).toBe(2);
    expect(json.portfolio.exited_count).toBe(1);
    expect(json.portfolio.defaulted_count).toBe(1);
  });

  it('calculates application stats correctly', async () => {
    const GET = await loadDashboardRoute({
      appRows: [
        { status: 'pending' },
        { status: 'reviewing' },
        { status: 'approved' },
        { status: 'rejected' },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      applications: { total: number; pending: number; approved: number; rejected: number };
    };
    expect(json.applications.total).toBe(4);
    expect(json.applications.pending).toBe(2);
    expect(json.applications.approved).toBe(1);
    expect(json.applications.rejected).toBe(1);
  });

  it('returns favorites_count and recent_deals', async () => {
    const GET = await loadDashboardRoute({
      favoritesRows: [{ id: 'f1' }, { id: 'f2' }],
      recentDeals: [
        {
          id: 'proj-1',
          name: 'Tech Fund',
          industry: 'IT',
          investment_stage: 'Series A',
          min_investment: 100000,
        },
      ],
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      favorites_count: number;
      recent_deals: { id: string; name: string }[];
    };
    expect(json.favorites_count).toBe(2);
    expect(json.recent_deals.length).toBe(1);
    expect(json.recent_deals[0].name).toBe('Tech Fund');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadDashboardRoute({ dbError: true });
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/admin/audit-log ─────────────────────────────────────────────────

describe('T117 GET /api/admin/audit-log', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type AuditMockOptions = {
    authed?: boolean;
    role?: string;
    rows?: unknown[];
    total?: number;
    dbError?: boolean;
  };

  function makeGetRequest(params: Record<string, string> = {}) {
    const url = new URL('http://localhost/api/admin/audit-log');
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

    const req = new Request(url.toString()) as import('next/server').NextRequest;
    Object.defineProperty(req, 'nextUrl', { value: url });
    return req;
  }

  async function loadAuditRoute(options?: AuditMockOptions) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const role = options?.role ?? 'admin';
    const rows = options?.rows ?? [];
    const total = options?.total ?? rows.length;

    const result = () => ({
      data: rows,
      error: options?.dbError ? { message: 'db error' } : null,
      count: total,
    });

    type ResolveValue = ReturnType<typeof result>;
    type QueryResolve = (value: ResolveValue) => void;
    type QueryReject = (reason?: unknown) => void;

    const eqMock = jest.fn();
    const rangeMock = jest.fn();
    const query = {
      range: rangeMock,
      eq: eqMock,
      then: (resolve: QueryResolve, reject: QueryReject) =>
        Promise.resolve(result()).then(resolve, reject),
    };
    rangeMock.mockReturnValue(query);
    eqMock.mockReturnValue(query);

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
        },
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: authed ? { role } : null,
                error: null,
              })),
            })),
          })),
        })),
      })),
    }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => query),
          })),
        })),
      })),
    }));

    const { GET } = await import('@/app/api/admin/audit-log/route');
    return { GET, eqMock, rangeMock };
  }

  it('returns 401 when not authenticated', async () => {
    const { GET } = await loadAuditRoute({ authed: false });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not admin', async () => {
    const { GET } = await loadAuditRoute({ role: 'investor' });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is manager', async () => {
    const { GET } = await loadAuditRoute({ role: 'manager' });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });

  it('returns 200 with rows and pagination for admin', async () => {
    const { GET } = await loadAuditRoute({
      rows: [
        {
          id: 'log-1',
          action: 'approve_project',
          admin_id: 'user-1',
          created_at: '2026-06-29T10:00:00Z',
        },
      ],
      total: 1,
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: unknown[];
      total: number;
      page: number;
      limit: number;
    };
    expect(Array.isArray(json.rows)).toBe(true);
    expect(typeof json.total).toBe('number');
    expect(typeof json.page).toBe('number');
    expect(typeof json.limit).toBe('number');
  });

  it('returns 200 for superadmin', async () => {
    const { GET } = await loadAuditRoute({ role: 'superadmin', rows: [], total: 0 });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
  });

  it('accepts page and limit query params', async () => {
    const { GET, rangeMock } = await loadAuditRoute({ rows: [], total: 0 });
    const res = await GET(makeGetRequest({ page: '2', limit: '10' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { page: number; limit: number };
    expect(json.page).toBe(2);
    expect(json.limit).toBe(10);
    expect(rangeMock).toHaveBeenCalledWith(10, 19);
  });

  it('applies action query filter', async () => {
    const { GET, eqMock } = await loadAuditRoute({ rows: [], total: 0 });
    const res = await GET(makeGetRequest({ action: 'approve_project' }));
    expect(res.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith('action', 'approve_project');
  });

  it('returns 500 on database error', async () => {
    const { GET } = await loadAuditRoute({ dbError: true });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});
