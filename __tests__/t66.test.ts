import { GET, escapeCSV } from '@/app/api/manager/export/applications/route';
import { NextRequest } from 'next/server';

type MockUser = { id: string } | null;
type MockRole = 'manager' | 'admin' | 'superadmin' | 'investor' | 'project';
type MockApplicationRow = {
  id: string;
  status: string;
  amount: number | null;
  instrument: string | null;
  message: string | null;
  created_at: string;
  rejection_reason: string | null;
  projects: { name: string | null } | null;
  users: { email: string | null } | null;
};
type MockQueryResult = { data: MockApplicationRow[]; error: { message: string } | null };
type MockQuery = PromiseLike<MockQueryResult> & {
  select: jest.Mock<MockQuery, [string]>;
  order: jest.Mock<MockQuery, [string, { ascending: boolean }]>;
  eq: jest.Mock<MockQuery, [string, string]>;
  gte: jest.Mock<MockQuery, [string, string]>;
  lte: jest.Mock<MockQuery, [string, string]>;
};

let mockUser: MockUser = { id: 'manager-1' };
let mockRole: MockRole = 'manager';
let mockApplicationRows: MockApplicationRow[] = [];
let mockQuery: MockQuery;

const mockApplicationRow: MockApplicationRow = {
  id: 'app-1',
  status: 'pending',
  amount: 500000,
  instrument: 'equity',
  message: 'Хочу инвестировать',
  created_at: '2026-06-01T10:00:00Z',
  rejection_reason: null,
  projects: { name: 'Alpha Project' },
  users: { email: 'investor@test.com' },
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: mockUser },
      }),
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'users') {
        const usersQuery = {
          select: jest.fn(() => usersQuery),
          eq: jest.fn(() => usersQuery),
          single: jest.fn().mockResolvedValue({
            data: mockRole ? { role: mockRole } : null,
            error: null,
          }),
        };
        return usersQuery;
      }

      if (table === 'investor_applications') {
        mockQuery = makeApplicationQuery(mockApplicationRows);
        return mockQuery;
      }

      return {};
    }),
  })),
}));

function makeApplicationQuery(rows: MockApplicationRow[]): MockQuery {
  const result: MockQueryResult = { data: rows, error: null };
  const query: MockQuery = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    eq: jest.fn(() => query),
    gte: jest.fn(() => query),
    lte: jest.fn(() => query),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

function makeRequest(url = 'http://localhost/api/manager/export/applications') {
  return new NextRequest(url);
}

beforeEach(() => {
  mockUser = { id: 'manager-1' };
  mockRole = 'manager';
  mockApplicationRows = [mockApplicationRow];
  mockQuery = makeApplicationQuery(mockApplicationRows);
});

describe('T66 GET /api/manager/export/applications', () => {
  it('возвращает 401 без авторизации', async () => {
    mockUser = null;

    const response = await GET(makeRequest());

    expect(response.status).toBe(401);
  });

  it('возвращает 403 для роли investor', async () => {
    mockRole = 'investor';

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
  });

  it('возвращает 403 для роли project', async () => {
    mockRole = 'project';

    const response = await GET(makeRequest());

    expect(response.status).toBe(403);
  });

  it('возвращает 200 и Content-Type: text/csv для роли manager', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
  });

  it('возвращает 200 и Content-Type: text/csv для роли admin', async () => {
    mockRole = 'admin';

    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
  });

  it('Content-Disposition содержит applications- и .csv', async () => {
    const response = await GET(makeRequest());
    const disposition = response.headers.get('content-disposition');

    expect(disposition).toContain('applications-');
    expect(disposition).toContain('.csv');
  });

  it('тело ответа — строка CSV, первая строка содержит ID', async () => {
    const response = await GET(makeRequest());
    const text = await response.text();

    expect(typeof text).toBe('string');
    expect(text.split('\n')[0]).toContain('ID');
  });

  it('CSV содержит данные заявки', async () => {
    const response = await GET(makeRequest());
    const text = await response.text();

    expect(text).toContain('Alpha Project');
    expect(text).toContain('investor@test.com');
    expect(text).toContain('pending');
  });

  it('пустой список заявок возвращает CSV только с заголовком', async () => {
    mockApplicationRows = [];

    const response = await GET(makeRequest());
    const text = await response.text();

    expect(text.split('\n')).toHaveLength(1);
    expect(text).toContain('ID');
  });

  it('query-параметр status=pending вызывает .eq', async () => {
    await GET(makeRequest('http://localhost/api/manager/export/applications?status=pending'));

    expect(mockQuery.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('query-параметр date_from вызывает .gte на created_at', async () => {
    await GET(makeRequest('http://localhost/api/manager/export/applications?date_from=2026-06-01'));

    expect(mockQuery.gte).toHaveBeenCalledWith('created_at', '2026-06-01');
  });

  it('query-параметр date_to вызывает .lte на created_at', async () => {
    await GET(makeRequest('http://localhost/api/manager/export/applications?date_to=2026-06-30'));

    expect(mockQuery.lte).toHaveBeenCalledWith('created_at', '2026-06-30');
  });
});

describe('T66 escapeCSV', () => {
  it('значение с запятой оборачивается в двойные кавычки', () => {
    expect(escapeCSV('a,b')).toBe('"a,b"');
  });

  it('значение с двойной кавычкой экранируется как две кавычки', () => {
    expect(escapeCSV('a "b"')).toBe('"a ""b"""');
  });

  it('null возвращает пустую строку', () => {
    expect(escapeCSV(null)).toBe('');
  });

  it('undefined возвращает пустую строку', () => {
    expect(escapeCSV(undefined)).toBe('');
  });

  it('число возвращает строкой без изменений', () => {
    expect(escapeCSV(123)).toBe('123');
  });

  it('обычная строка без спецсимволов возвращается без изменений', () => {
    expect(escapeCSV('plain')).toBe('plain');
  });
});
