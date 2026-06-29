import { GET as GET_APPLICATIONS_EXPORT } from '@/app/api/admin/export/applications/route';
import { GET as GET_INVESTORS_EXPORT } from '@/app/api/admin/export/investors/route';
import { GET as GET_PROJECTS_EXPORT } from '@/app/api/admin/export/projects/route';
import { buildCsv, csvEscape } from '@/lib/csv/build';
import type { ApplicationExportRow, InvestorExportRow, ProjectExportRow } from '@/types';

type MockRole = 'admin' | 'superadmin' | 'investor';
type MockError = { message: string } | null;
type MockResult<T> = { data: T; error: MockError };

type MockQuery<T> = PromiseLike<MockResult<T[]>> & {
  select: jest.Mock<MockQuery<T>, [string]>;
  eq: jest.Mock<MockQuery<T>, [string, string]>;
  order: jest.Mock<Promise<MockResult<T[]>>, [string, { ascending: boolean }]>;
};

type ProjectDbRow = {
  id: string;
  name: string | null;
  category: string | null;
  status: string | null;
  created_at: string | null;
  investment_min: number | null;
  investment_max: number | null;
  target_amount: number | null;
  currency: string | null;
};

type ApplicationDbRow = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  created_at: string | null;
  projects: { name?: string } | null;
  profiles: { email?: string; full_name?: string | null } | null;
};

type InvestorDbRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string | null;
  role: MockRole;
};

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

const mockProjectRows: ProjectDbRow[] = [
  {
    id: 'project-1',
    name: 'Проект',
    category: 'IT',
    status: 'approved',
    created_at: '2026-06-28T10:00:00Z',
    investment_min: 1000,
    investment_max: 5000,
    target_amount: 100000,
    currency: 'RUB',
  },
];

const mockApplicationRows: ApplicationDbRow[] = [
  {
    id: 'app-1',
    project_id: 'project-1',
    investor_id: 'investor-1',
    amount: 1000,
    currency: 'RUB',
    status: 'pending',
    created_at: '2026-06-28T11:00:00Z',
    projects: { name: 'Проект' },
    profiles: { email: 'investor@example.com', full_name: 'Investor' },
  },
];

const mockInvestorRows: InvestorDbRow[] = [
  {
    id: 'investor-1',
    email: 'investor@example.com',
    full_name: 'Investor',
    created_at: '2026-06-28T09:00:00Z',
    role: 'investor',
  },
];

let mockRole: MockRole = 'admin';

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

function makeQuery<T>(rows: T[]): MockQuery<T> {
  let filtered = rows;
  const query: MockQuery<T> = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string) => {
      if (column === 'role') {
        filtered = rows.filter((row) => (row as { role?: string }).role === value);
      }
      return query;
    }),
    order: jest.fn(async () => ({ data: filtered, error: null })),
    then: (resolve, reject) => Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
  };
  return query;
}

function setupAuth(role: MockRole = 'admin') {
  mockRole = role;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: { role: mockRole },
      error: null,
    })),
  });
}

function setupAdmin() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeQuery(mockProjectRows);
    if (table === 'investor_applications') return makeQuery(mockApplicationRows);
    if (table === 'profiles') return makeQuery(mockInvestorRows);
    return makeQuery([]);
  });
}

