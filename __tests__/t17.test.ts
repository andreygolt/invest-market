import { NextRequest } from 'next/server';
import { GET as referralCodeGet } from '@/app/api/referral/code/route';
import { GET as referralStatsGet } from '@/app/api/referral/stats/route';
import { GET as referralListGet } from '@/app/api/referral/list/route';
import { GET as adminRewardsGet } from '@/app/api/admin/referral-rewards/route';
import { PATCH as adminRewardPatch } from '@/app/api/admin/referral-rewards/[id]/route';
import type { ReferralStats } from '@/types';

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

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

function makeMaybeSingleQuery(data: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function makeRowsQuery(data: unknown[]) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async () => ({ data, error: null })),
    })),
  };
}

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeReferralListQuery(data: unknown[], count = data.length) {
  const result = async () => ({ data, error: null, count });
  const query = {
    eq: jest.fn(result),
  };

  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(() => ({
          range: jest.fn(() => query),
        })),
      })),
    })),
  };
}

function makeAdminRewardsQuery(data: unknown[], count = data.length) {
  const result = async () => ({ data, error: null, count });
  const query = {
    eq: jest.fn(result),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      result().then(resolve, reject),
  };

  return {
    select: jest.fn(() => ({
      order: jest.fn(() => query),
    })),
  };
}

function makePatchQuery(data: unknown) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => ({ data, error: null })),
        })),
      })),
    })),
  };
}

describe('T17 referral UI API coverage', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/referral/code returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await referralCodeGet();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/referral/stats returns 200 with all ReferralStats fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_codes') return makeMaybeSingleQuery({ code: 'ABCD-1234' });
      if (table === 'referral_links') {
        return makeRowsQuery([{ level: 1 }, { level: 2 }, { level: 3 }]);
      }
      if (table === 'referral_rewards') {
        return makeRowsQuery([
          { amount: 1000, status: 'pending' },
          { amount: 2000, status: 'approved' },
          { amount: 3000, status: 'paid' },
        ]);
      }
      return makeRowsQuery([]);
    });

    const response = await referralStatsGet();
    const body = (await response.json()) as ReferralStats;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      code: 'ABCD-1234',
      total_referrals: 3,
      level1_count: 1,
      level2_count: 1,
      level3_count: 1,
      rewards_pending: 1000,
      rewards_approved: 2000,
      rewards_paid: 3000,
    });
  });

  it('GET /api/referral/list returns 200 with empty items without referrals', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_links') return makeReferralListQuery([]);
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/referral/list');

    const response = await referralListGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('GET /api/referral/list?level=1 filters by level', async () => {
    const referralLinksQuery = makeReferralListQuery([
      {
        referee_id: 'referee-1',
        level: 1,
        created_at: '2026-01-01T00:00:00Z',
        users: { email: 'referee@example.com' },
      },
    ]);

    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_links') return referralLinksQuery;
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/referral/list?level=1');

    const response = await referralListGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].level).toBe(1);
  });

  it('GET /api/admin/referral-rewards returns 403 for investor role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/admin/referral-rewards');

    const response = await adminRewardsGet(request);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET /api/admin/referral-rewards returns 200 for admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'referral_rewards') return makeAdminRewardsQuery([]);
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/admin/referral-rewards');

    const response = await adminRewardsGet(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ items: [], total: 0 });
  });

  it('PATCH /api/admin/referral-rewards/[id] returns 403 for investor role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/admin/referral-rewards/reward-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });

    const response = await adminRewardPatch(request, {
      params: Promise.resolve({ id: 'reward-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('PATCH /api/admin/referral-rewards/[id] returns 200 and updates status for admin', async () => {
    const patchQuery = makePatchQuery({
      id: 'reward-1',
      referrer_id: 'referrer-1',
      referee_id: 'referee-1',
      portfolio_id: null,
      level: 1,
      amount: 1000,
      status: 'approved',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    });

    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'referral_rewards') return patchQuery;
      return makeRowsQuery([]);
    });
    const request = new NextRequest('http://localhost/api/admin/referral-rewards/reward-1', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });

    const response = await adminRewardPatch(request, {
      params: Promise.resolve({ id: 'reward-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(patchQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' })
    );
    expect(body.status).toBe('approved');
  });

  it('ReferralStats type has reward status fields', () => {
    const stats: ReferralStats = {
      code: null,
      total_referrals: 0,
      level1_count: 0,
      level2_count: 0,
      level3_count: 0,
      rewards_pending: 0,
      rewards_approved: 0,
      rewards_paid: 0,
    };

    expect(stats.rewards_pending).toBe(0);
    expect(stats.rewards_approved).toBe(0);
    expect(stats.rewards_paid).toBe(0);
  });
});
