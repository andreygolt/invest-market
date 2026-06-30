import { NextRequest } from 'next/server';

function makeGetRequest(url: string) {
  return new NextRequest(url);
}

// ─── GET /api/referral/code ───────────────────────────────────────────────────

describe('T122 GET /api/referral/code', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/referral/code');
  });

  function makeCodeMock(options: {
    userId?: string | null;
    existingCode?: string | null;
    codeError?: boolean;
    insertError?: boolean;
    insertedCode?: string;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;

    jest.doMock('@/lib/referral/code', () => ({
      generateReferralCode: jest.fn(() => options.insertedCode ?? 'ABCD-1234'),
    }));

    const maybeSingleMock = jest.fn(async () => ({
      data: options.existingCode ? { code: options.existingCode } : null,
      error: options.codeError ? { message: 'db error' } : null,
    }));

    const insertSingleMock = jest.fn(async () => ({
      data: options.insertError ? null : { code: options.insertedCode ?? 'ABCD-1234' },
      error: options.insertError ? { message: 'conflict' } : null,
    }));

    const insertSelectMock = jest.fn(() => ({ single: insertSingleMock }));
    const insertMock = jest.fn(() => ({ select: insertSelectMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_codes') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({ maybeSingle: maybeSingleMock })),
              })),
              insert: insertMock,
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeCodeMock({ userId: null });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on referral_codes read error', async () => {
    makeCodeMock({ codeError: true });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns existing code when found', async () => {
    makeCodeMock({ existingCode: 'XYZW-5678' });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { code: string; invite_link: string };
    expect(json.code).toBe('XYZW-5678');
    expect(json.invite_link).toBe('/invite/XYZW-5678');
  });

  it('creates new code when none exists', async () => {
    makeCodeMock({ existingCode: null, insertedCode: 'NEWC-0001' });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { code: string; invite_link: string };
    expect(json.code).toBe('NEWC-0001');
    expect(json.invite_link).toBe('/invite/NEWC-0001');
  });

  it('returns 500 when all insert attempts fail', async () => {
    makeCodeMock({ existingCode: null, insertError: true });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/referral/stats ──────────────────────────────────────────────────

describe('T122 GET /api/referral/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeStatsMock(options: {
    userId?: string | null;
    codeRow?: { code: string } | null;
    codeError?: boolean;
    linksError?: boolean;
    rewardsError?: boolean;
    links?: Array<{ level: 1 | 2 | 3 }>;
    rewards?: Array<{ amount: number | null; status: string }>;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const codeRow = options.codeRow === undefined ? null : options.codeRow;
    const links = options.links ?? [];
    const rewards = options.rewards ?? [];

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_codes') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: codeRow,
                    error: options.codeError ? { message: 'db error' } : null,
                  })),
                })),
              })),
            };
          }
          if (table === 'referral_links') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: options.linksError ? null : links,
                  error: options.linksError ? { message: 'db error' } : null,
                })),
              })),
            };
          }
          if (table === 'referral_rewards') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: options.rewardsError ? null : rewards,
                  error: options.rewardsError ? { message: 'db error' } : null,
                })),
              })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatsMock({ userId: null });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on referral_codes error', async () => {
    makeStatsMock({ codeError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 500 on referral_links error', async () => {
    makeStatsMock({ linksError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 500 on referral_rewards error', async () => {
    makeStatsMock({ rewardsError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns zero stats when no referrals and no code', async () => {
    makeStatsMock({ codeRow: null, links: [], rewards: [] });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      code: string | null;
      total_referrals: number;
      level1_count: number;
      level2_count: number;
      level3_count: number;
      rewards_pending: number;
      rewards_approved: number;
      rewards_paid: number;
    };
    expect(json.code).toBeNull();
    expect(json.total_referrals).toBe(0);
    expect(json.level1_count).toBe(0);
    expect(json.level2_count).toBe(0);
    expect(json.level3_count).toBe(0);
    expect(json.rewards_pending).toBe(0);
    expect(json.rewards_approved).toBe(0);
    expect(json.rewards_paid).toBe(0);
  });

  it('counts referrals by level correctly', async () => {
    makeStatsMock({
      codeRow: { code: 'ABCD-1234' },
      links: [{ level: 1 }, { level: 1 }, { level: 2 }, { level: 3 }, { level: 3 }, { level: 3 }],
      rewards: [],
    });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      code: string | null;
      total_referrals: number;
      level1_count: number;
      level2_count: number;
      level3_count: number;
    };
    expect(json.code).toBe('ABCD-1234');
    expect(json.total_referrals).toBe(6);
    expect(json.level1_count).toBe(2);
    expect(json.level2_count).toBe(1);
    expect(json.level3_count).toBe(3);
  });

  it('sums reward amounts by status correctly', async () => {
    makeStatsMock({
      links: [],
      rewards: [
        { amount: 1000, status: 'pending' },
        { amount: 500, status: 'pending' },
        { amount: 2000, status: 'approved' },
        { amount: 750, status: 'paid' },
        { amount: null, status: 'pending' },
      ],
    });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rewards_pending: number;
      rewards_approved: number;
      rewards_paid: number;
    };
    expect(json.rewards_pending).toBe(1500);
    expect(json.rewards_approved).toBe(2000);
    expect(json.rewards_paid).toBe(750);
  });
});

