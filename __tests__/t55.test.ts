import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/search/route';
import type {
  GlobalSearchResponse,
  SearchApplicationResult,
  SearchInvestorResult,
  SearchProjectResult,
} from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

type MockError = { message: string } | null;
type QueryResult = { data: unknown[]; error: MockError };
type Role = 'admin' | 'superadmin' | 'moderator' | 'investor' | null;

const emptyResult: QueryResult = { data: [], error: null };

let projectResult: QueryResult = emptyResult;
let investorResult: QueryResult = emptyResult;
let applicationResult: QueryResult = emptyResult;

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

function makeRequest(q?: string): NextRequest {
  const url =
    q != null
      ? `http://localhost/api/admin/search?q=${encodeURIComponent(q)}`
      : 'http://localhost/api/admin/search';
  return new NextRequest(url);
}

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function mockRole(role: Role) {
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: role === null ? null : { role },
      error: null,
    })),
  });
}

function makeSearchQuery(result: QueryResult) {
  return {
    select: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    limit: jest.fn(async () => result),
  };
}

function setupAdminQueries() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeSearchQuery(projectResult);
    if (table === 'profiles') return makeSearchQuery(investorResult);
    if (table === 'investor_applications') return makeSearchQuery(applicationResult);
    return makeSearchQuery(emptyResult);
  });
}

async function readJson(response: Response): Promise<GlobalSearchResponse & { error?: string }> {
  return (await response.json()) as GlobalSearchResponse & { error?: string };
}

describe('T55 GET /api/admin/search', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    projectResult = emptyResult;
    investorResult = emptyResult;
    applicationResult = emptyResult;
    mockUser('admin-1');
    mockRole('admin');
    setupAdminQueries();
  });

  it('returns 401 without auth', async () => {
    mockUser(null);

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 for investor role', async () => {
    mockRole('investor');

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 403 for moderator role', async () => {
    mockRole('moderator');

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 for admin role', async () => {
    mockRole('admin');

    const response = await GET(makeRequest('test'));

    expect(response.status).toBe(200);
  });

  it('returns 200 for superadmin role', async () => {
    mockRole('superadmin');

    const response = await GET(makeRequest('test'));

    expect(response.status).toBe(200);
  });

  it('returns empty response for one-character query', async () => {
    const response = await GET(makeRequest('a'));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ query: 'a', projects: [], investors: [], applications: [] });
  });

  it('returns empty response for whitespace query', async () => {
    const response = await GET(makeRequest('  '));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ query: '', projects: [], investors: [], applications: [] });
  });

  it('returns query, projects, investors, and applications', async () => {
    projectResult = {
      data: [{ id: 'p-1', name: 'Test Project', category: 'FinTech', status: 'approved' }],
      error: null,
    };
    investorResult = {
      data: [
        {
          id: 'i-1',
          full_name: 'Investor One',
          email: 'investor@test.com',
          created_at: '2026-06-28T00:00:00Z',
        },
      ],
      error: null,
    };
    applicationResult = {
      data: [
        {
          id: 'a-1',
          project_id: 'p-1',
          investor_id: 'i-1',
          amount: 1000000,
          status: 'pending',
          projects: { name: 'Test Project' },
          profiles: { email: 'investor@test.com' },
        },
      ],
      error: null,
    };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body.query).toBe('test');
    expect(body.projects).toHaveLength(1);
    expect(body.investors).toHaveLength(1);
    expect(body.applications).toHaveLength(1);
  });

  it('projects contain id, name, category, status', async () => {
    projectResult = {
      data: [{ id: 'p-1', name: 'Test Project', category: 'FinTech', status: 'approved' }],
      error: null,
    };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(body.projects[0]).toEqual({
      id: 'p-1',
      name: 'Test Project',
      category: 'FinTech',
      status: 'approved',
    });
  });

  it('investors contain id, full_name, email, created_at', async () => {
    investorResult = {
      data: [
        {
          id: 'i-1',
          full_name: null,
          email: 'investor@test.com',
          created_at: '2026-06-28T00:00:00Z',
        },
      ],
      error: null,
    };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(body.investors[0]).toEqual({
      id: 'i-1',
      full_name: null,
      email: 'investor@test.com',
      created_at: '2026-06-28T00:00:00Z',
    });
  });

  it('applications contain id, project_name, investor_email, status', async () => {
    applicationResult = {
      data: [
        {
          id: 'a-1',
          project_id: 'p-1',
          investor_id: 'i-1',
          amount: null,
          status: 'pending',
          projects: { name: 'Test Project' },
          profiles: { email: 'investor@test.com' },
        },
      ],
      error: null,
    };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(body.applications[0]).toMatchObject({
      id: 'a-1',
      project_name: 'Test Project',
      investor_email: 'investor@test.com',
      status: 'pending',
    });
  });

  it('query field matches the passed parameter', async () => {
    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(body.query).toBe('test');
  });

  it('returns empty response without q', async () => {
    const response = await GET(makeRequest());
    const body = await readJson(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ query: '', projects: [], investors: [], applications: [] });
  });

  it('returns 500 if projects query fails', async () => {
    projectResult = { data: [], error: { message: 'projects failed' } };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('Search failed');
  });

  it('returns 500 if investors query fails', async () => {
    investorResult = { data: [], error: { message: 'investors failed' } };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('Search failed');
  });

  it('returns 500 if applications query fails', async () => {
    applicationResult = { data: [], error: { message: 'applications failed' } };
    setupAdminQueries();

    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('Search failed');
  });

  it('projects is empty array when there are no matches', async () => {
    const response = await GET(makeRequest('test'));
    const body = await readJson(response);

    expect(body.projects).toEqual([]);
  });
});

describe('T55 search types', () => {
  it('GlobalSearchResponse contains query, projects, investors, applications', () => {
    const response: GlobalSearchResponse = {
      query: 'test',
      projects: [],
      investors: [],
      applications: [],
    };

    expect(response.query).toBe('test');
    expect(Array.isArray(response.projects)).toBe(true);
    expect(Array.isArray(response.investors)).toBe(true);
    expect(Array.isArray(response.applications)).toBe(true);
  });

  it('SearchProjectResult contains id, name, category, status', () => {
    const project: SearchProjectResult = {
      id: 'p-1',
      name: 'Test Project',
      category: 'FinTech',
      status: 'approved',
    };

    expect(project).toMatchObject({
      id: 'p-1',
      name: 'Test Project',
      category: 'FinTech',
      status: 'approved',
    });
  });

  it('SearchInvestorResult contains id, full_name, email, created_at', () => {
    const investor: SearchInvestorResult = {
      id: 'i-1',
      full_name: null,
      email: 'investor@test.com',
      created_at: '2026-06-28T00:00:00Z',
    };

    expect(investor).toMatchObject({
      id: 'i-1',
      full_name: null,
      email: 'investor@test.com',
      created_at: '2026-06-28T00:00:00Z',
    });
  });

  it('SearchApplicationResult contains id, project_name, investor_email, status', () => {
    const application: SearchApplicationResult = {
      id: 'a-1',
      project_id: 'p-1',
      project_name: 'Test Project',
      investor_id: 'i-1',
      investor_email: 'investor@test.com',
      amount: null,
      status: 'pending',
    };

    expect(application).toMatchObject({
      id: 'a-1',
      project_name: 'Test Project',
      investor_email: 'investor@test.com',
      status: 'pending',
    });
  });
});
