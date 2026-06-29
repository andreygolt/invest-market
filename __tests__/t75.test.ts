import { NextRequest } from 'next/server';

type NotificationInsert = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type RewardRow = {
  id: string;
  referrer_id: string | null;
  referee_id: string;
  portfolio_id: string | null;
  level: number;
  amount: number | string;
  status: 'approved' | 'paid';
  created_at: string;
  updated_at: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadNotifyReferralRewardTest(options?: {
  inserted?: { id: string } | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockSingle = jest.fn(async () => ({
    data: options && 'inserted' in options ? options.inserted : { id: 'notif-uuid' },
    error: options && 'inserted' in options && options.inserted === null ? { message: 'DB error' } : null,
  }));
  const mockSelect = jest.fn(() => ({
    single: mockSingle,
  }));
  const mockInsert = jest.fn((row: NotificationInsert) => {
    void row;
    if (options?.insertThrows) throw new Error('DB error');
    return {
      select: mockSelect,
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'notifications') {
      return {
        insert: mockInsert,
      };
    }

    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));

  const notifyModule = await import('@/lib/notifications/notify-referral-reward');

  return {
    notifyReferralReward: notifyModule.notifyReferralReward,
    mockInsert,
  };
}

function makePatchRequest(status: string) {
  return new NextRequest('http://localhost/api/admin/referral-rewards/reward-1', {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

function makePatchQuery(data: RewardRow) {
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

async function loadReferralRewardPatchTest(data: RewardRow) {
  jest.resetModules();

  const mockNotifyReferralReward = jest.fn().mockResolvedValue(undefined);
  const patchQuery = makePatchQuery(data);
  const mockFrom = jest.fn((table: string) => {
    if (table === 'referral_rewards') return patchQuery;
    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-referral-reward', () => ({
    notifyReferralReward: mockNotifyReferralReward,
  }));
  jest.doMock('@/lib/referral/admin-auth', () => ({
    requireReferralAdmin: jest.fn().mockResolvedValue({ error: null }),
  }));

  const route = await import('@/app/api/admin/referral-rewards/[id]/route');

  return {
    PATCH: route.PATCH,
    mockNotifyReferralReward,
  };
}

function makeReward(status: 'approved' | 'paid', overrides?: Partial<RewardRow>): RewardRow {
  return {
    id: 'reward-1',
    referrer_id: 'referrer-1',
    referee_id: 'referee-1',
    portfolio_id: null,
    level: 1,
    amount: 150000,
    status,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    ...overrides,
  };
}

describe('T75 notifyReferralReward', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it("newStatus='approved' uses approved title", async () => {
    const { notifyReferralReward, mockInsert } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'approved',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Реферальное вознаграждение одобрено' })
    );
  });

  it("newStatus='paid' uses paid title", async () => {
    const { notifyReferralReward, mockInsert } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'paid',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Реферальное вознаграждение выплачено' })
    );
  });

  it('body contains reward amount', async () => {
    const { notifyReferralReward, mockInsert } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'approved',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.body.replace(/\s/g, ' ')).toContain('150 000 ₽');
  });

  it("uses '/referral' link", async () => {
    const { notifyReferralReward, mockInsert } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'approved',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link: '/referral' }));
  });

  it('calls dispatch-email fetch once after insert', async () => {
    const { notifyReferralReward } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'approved',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert fails', async () => {
    const { notifyReferralReward } = await loadNotifyReferralRewardTest({ insertThrows: true });

    await expect(
      notifyReferralReward({
        rewardId: 'reward-1',
        referrerId: 'referrer-1',
        newStatus: 'approved',
        amount: 150000,
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('passes notificationId and referrerId to dispatch-email payload', async () => {
    const { notifyReferralReward } = await loadNotifyReferralRewardTest();

    await notifyReferralReward({
      rewardId: 'reward-1',
      referrerId: 'referrer-1',
      newStatus: 'approved',
      amount: 150000,
      baseUrl: 'https://invest.test',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      notificationId: 'notif-uuid',
      userId: 'referrer-1',
    });
  });
});

describe('T75 PATCH /api/admin/referral-rewards/[id]', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-referral-reward');
    jest.dontMock('@/lib/referral/admin-auth');
  });

  it("status='approved' calls notifyReferralReward", async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(makeReward('approved'));

    await PATCH(makePatchRequest('approved'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalled();
  });

  it("status='paid' calls notifyReferralReward", async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(makeReward('paid'));

    await PATCH(makePatchRequest('paid'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalled();
  });

  it('passes referrerId from data', async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(
      makeReward('approved', { referrer_id: 'referrer-from-data' })
    );

    await PATCH(makePatchRequest('approved'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalledWith(
      expect.objectContaining({ referrerId: 'referrer-from-data' })
    );
  });

  it('passes amount from data', async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(
      makeReward('approved', { amount: '250000' })
    );

    await PATCH(makePatchRequest('approved'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalledWith(expect.objectContaining({ amount: 250000 }));
  });

  it('passes approved newStatus from data', async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(makeReward('approved'));

    await PATCH(makePatchRequest('approved'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalledWith(expect.objectContaining({ newStatus: 'approved' }));
  });

  it('passes paid newStatus from data', async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(makeReward('paid'));

    await PATCH(makePatchRequest('paid'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(mockNotifyReferralReward).toHaveBeenCalledWith(expect.objectContaining({ newStatus: 'paid' }));
  });

  it('does not call notifyReferralReward for invalid status', async () => {
    const { PATCH, mockNotifyReferralReward } = await loadReferralRewardPatchTest(makeReward('approved'));

    const response = await PATCH(makePatchRequest('pending'), { params: Promise.resolve({ id: 'reward-1' }) });

    expect(response.status).toBe(400);
    expect(mockNotifyReferralReward).not.toHaveBeenCalled();
  });
});
