import { GET } from '@/app/api/admin/funnel/route';
import type { FunnelRow } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockProjectsQuery = jest.fn();
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

type ProjectRow = {
  id: string;
  name: string;
  category: string;
};

type ViewRow = {
  project_id: string;
  investor_id: string;
};

type ProjectIdRow = {
  project_id: string;
};

type QueryError = {
  message: string;
};

type FunnelBody = {
  rows?: FunnelRow[];
  error?: string;
};

const projectOne: ProjectRow = { id: 'project-1', name: 'Тест Проект', category: 'tech' };

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
  projects = [projectOne],
  views = [
    { project_id: 'project-1', investor_id: 'inv-1' },
    { project_id: 'project-1', investor_id: 'inv-2' },
  ],
  favorites = [{ project_id: 'project-1' }],
  applications = [{ project_id: 'project-1' }],
  portfolio = [],
  projectsError = null,
  viewsError = null,
  favoritesError = null,
  applicationsError = null,
  portfolioError = null,
}: {
  projects?: ProjectRow[];
  views?: ViewRow[];
  favorites?: ProjectIdRow[];
  applications?: ProjectIdRow[];
  portfolio?: ProjectIdRow[];
  projectsError?: QueryError | null;
  viewsError?: QueryError | null;
  favoritesError?: QueryError | null;
  applicationsError?: QueryError | null;
  portfolioError?: QueryError | null;
} = {}) {
  mockProjectsQuery.mockResolvedValue({ data: projects, error: projectsError });
  mockViewsQuery.mockResolvedValue({ data: views, error: viewsError });
  mockFavoritesQuery.mockResolvedValue({ data: favorites, error: favoritesError });
  mockApplicationsQuery.mockResolvedValue({ data: applications, error: applicationsError });
  mockPortfolioQuery.mockResolvedValue({ data: portfolio, error: portfolioError });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: mockProjectsQuery,
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

async function requestFunnel() {
  const response = await GET();
  const body = (await response.json()) as FunnelBody;
  return { response, body };
}

function setupAllowedRole(role = 'admin') {
  mockUser('admin-1');
  mockRole(role);
  setupAdminQueries();
}

describe('T52 admin funnel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockProjectsQuery.mockReset();
    mockViewsQuery.mockReset();
    mockFavoritesQuery.mockReset();
    mockApplicationsQuery.mockReset();
    mockPortfolioQuery.mockReset();
  });

  it('GET /api/admin/funnel returns 401 without auth', async () => {
    mockUser(null);

    const { response } = await requestFunnel();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/funnel returns 403 for investor role', async () => {
    mockUser('investor-1');
    mockRole('investor');

    const { response } = await requestFunnel();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/funnel returns 200 for admin role', async () => {
    setupAllowedRole('admin');

    const { response } = await requestFunnel();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/funnel returns 200 for superadmin role', async () => {
    setupAllowedRole('superadmin');

    const { response } = await requestFunnel();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/funnel returns 200 for moderator role', async () => {
    setupAllowedRole('moderator');

    const { response } = await requestFunnel();

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/funnel returns empty rows if there are no approved projects', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ projects: [] });

    const { body } = await requestFunnel();

    expect(body).toEqual({ rows: [] });
  });

  it('GET /api/admin/funnel rows include project_id, project_name, views_count, unique_viewers', async () => {
    setupAllowedRole();

    const { body } = await requestFunnel();

    expect(body.rows?.[0]).toEqual(
      expect.objectContaining({
        project_id: 'project-1',
        project_name: 'Тест Проект',
        views_count: 2,
        unique_viewers: 2,
      })
    );
  });

  it('GET /api/admin/funnel views_count equals deal_room_views rows for project', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-1', investor_id: 'inv-2' },
        { project_id: 'project-1', investor_id: 'inv-3' },
      ],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.views_count).toBe(3);
  });

  it('GET /api/admin/funnel unique_viewers counts unique investor_id values', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-1', investor_id: 'inv-2' },
      ],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.unique_viewers).toBe(2);
  });

  it('GET /api/admin/funnel favorites_count equals investor_favorites rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      favorites: [{ project_id: 'project-1' }, { project_id: 'project-1' }],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.favorites_count).toBe(2);
  });

  it('GET /api/admin/funnel applications_count equals investor_applications rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      applications: [{ project_id: 'project-1' }, { project_id: 'project-1' }],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.applications_count).toBe(2);
  });

  it('GET /api/admin/funnel portfolio_count equals investor_portfolio rows', async () => {
    setupAllowedRole();
    setupAdminQueries({
      portfolio: [{ project_id: 'project-1' }, { project_id: 'project-1' }],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.portfolio_count).toBe(2);
  });

  it('GET /api/admin/funnel conversion_rate equals applications_count / unique_viewers * 100', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-1', investor_id: 'inv-2' },
      ],
      applications: [{ project_id: 'project-1' }],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.conversion_rate).toBe(50);
  });

  it('GET /api/admin/funnel conversion_rate is 0 if unique_viewers is 0', async () => {
    setupAllowedRole();
    setupAdminQueries({ views: [], applications: [{ project_id: 'project-1' }] });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.conversion_rate).toBe(0);
  });

  it('GET /api/admin/funnel rows are sorted by views_count DESC', async () => {
    setupAllowedRole();
    setupAdminQueries({
      projects: [
        { id: 'project-1', name: 'Проект 1', category: 'tech' },
        { id: 'project-2', name: 'Проект 2', category: 'retail' },
      ],
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-2', investor_id: 'inv-1' },
        { project_id: 'project-2', investor_id: 'inv-2' },
      ],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.map((row) => row.project_id)).toEqual(['project-2', 'project-1']);
  });

  it('FunnelRow type contains all expected fields', () => {
    const row: FunnelRow = {
      project_id: 'project-1',
      project_name: 'Тест Проект',
      category: 'tech',
      views_count: 1,
      unique_viewers: 1,
      favorites_count: 1,
      applications_count: 1,
      portfolio_count: 1,
      conversion_rate: 100,
    };

    expect(Object.keys(row).sort()).toEqual(
      [
        'applications_count',
        'category',
        'conversion_rate',
        'favorites_count',
        'portfolio_count',
        'project_id',
        'project_name',
        'unique_viewers',
        'views_count',
      ].sort()
    );
  });

  it('GET /api/admin/funnel returns 500 if projects query fails', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ projectsError: { message: 'db error' } });

    const { response, body } = await requestFunnel();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch projects');
  });

  it('GET /api/admin/funnel returns 500 if one aggregate query fails', async () => {
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries({ favoritesError: { message: 'db error' } });

    const { response, body } = await requestFunnel();

    expect(response.status).toBe(500);
    expect(body.error).toBe('Failed to fetch funnel data');
  });

  it('GET /api/admin/funnel conversion_rate is rounded to 1 decimal place', async () => {
    setupAllowedRole();
    setupAdminQueries({
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-1', investor_id: 'inv-2' },
        { project_id: 'project-1', investor_id: 'inv-3' },
      ],
      applications: [{ project_id: 'project-1' }],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.conversion_rate).toBe(33.3);
  });

  it('GET /api/admin/funnel sorts two projects correctly with the most viewed first', async () => {
    setupAllowedRole();
    setupAdminQueries({
      projects: [
        { id: 'project-1', name: 'Проект 1', category: 'tech' },
        { id: 'project-2', name: 'Проект 2', category: 'retail' },
      ],
      views: [
        { project_id: 'project-1', investor_id: 'inv-1' },
        { project_id: 'project-2', investor_id: 'inv-1' },
        { project_id: 'project-2', investor_id: 'inv-2' },
        { project_id: 'project-2', investor_id: 'inv-3' },
      ],
    });

    const { body } = await requestFunnel();

    expect(body.rows?.[0]?.project_id).toBe('project-2');
  });
});
