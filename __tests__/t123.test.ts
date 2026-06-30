import { NextRequest } from 'next/server';

function makeGetRequest(url: string) {
  return new NextRequest(url);
}

function makeJsonRequest(url: string, body: unknown) {
  return new NextRequest(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildExportAuthMock(options: {
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

function buildReferralAuthMock(options: {
  userId?: string | null;
  role?: string | null;
  profileError?: boolean;
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
              data: options.profileError ? null : userId ? { role } : null,
              error: options.profileError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    })),
  }));
}

describe('T123 GET /api/admin/export/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportApplicationsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      project_id: string;
      investor_id: string;
      amount: number | null;
      currency: string | null;
      status: string;
      created_at: string;
      projects: { name: string } | null;
      profiles: { email: string; full_name: string | null } | null;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: options.dbError ? null : rows,
              error: options.dbError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportApplicationsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeExportApplicationsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is manager', async () => {
    makeExportApplicationsMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportApplicationsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Type for admin', async () => {
    makeExportApplicationsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('applications.csv');
  });

  it('CSV contains header row and data row', async () => {
    makeExportApplicationsMock({
      rows: [
        {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          currency: 'RUB',
          status: 'pending',
          created_at: '2026-06-01T10:00:00Z',
          projects: { name: 'Альфа Проект' },
          profiles: { email: 'investor@example.com', full_name: 'Иван Иванов' },
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('ID');
    expect(text).toContain('app-1');
    expect(text).toContain('Альфа Проект');
  });

  it('works for superadmin role', async () => {
    makeExportApplicationsMock({ role: 'superadmin', rows: [] });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe('T123 GET /api/admin/export/investors', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportInvestorsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      email: string;
      full_name: string | null;
      created_at: string;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportInvestorsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeExportInvestorsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportInvestorsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Disposition for admin', async () => {
    makeExportInvestorsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('investors.csv');
  });

  it('CSV contains investor data row', async () => {
    makeExportInvestorsMock({
      rows: [
        {
          id: 'inv-1',
          email: 'ivan@example.com',
          full_name: 'Иван Иванов',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('inv-1');
    expect(text).toContain('ivan@example.com');
  });
});

describe('T123 GET /api/admin/export/projects', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportProjectsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      name: string;
      category: string;
      status: string;
      created_at: string;
      investment_min: number | null;
      investment_max: number | null;
      target_amount: number | null;
      currency: string | null;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: options.dbError ? null : rows,
              error: options.dbError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportProjectsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeExportProjectsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportProjectsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Disposition for admin', async () => {
    makeExportProjectsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('projects.csv');
  });

  it('CSV contains project data row with financial fields', async () => {
    makeExportProjectsMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Бета Проект',
          category: 'Tech',
          status: 'approved',
          created_at: '2026-06-01T00:00:00Z',
          investment_min: 100000,
          investment_max: 5000000,
          target_amount: 10000000,
          currency: 'RUB',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('proj-1');
    expect(text).toContain('Бета Проект');
    expect(text).toContain('approved');
  });
});

type RewardRow = {
  id: string;
  referrer_id: string;
  referee_id: string;
  portfolio_id: string | null;
  level: 1 | 2 | 3;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
  referrer: { email: string } | { email: string }[] | null;
  referee: { email: string } | { email: string }[] | null;
};

type RewardsResult = {
  data: RewardRow[] | null;
  error: { message: string } | null;
  count: number;
};

describe('T123 GET /api/admin/referral-rewards', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeRewardsMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    dbError?: boolean;
    rows?: RewardRow[];
    count?: number;
    onStatusFilter?: jest.Mock;
  }) {
    jest.resetModules();
    buildReferralAuthMock({
      userId: options.userId,
      role: options.role,
      profileError: options.profileError,
    });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;
    const result: RewardsResult = {
      data: options.dbError ? null : rows,
      error: options.dbError ? { message: 'db error' } : null,
      count,
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => {
              const query = {
                eq: jest.fn(() => {
                  options.onStatusFilter?.();
                  return Promise.resolve(result);
                }),
                then: (resolve: (value: RewardsResult) => void) => resolve(result),
              };
              return query;
            }),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeRewardsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeRewardsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeRewardsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on admin profile DB error', async () => {
    makeRewardsMock({ profileError: true });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(500);
  });

  it('returns 500 on rewards DB error', async () => {
    makeRewardsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with items and total when no filter', async () => {
    makeRewardsMock({
      rows: [
        {
          id: 'rr-1',
          referrer_id: 'u-1',
          referee_id: 'u-2',
          portfolio_id: null,
          level: 1,
          amount: 5000,
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          referrer: { email: 'referrer@example.com' },
          referee: { email: 'referee@example.com' },
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{
        id: string;
        referrer_email: string;
        referee_email: string;
        amount: number;
        status: string;
      }>;
      total: number;
    };
    expect(json.total).toBe(1);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].referrer_email).toBe('referrer@example.com');
    expect(json.items[0].referee_email).toBe('referee@example.com');
    expect(json.items[0].amount).toBe(5000);
  });

  it('applies status filter when status is valid', async () => {
    const onStatusFilter = jest.fn();
    makeRewardsMock({ rows: [], onStatusFilter });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards?status=paid'));
    expect(res.status).toBe(200);
    expect(onStatusFilter).toHaveBeenCalledTimes(1);
  });

  it('maps referee/referrer email from array join format', async () => {
    makeRewardsMock({
      rows: [
        {
          id: 'rr-2',
          referrer_id: 'u-1',
          referee_id: 'u-2',
          portfolio_id: null,
          level: 2,
          amount: 2500,
          status: 'approved',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          referrer: [{ email: 'array-referrer@example.com' }],
          referee: [{ email: 'array-referee@example.com' }],
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ referrer_email: string; referee_email: string }>;
    };
    expect(json.items[0].referrer_email).toBe('array-referrer@example.com');
    expect(json.items[0].referee_email).toBe('array-referee@example.com');
  });
});

describe('T123 PATCH /api/admin/referral-rewards/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-referral-reward');
  });

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    dbError?: boolean;
    updatedRow?: {
      id: string;
      referrer_id: string | null;
      referee_id: string;
      portfolio_id: string | null;
      level: number;
      amount: number;
      status: string;
      created_at: string;
      updated_at: string;
    };
  }) {
    jest.resetModules();
    buildReferralAuthMock({
      userId: options.userId,
      role: options.role,
      profileError: options.profileError,
    });

    jest.doMock('@/lib/notifications/notify-referral-reward', () => ({
      notifyReferralReward: jest.fn(),
    }));

    const updatedRow = options.updatedRow ?? {
      id: 'rr-1',
      referrer_id: 'u-1',
      referee_id: 'u-2',
      portfolio_id: null,
      level: 1,
      amount: 5000,
      status: 'approved',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: options.dbError ? null : updatedRow,
                  error: options.dbError ? { message: 'db error' } : null,
                })),
              })),
            })),
          })),
        })),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makePatchMock({ userId: null });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on admin profile DB error', async () => {
    makePatchMock({ profileError: true });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 when status is invalid', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'pending' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is missing', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', {}),
      makeContext('rr-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    makePatchMock({ dbError: true });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with updated reward on valid PATCH', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: 'u-1',
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; status: string };
    expect(json.id).toBe('rr-1');
    expect(json.status).toBe('approved');
  });

  it('accepts paid as valid status', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: 'u-1',
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'paid',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'paid' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('paid');
  });

  it('returns 200 when referrer_id is null', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: null,
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
  });
});
