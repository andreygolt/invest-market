import { NextRequest } from 'next/server';
import { GET as catalogGet } from '@/app/api/investor/catalog/route';
import type { CatalogResponse, InvestorCatalogItem } from '@/types';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

type QueryResult<T> = {
  data?: T;
  count?: number | null;
  error: { message: string } | null;
};

type SelectOptions = {
  count?: 'exact';
  head?: boolean;
};

const mockItems: InvestorCatalogItem[] = [
  {
    id: 'project-1',
    name: 'Test Project',
    created_at: '2026-06-28T00:00:00Z',
    updated_at: '2026-06-28T00:00:00Z',
    industry: 'IT',
    stage: 'seed',
    country: 'Russia',
    city: 'Moscow',
    description: 'Project description',
    short_description: 'Short test description',
    investment_ask: '5000000',
    investment_type: 'equity',
    valuation_pre_money: '20000000',
    ai_score: 8,
    ai_summary: 'Good project',
  },
];

const mockRange = jest.fn<Promise<QueryResult<InvestorCatalogItem[]>>, [number, number]>();
const mockEq = jest.fn();
const mockOr = jest.fn();
const mockOrder = jest.fn();

function makeCatalogQuery() {
  let head = false;
  const query = {
    select: jest.fn((columns: string, options?: SelectOptions) => {
      head = Boolean(options?.head);
      return query;
    }),
    eq: jest.fn((column: string, value: string) => {
      mockEq(column, value);
      return query;
    }),
    or: jest.fn((filters: string) => {
      mockOr(filters);
      return query;
    }),
    order: jest.fn((column: string, options: { ascending: boolean; nullsFirst?: boolean }) => {
      mockOrder(column, options);
      return query;
    }),
    range: mockRange,
    then: (
      resolve: (value: QueryResult<InvestorCatalogItem[]>) => unknown,
      reject: (reason?: unknown) => unknown
    ) => {
      const result: QueryResult<InvestorCatalogItem[]> = head
        ? { count: 7, error: null }
        : { data: mockItems, error: null };
      return Promise.resolve(result).then(resolve, reject);
    },
  };

  return query;
}

async function getCatalog(url: string) {
  const response = await catalogGet(new NextRequest(url));
  const body = (await response.json()) as CatalogResponse;
  return { response, body };
}

describe('T40 investor catalog search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockRange.mockResolvedValue({ data: mockItems, error: null });
    mockFrom.mockImplementation(() => makeCatalogQuery());
  });

  it('GET /api/investor/catalog?q=Tech applies ilike search to data and count queries', async () => {
    await getCatalog('http://localhost/api/investor/catalog?q=Tech');

    expect(mockOr).toHaveBeenCalledTimes(2);
    expect(mockOr).toHaveBeenCalledWith(
      expect.stringContaining('name.ilike.%Tech%')
    );
    expect(mockOr).toHaveBeenCalledWith(
      expect.stringContaining('short_description.ilike.%Tech%')
    );
  });

  it('GET /api/investor/catalog?q=   ignores blank search after trim', async () => {
    await getCatalog('http://localhost/api/investor/catalog?q=%20%20%20');

    expect(mockOr).not.toHaveBeenCalled();
  });

  it('GET /api/investor/catalog without q does not apply ilike search', async () => {
    await getCatalog('http://localhost/api/investor/catalog');

    expect(mockOr).not.toHaveBeenCalled();
  });

  it('GET /api/investor/catalog?q=Test&page=2&per_page=5 works with pagination', async () => {
    const { body } = await getCatalog(
      'http://localhost/api/investor/catalog?q=Test&page=2&per_page=5'
    );

    expect(mockOr).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenCalledWith(5, 9);
    expect(body.page).toBe(2);
    expect(body.per_page).toBe(5);
  });

  it('GET /api/investor/catalog?q=Test&industry=IT works with industry filter', async () => {
    await getCatalog('http://localhost/api/investor/catalog?q=Test&industry=IT');

    expect(mockEq).toHaveBeenCalledWith('industry', 'IT');
    expect(mockOr).toHaveBeenCalledTimes(2);
  });

  it('GET /api/investor/catalog?q=Test&stage=seed works with stage filter', async () => {
    await getCatalog('http://localhost/api/investor/catalog?q=Test&stage=seed');

    expect(mockEq).toHaveBeenCalledWith('stage', 'seed');
    expect(mockOr).toHaveBeenCalledTimes(2);
  });

  it('GET /api/investor/catalog?q=Test returns catalog response shape', async () => {
    const { response, body } = await getCatalog('http://localhost/api/investor/catalog?q=Test');

    expect(response.status).toBe(200);
    expect(body).toEqual({
      items: mockItems,
      total: 7,
      page: 1,
      per_page: 12,
      total_pages: 1,
    });
  });

  it('GET /api/investor/catalog?q=Test&sort=amount_asc works with sorting', async () => {
    await getCatalog('http://localhost/api/investor/catalog?q=Test&sort=amount_asc');

    expect(mockOr).toHaveBeenCalledTimes(2);
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('GET /api/investor/catalog returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await catalogGet(new NextRequest('http://localhost/api/investor/catalog'));

    expect(response.status).toBe(401);
  });

  it('GET /api/investor/catalog?q=Test uses count query total for found items', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?q=Test');

    expect(mockOr).toHaveBeenCalledTimes(2);
    expect(body.total).toBe(7);
  });
});
