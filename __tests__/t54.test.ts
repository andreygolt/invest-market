import { GET } from '@/app/api/admin/analytics/route';
import type { AnalyticsResponse } from '@/types';
import { NextRequest } from 'next/server';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockRegistrationsQuery = jest.fn();
const mockProjectsQuery = jest.fn();
const mockViewsQuery = jest.fn();
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

type CreatedAtRow = {
  created_at: string;
};

type ViewedAtRow = {
  viewed_at: string;
};

type QueryError = {
  message: string;
};

type AnalyticsBody = AnalyticsResponse & {
  error?: string;
};

function makeRequest(period?: string): NextRequest {
  const url = period
    ? `http://localhost/api/admin/analytics?period=${period}`
    : 'http://localhost/api/admin/analytics';
  return new NextRequest(url);
}

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
  registrations = [],
  projects = [],
  views = [],
  applications = [],
  portfolio = [],
  registrationsError = null,
  projectsError = null,
  viewsError = null,
  applicationsError = null,
  portfolioError = null,
}: {
  registrations?: CreatedAtRow[];
  projects?: CreatedAtRow[];
  views?: ViewedAtRow[];
  applications?: CreatedAtRow[];
  portfolio?: CreatedAtRow[];
  registrationsError?: QueryError | null;
  projectsError?: QueryError | null;
  viewsError?: QueryError | null;
  applicationsError?: QueryError | null;
  portfolioError?: QueryError | null;
} = {}) {
  mockRegistrationsQuery.mockResolvedValue({ data: registrations, error: registrationsError });
  mockProjectsQuery.mockResolvedValue({ data: projects, error: projectsError });
  mockViewsQuery.mockResolvedValue({ data: views, error: viewsError });
  mockApplicationsQuery.mockResolvedValue({ data: applications, error: applicationsError });
  mockPortfolioQuery.mockResolvedValue({ data: portfolio, error: portfolioError });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        gte: mockRegistrationsQuery,
      };
    }
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        gte: mockProjectsQuery,
      };
    }
    if (table === 'deal_room_views') {
      return {
        select: jest.fn().mockReturnThis(),
        gte: mockViewsQuery,
      };
    }
    if (table === 'investor_applications') {
      return {
        select: jest.fn().mockReturnThis(),
        gte: mockApplicationsQuery,
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      gte: mockPortfolioQuery,
    };
  });
}

async function requestAnalytics(period?: string) {
  const response = await GET(makeRequest(period));
  const body = (await response.json()) as AnalyticsBody;
  return { response, body };
}

function setupAllowedRole(role = 'admin') {
  mockUser('admin-1');
  mockRole(role);
  setupAdminQueries();
}

function sumMetric<K extends keyof AnalyticsResponse['totals']>(
  body: AnalyticsResponse,
  key: K
): number {
  return body.buckets.reduce((sum, bucket) => sum + bucket[key], 0);
}