// ─── GET /api/referral/list ───────────────────────────────────────────────────

describe('T122 GET /api/referral/list', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type LinkRow = {
    referee_id: string;
    level: 1 | 2 | 3;
    created_at: string;
    users: { email: string } | { email: string }[] | null;
  };

  function makeListMock(options: {
    userId?: string | null;
    dbError?: boolean;
    rows?: LinkRow[];
    count?: number;
    captureEqLevel?: (level: number) => void;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;
    const result = {
      data: options.dbError ? null : rows,
      error: options.dbError ? { message: 'db error' } : null,
      count,
    };

    type QueryChain = {
      eq: jest.Mock;
      order: jest.Mock;
      range: jest.Mock;
      then: Promise<typeof result>['then'];
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_links') {
            const chain: QueryChain = {
              eq: jest.fn((col: string, val: unknown) => {
                if (col === 'level' && options.captureEqLevel) {
                  options.captureEqLevel(val as number);
                }
                return chain;
              }),
              order: jest.fn(() => chain),
              range: jest.fn(() => chain),
              then: Promise.resolve(result).then.bind(Promise.resolve(result)),
            };

            return {
              select: jest.fn(() => chain),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeListMock({ userId: null });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    makeListMock({ dbError: true });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(500);
  });

  it('returns empty list when no referrals', async () => {
    makeListMock({ rows: [], count: 0 });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('masks email correctly (first char + *** + @domain)', async () => {
    makeListMock({
      rows: [
        {
          referee_id: 'ref-1',
          level: 1,
          created_at: '2026-06-01T00:00:00Z',
          users: { email: 'ivan@example.com' },
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ referee_id: string; masked_email: string; level: number; joined_at: string }>;
      total: number;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0].masked_email).toBe('i***@example.com');
    expect(json.items[0].referee_id).toBe('ref-1');
    expect(json.items[0].level).toBe(1);
    expect(json.total).toBe(1);
  });

  it('returns correct total from count', async () => {
    makeListMock({
      rows: [{ referee_id: 'r1', level: 2, created_at: '2026-06-01T00:00:00Z', users: { email: 'a@b.com' } }],
      count: 42,
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(42);
  });

  it('masks email when users join is an array', async () => {
    makeListMock({
      rows: [
        {
          referee_id: 'ref-2',
          level: 3,
          created_at: '2026-06-02T00:00:00Z',
          users: [{ email: 'peter@mail.ru' }],
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ masked_email: string }>;
    };
    expect(json.items[0].masked_email).toBe('p***@mail.ru');
  });
});
