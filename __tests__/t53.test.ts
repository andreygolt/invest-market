import { GET } from '@/app/api/admin/investors-activity/route';
import type { InvestorActivityRow } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockInvestorsQuery = jest.fn();
const mockViewsQuery = jest.fn();
const mockFavoritesQuery = jest.fn();
const mockApplicationsQuery = jest.fn();
const mockPortfolioQuery = jest.fn();

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

type InvestorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ViewRow = {
  investor_id: string;
  viewed_at: string;
};

type TimestampRow = {
  investor_id: string;
  created_at: string;
};

type QueryError = {
  message: string;
};

type ActivityBody = {
  rows?: InvestorActivityRow[];
  error?: string;
};

const investorOne: InvestorRow = {
  id: 'inv-1',
  full_name: 'Иван Иванов',
  email: 'ivan@test.com',
};

const investorTwo: InvestorRow = {
  id: 'inv-2',
  full_name: 'Пётр Петров',
  email: 'petr@test.com',
};

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId, email: 'admin@test.com' } },
  });
}

function mockRole(role: string | null) {
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: role === null ? null : { role },
      error: null,
    }),
  });
}

function setupAdminQueries({
  investors = [investorOne, investorTwo],
  views = [
    { investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' },
    { investor_id: 'inv-1', viewed_at: '2026-06-21T10:00:00Z' },
    { investor_id: 'inv-2', viewed_at: '2026-06-19T10:00:00Z' },
  ],
  favorites = [{ investor_id: 'inv-1', created_at: '2026-06-22T10:00:00Z' }],
  applications = [{ investor_id: 'inv-1', created_at: '2026-06-23T10:00:00Z' }],
  portfolio = [],
  investorsError = null,
  viewsError = null,
  favoritesError = null,
  applicationsError = null,
  portfolioError = null,
}: {
  investors?: InvestorRow[];
  views?: ViewRow[];
  favorites?: TimestampRow[];
  applications?: TimestampRow[];
  portfolio?: TimestampRow[];
  investorsError?: QueryError | null;
  viewsError?: QueryError | null;
  favoritesError?: QueryError | null;
  applicationsError?: QueryError | null;
  portfolioError?: QueryError | null;
} = {}) {
  mockInvestorsQuery.mockResolvedValue({ data: investors, error: investorsError });
  mockViewsQuery.mockResolvedValue({ data: views, error: viewsError });
  mockFavoritesQuery.mockResolvedValue({ data: favorites, error: favoritesError });
  mockApplicationsQuery.mockResolvedValue({ data: applications, error: applicationsError });
  mockPortfolioQuery.mockResolvedValue({ data: portfolio, error: portfolioError });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: mockInvestorsQuery,
      };
    }
    if (table === 'deal_room_views') {
      return {
        select: jest.fn().mockReturnThis(),
        in: mockViewsQuery,
      };
    }
    if (table === 'investor_favorites') {
      return {
        select: jest.fn().mockReturnThis(),
        in: mockFavoritesQuery,
      };
    }
    if (table === 'investor_applications') {
      return {
        select: jest.fn().mockReturnThis(),
        in: mockApplicationsQuery,
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      in: mockPortfolioQuery,
    };
  });
}

async function requestInvestorsActivity() {
  const response = await GET();
  const body = (await response.json()) as ActivityBody;
  return { response, body };
}

function setupAllowedRole(role = 'admin') {
  mockUser('admin-1');
  mockRole(role);
  setupAdminQueries();
}

