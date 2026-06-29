import { GET } from '@/app/api/investor/dashboard/route';
import type { InvestorDashboard } from '@/types';

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

function makeQueryResult(data: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async () => ({ data, error: null })),
      order: jest.fn(() => ({
        limit: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

describe('T14 GET /api/investor/dashboard', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 200 with correct dashboard structure', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'investor_portfolio') {
        return makeQueryResult([
          { amount_invested: 1_000_000, deal_status: 'confirmed' },
          { amount_invested: 500_000, deal_status: 'exited' },
          { amount_invested: 250_000, deal_status: 'defaulted' },
        ]);
      }
      if (table === 'applications') {
        return makeQueryResult([
          { status: 'submitted' },
          { status: 'reviewing' },
          { status: 'approved' },
          { status: 'rejected' },
        ]);
      }
      if (table === 'investor_favorites') {
        return makeQueryResult([{ id: 'fav-1' }, { id: 'fav-2' }]);
      }
      return makeQueryResult([
        {
          id: 'deal-1',
          name: 'Deal One',
          industry: 'FinTech',
          investment_stage: 'seed',
          min_investment: 100_000,
        },
      ]);
    });

    const response = await GET();
    const body = (await response.json()) as InvestorDashboard;

    expect(response.status).toBe(200);
    expect(body.portfolio.total_invested).toBe(1_500_000);
    expect(body.portfolio.active_count).toBe(1);
    expect(body.portfolio.exited_count).toBe(1);
    expect(body.portfolio.defaulted_count).toBe(1);
    expect(body.applications.total).toBe(4);
    expect(body.applications.pending).toBe(2);
    expect(body.applications.approved).toBe(1);
    expect(body.applications.rejected).toBe(1);
    expect(body.favorites_count).toBe(2);
    expect(body.recent_deals).toHaveLength(1);
    expect(body.recent_deals[0].id).toBe('deal-1');
  });
});

describe('T14 InvestorDashboard type', () => {
  it('has all required fields', () => {
    const dashboard: InvestorDashboard = {
      portfolio: {
        total_invested: 0,
        active_count: 0,
        exited_count: 0,
        defaulted_count: 0,
      },
      applications: {
        total: 0,
        pending: 0,
        approved: 0,
        rejected: 0,
      },
      favorites_count: 0,
      recent_deals: [
        {
          id: 'deal-1',
          name: 'Deal One',
          industry: null,
          investment_stage: null,
          min_investment: null,
        },
      ],
    };

    expect(typeof dashboard.portfolio.total_invested).toBe('number');
    expect(typeof dashboard.portfolio.active_count).toBe('number');
    expect(typeof dashboard.portfolio.exited_count).toBe('number');
    expect(typeof dashboard.portfolio.defaulted_count).toBe('number');
    expect(typeof dashboard.applications.total).toBe('number');
    expect(typeof dashboard.applications.pending).toBe('number');
    expect(typeof dashboard.applications.approved).toBe('number');
    expect(typeof dashboard.applications.rejected).toBe('number');
    expect(typeof dashboard.favorites_count).toBe('number');
    expect(Array.isArray(dashboard.recent_deals)).toBe(true);
  });
});