describe('T49 CSV export', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    setupAuth();
    setupAdmin();
  });

  it('csvEscape returns empty string for null/undefined', () => {
    expect(csvEscape(null)).toBe('');
    expect(csvEscape(undefined)).toBe('');
  });

  it('csvEscape does not change simple strings and numbers', () => {
    expect(csvEscape('simple')).toBe('simple');
    expect(csvEscape(123)).toBe('123');
  });

  it('csvEscape wraps comma strings in quotes', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
  });

  it('csvEscape doubles quotes inside string', () => {
    expect(csvEscape('a "b"')).toBe('"a ""b"""');
  });

  it('csvEscape wraps strings with newline in quotes', () => {
    expect(csvEscape('a\nb')).toBe('"a\nb"');
  });

  it('buildCsv first line contains headers', () => {
    const csv = buildCsv([{ id: '1', name: 'Name' }], [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
    ]);

    expect(csv.split('\n')[0]).toBe('ID,Name');
  });

  it('buildCsv data rows follow columns order', () => {
    const csv = buildCsv([{ id: '1', name: 'Name' }], [
      { key: 'name', header: 'Name' },
      { key: 'id', header: 'ID' },
    ]);

    expect(csv.split('\n')[1]).toBe('Name,1');
  });

  it('buildCsv renders null field as empty cell', () => {
    const csv = buildCsv([{ id: '1', name: null }], [
      { key: 'id', header: 'ID' },
      { key: 'name', header: 'Name' },
    ]);

    expect(csv.split('\n')[1]).toBe('1,');
  });

  it('GET /api/admin/export/projects returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET_PROJECTS_EXPORT();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/export/projects returns 403 for investor role', async () => {
    setupAuth('investor');

    const response = await GET_PROJECTS_EXPORT();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/export/projects returns Content-Type: text/csv for admin', async () => {
    const response = await GET_PROJECTS_EXPORT();

    expect(response.headers.get('content-type')).toContain('text/csv');
  });

  it('GET /api/admin/export/projects Content-Disposition contains projects.csv', async () => {
    const response = await GET_PROJECTS_EXPORT();

    expect(response.headers.get('content-disposition')).toContain('projects.csv');
  });

  it('GET /api/admin/export/applications returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET_APPLICATIONS_EXPORT();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/export/applications returns 403 for investor role', async () => {
    setupAuth('investor');

    const response = await GET_APPLICATIONS_EXPORT();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/export/applications returns Content-Type: text/csv for admin', async () => {
    const response = await GET_APPLICATIONS_EXPORT();

    expect(response.headers.get('content-type')).toContain('text/csv');
  });

  it('GET /api/admin/export/investors returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET_INVESTORS_EXPORT();

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/export/investors returns 403 for investor role', async () => {
    setupAuth('investor');

    const response = await GET_INVESTORS_EXPORT();

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/export/investors returns Content-Type: text/csv for superadmin', async () => {
    setupAuth('superadmin');

    const response = await GET_INVESTORS_EXPORT();

    expect(response.headers.get('content-type')).toContain('text/csv');
  });

  it('GET /api/admin/export/investors Content-Disposition contains investors.csv', async () => {
    const response = await GET_INVESTORS_EXPORT();

    expect(response.headers.get('content-disposition')).toContain('investors.csv');
  });

  it('ProjectExportRow, ApplicationExportRow, InvestorExportRow types contain expected fields', () => {
    const project: ProjectExportRow = {
      id: 'project-1',
      name: 'Project',
      category: 'IT',
      status: 'approved',
      created_at: '2026-06-28T10:00:00Z',
      investment_min: 1000,
      investment_max: 5000,
      target_amount: 100000,
      currency: 'RUB',
    };
    const application: ApplicationExportRow = {
      id: 'app-1',
      project_id: 'project-1',
      project_name: 'Project',
      investor_id: 'investor-1',
      investor_email: 'investor@example.com',
      amount: 1000,
      currency: 'RUB',
      status: 'pending',
      created_at: '2026-06-28T11:00:00Z',
    };
    const investor: InvestorExportRow = {
      id: 'investor-1',
      email: 'investor@example.com',
      full_name: null,
      created_at: '2026-06-28T09:00:00Z',
    };

    expect(Object.keys(project)).toEqual([
      'id',
      'name',
      'category',
      'status',
      'created_at',
      'investment_min',
      'investment_max',
      'target_amount',
      'currency',
    ]);
    expect(Object.keys(application)).toEqual([
      'id',
      'project_id',
      'project_name',
      'investor_id',
      'investor_email',
      'amount',
      'currency',
      'status',
      'created_at',
    ]);
    expect(Object.keys(investor)).toEqual(['id', 'email', 'full_name', 'created_at']);
  });
});