describe('T53 admin investors activity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockInvestorsQuery.mockReset();
    mockViewsQuery.mockReset();
    mockFavoritesQuery.mockReset();
    mockApplicationsQuery.mockReset();
    mockPortfolioQuery.mockReset();
  });

  it('GET /api/admin/investors-activity returns 401 without auth', async () => {
    mockUser(null);

    const { response } = await requestInvestorsActivity();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/investors-activity returns 403 for moderator role', async () => {
    mockUser('moderator-1');
    mockRole('moderator');

    const { response } = await requestInvestorsActivity();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/investors-activity returns 403 for investor role', async () => {
    mockUser('investor-1');
    mockRole('investor');

    const { response } = await requestInvestorsActivity();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/investors-activity returns 200 for admin role', async () => {
    setupAllowedRole('admin');

    const { response } = await requestInvestorsActivity();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/investors-activity returns 200 for superadmin role', async () => {
    setupAllowedRole('superadmin');

    const { response } = await requestInvestorsActivity();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/investors-activity returns empty rows if there are no investors', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ investors: [] });

    const { body } = await requestInvestorsActivity();

    expect(body).toEqual({ rows: [] });
  });

  it('GET /api/admin/investors-activity rows include investor_id, investor_name, email', async () => {
    setupAllowedRole();

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]).toEqual(
      expect.objectContaining({
        investor_id: 'inv-1',
        investor_name: 'Иван Иванов',
        email: 'ivan@test.com',
      })
    );
  });

  it('GET /api/admin/investors-activity views_count equals deal_room_views rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' },
        { investor_id: 'inv-1', viewed_at: '2026-06-21T10:00:00Z' },
        { investor_id: 'inv-1', viewed_at: '2026-06-22T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.views_count).toBe(3);
  });

  it('GET /api/admin/investors-activity favorites_count equals investor_favorites rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      favorites: [
        { investor_id: 'inv-1', created_at: '2026-06-22T10:00:00Z' },
        { investor_id: 'inv-1', created_at: '2026-06-23T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.favorites_count).toBe(2);
  });

  it('GET /api/admin/investors-activity applications_count equals investor_applications rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      applications: [
        { investor_id: 'inv-1', created_at: '2026-06-23T10:00:00Z' },
        { investor_id: 'inv-1', created_at: '2026-06-24T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.applications_count).toBe(2);
  });

  it('GET /api/admin/investors-activity portfolio_count equals investor_portfolio rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      portfolio: [
        { investor_id: 'inv-1', created_at: '2026-06-24T10:00:00Z' },
        { investor_id: 'inv-1', created_at: '2026-06-25T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.portfolio_count).toBe(2);
  });

  it('GET /api/admin/investors-activity last_active_at is null without events', async () => {
    setupAllowedRole();
    setupAdminQueries({ views: [], favorites: [], applications: [], portfolio: [] });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.last_active_at).toBeNull();
  });

  it('GET /api/admin/investors-activity last_active_at is max timestamp', async () => {
    setupAllowedRole();

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.last_active_at).toBe('2026-06-23T10:00:00Z');
  });

  it('GET /api/admin/investors-activity rows are sorted by views_count DESC', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' },
        { investor_id: 'inv-2', viewed_at: '2026-06-21T10:00:00Z' },
        { investor_id: 'inv-2', viewed_at: '2026-06-22T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.map((row) => row.investor_id)).toEqual(['inv-2', 'inv-1']);
  });

  it('GET /api/admin/investors-activity returns 500 if investors query fails', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ investorsError: { message: 'db error' } });

    const { response, body } = await requestInvestorsActivity();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch investors');
  });

  it('GET /api/admin/investors-activity returns 500 if one aggregate query fails', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ favoritesError: { message: 'db error' } });

    const { response, body } = await requestInvestorsActivity();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch activity data');
  });

  it('GET /api/admin/investors-activity sorts two investors correctly with the most viewed first', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' },
        { investor_id: 'inv-2', viewed_at: '2026-06-20T10:00:00Z' },
        { investor_id: 'inv-2', viewed_at: '2026-06-21T10:00:00Z' },
        { investor_id: 'inv-2', viewed_at: '2026-06-22T10:00:00Z' },
      ],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.investor_id).toBe('inv-2');
  });

  it('InvestorActivityRow type contains all expected fields', () => {
    const row: InvestorActivityRow = {
      investor_id: 'inv-1',
      investor_name: 'Иван Иванов',
      email: 'ivan@test.com',
      views_count: 1,
      favorites_count: 1,
      applications_count: 1,
      portfolio_count: 1,
      last_active_at: '2026-06-23T10:00:00Z',
    };

    expect(Object.keys(row).sort()).toEqual(
      [
        'applications_count',
        'email',
        'favorites_count',
        'investor_id',
        'investor_name',
        'last_active_at',
        'portfolio_count',
        'views_count',
      ].sort()
    );
  });

  it('GET /api/admin/investors-activity investor_name is empty if full_name is null', async () => {
    setupAllowedRole();
    setupAdminQueries({
      investors: [{ id: 'inv-1', full_name: null, email: 'ivan@test.com' }],
      views: [],
      favorites: [],
      applications: [],
      portfolio: [],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.investor_name).toBe('');
  });

  it('GET /api/admin/investors-activity last_active_at picks max across tables', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [{ investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' }],
      favorites: [{ investor_id: 'inv-1', created_at: '2026-06-24T10:00:00Z' }],
      applications: [{ investor_id: 'inv-1', created_at: '2026-06-23T10:00:00Z' }],
      portfolio: [{ investor_id: 'inv-1', created_at: '2026-06-25T10:00:00Z' }],
    });

    const { body } = await requestInvestorsActivity();

    expect(body.rows?.[0]?.last_active_at).toBe('2026-06-25T10:00:00Z');
  });
});
