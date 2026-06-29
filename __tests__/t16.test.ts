import { NextRequest } from 'next/server';
import { GET as referralCodeGet } from '@/app/api/referral/code/route';
import { GET as referralStatsGet } from '@/app/api/referral/stats/route';
import { GET as referralListGet } from '@/app/api/referral/list/route';
import { GET as adminRewardsGet } from '@/app/api/admin/referral-rewards/route';
import { generateReferralCode } from '@/lib/referral/code';
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

describe('T16 referral system', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('generateReferralCode() returns allowed code', () => {
    const code = generateReferralCode('user-1');

    expect(code.length).toBeGreaterThanOrEqual(8);
    expect(code).toMatch(/^[A-Z0-9-]+$/);
  });

  it('GET /api/referral/code returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await referralCodeGet();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/referral/code returns existing code for authorized user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_codes') return makeMaybeSingleQuery({ code: 'ABCD-1234' });
      return makeRowsQuery([]);
    });

    const response = await referralCodeGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ code: 'ABCD-1234', invite_link: '/invite/ABCD-1234' });
  });

  it('GET /api/referral/stats returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await referralStatsGet();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/referral/stats returns zero stats without referrals', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'referral_codes') return makeMaybeSingleQuery(null);
      if (table === 'referral_links') return makeRowsQuery([]);
      if (table === 'referral_rewards') return makeRowsQuery([]);
      return makeRowsQuery([]);
    });

    const response = await referralStatsGet();
    const body = (await response.json()) as ReferralStats;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      code: null,
      total_referrals: 0,
      level1_count: 0,
      level2_count: 0,
      level3_count: 0,
      rewards_pending: 0,
      rewards_approved: 0,
      rewards_paid: 0,
    });
  });

  it('GET /api/referral/list returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new NextRequest('http://localhost/api/referral/list');

    const response = await referralListGet(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
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

  it('ReferralStats type has level counters', () => {
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

    expect(stats.level1_count).toBe(0);
    expect(stats.level2_count).toBe(0);
    expect(stats.level3_count).toBe(0);
  });
});