describe('T54 admin analytics', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-28T12:00:00Z'));
    jest.clearAllMocks();
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockRegistrationsQuery.mockReset();
    mockProjectsQuery.mockReset();
    mockViewsQuery.mockReset();
    mockApplicationsQuery.mockReset();
    mockPortfolioQuery.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('GET /api/admin/analytics returns 401 without auth', async () => {
    mockUser(null);

    const { response } = await requestAnalytics();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/analytics returns 403 for investor role', async () => {
    mockUser('investor-1');
    mockRole('investor');

    const { response } = await requestAnalytics();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/analytics returns 403 for moderator role', async () => {
    mockUser('moderator-1');
    mockRole('moderator');

    const { response } = await requestAnalytics();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/analytics returns 200 for admin role', async () => {
    setupAllowedRole('admin');

    const { response } = await requestAnalytics();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/analytics returns 200 for superadmin role', async () => {
    setupAllowedRole('superadmin');

    const { response } = await requestAnalytics();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/analytics?period=7d returns 7 daily buckets', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('7d');

    expect(body.buckets).toHaveLength(7);
    expect(body.buckets[0]?.date_from).toBe('2026-06-21');
  });

  it('GET /api/admin/analytics?period=30d returns 30 daily buckets', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('30d');

    expect(body.buckets).toHaveLength(30);
    expect(body.buckets[0]?.date_from).toBe('2026-05-29');
  });

  it('GET /api/admin/analytics?period=90d returns 13 weekly buckets', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('90d');

    expect(body.buckets).toHaveLength(13);
    expect(body.buckets[0]?.label).toContain('Нед. 1');
  });

  it('GET /api/admin/analytics defaults invalid period to 30d', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('bad');

    expect(body.period).toBe('30d');
    expect(body.buckets).toHaveLength(30);
  });

  it('GET /api/admin/analytics totals.registrations equals bucket sum', async () => {
    setupAllowedRole();
    setupAdminQueries({
      registrations: [
        { created_at: '2026-06-20T10:00:00Z' },
        { created_at: '2026-06-21T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics();

    expect(body.totals.registrations).toBe(sumMetric(body, 'registrations'));
  });

  it('GET /api/admin/analytics totals.applications equals bucket sum', async () => {
    setupAllowedRole();
    setupAdminQueries({
      applications: [
        { created_at: '2026-06-20T10:00:00Z' },
        { created_at: '2026-06-21T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics();

    expect(body.totals.applications).toBe(sumMetric(body, 'applications'));
  });

  it('GET /api/admin/analytics totals.deal_room_views equals bucket sum', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { viewed_at: '2026-06-20T10:00:00Z' },
        { viewed_at: '2026-06-21T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics();

    expect(body.totals.deal_room_views).toBe(sumMetric(body, 'deal_room_views'));
  });

  it('GET /api/admin/analytics totals.project_submissions equals bucket sum', async () => {
    setupAllowedRole();
    setupAdminQueries({
      projects: [
        { created_at: '2026-06-20T10:00:00Z' },
        { created_at: '2026-06-21T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics();

    expect(body.totals.project_submissions).toBe(sumMetric(body, 'project_submissions'));
  });

  it('GET /api/admin/analytics totals.portfolio_entries equals bucket sum', async () => {
    setupAllowedRole();
    setupAdminQueries({
      portfolio: [
        { created_at: '2026-06-20T10:00:00Z' },
        { created_at: '2026-06-21T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics();

    expect(body.totals.portfolio_entries).toBe(sumMetric(body, 'portfolio_entries'));
  });

  it('GET /api/admin/analytics each bucket contains required fields', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('7d');

    expect(body.buckets[0]).toEqual(
      expect.objectContaining({
        label: expect.any(String),
        date_from: expect.any(String),
        registrations: expect.any(Number),
        project_submissions: expect.any(Number),
        deal_room_views: expect.any(Number),
        applications: expect.any(Number),
        portfolio_entries: expect.any(Number),
      })
    );
  });

  it('GET /api/admin/analytics returns 500 if one parallel query fails', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ viewsError: { message: 'db error' } });

    const { response, body } = await requestAnalytics();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch analytics data');
  });

  it('GET /api/admin/analytics excludes registration older than period', async () => {
    setupAllowedRole();
    setupAdminQueries({
      registrations: [
        { created_at: '2026-05-20T10:00:00Z' },
        { created_at: '2026-06-20T10:00:00Z' },
      ],
    });

    const { body } = await requestAnalytics('30d');

    expect(body.totals.registrations).toBe(1);
  });

  it('GET /api/admin/analytics includes registration in the matching bucket', async () => {
    setupAllowedRole();
    setupAdminQueries({
      registrations: [{ created_at: '2026-06-27T10:00:00Z' }],
    });

    const { body } = await requestAnalytics('7d');
    const bucket = body.buckets.find((item) => item.date_from === '2026-06-27');

    expect(bucket?.registrations).toBe(1);
  });

  it('GET /api/admin/analytics response contains requested period', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics('90d');

    expect(body.period).toBe('90d');
  });

  it('AnalyticsResponse type contains period, buckets and totals', async () => {
    setupAllowedRole();

    const { body } = await requestAnalytics();
    const typedBody: AnalyticsResponse = body;

    expect(typedBody).toEqual(
      expect.objectContaining({
        period: expect.any(String),
        buckets: expect.any(Array),
        totals: expect.any(Object),
      })
    );
  });
});
