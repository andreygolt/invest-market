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
    name: 'Project 1',
    created_at: '2026-06-28T00:00:00Z',
    updated_at: '2026-06-28T00:00:00Z',
    industry: 'FinTech',
    stage: 'seed',
    country: 'Russia',
    city: 'Moscow',
    description: 'Project description',
    investment_ask: '5000000',
    investment_type: 'equity',
    valuation_pre_money: '20000000',
    ai_score: 8,
    ai_summary: 'Good project',
  },
];

const mockRange = jest.fn<Promise<QueryResult<InvestorCatalogItem[]>>, [number, number]>();
const mockEq = jest.fn();
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
        ? { count: 42, error: null }
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

describe('T39 investor catalog pagination API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockRange.mockResolvedValue({ data: mockItems, error: null });
    mockFrom.mockImplementation(() => makeCatalogQuery());
  });

  it('GET /api/investor/catalog returns items, total, page, per_page, total_pages', async () => {
    const { response, body } = await getCatalog('http://localhost/api/investor/catalog');

    expect(response.status).toBe(200);
    expect(body).toEqual({
      items: mockItems,
      total: 42,
      page: 1,
      per_page: 12,
      total_pages: 4,
    });
  });

  it('GET /api/investor/catalog?page=2&per_page=5 uses offset 5 and range(5, 9)', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?page=2&per_page=5');

    expect(mockRange).toHaveBeenCalledWith(5, 9);
    expect(body.page).toBe(2);
    expect(body.per_page).toBe(5);
  });

  it('GET /api/investor/catalog?page=1&per_page=12 uses default first-page offset 0', async () => {
    await getCatalog('http://localhost/api/investor/catalog?page=1&per_page=12');

    expect(mockRange).toHaveBeenCalledWith(0, 11);
  });

  it('GET /api/investor/catalog?per_page=100 clamps per_page to 50', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?per_page=100');

    expect(mockRange).toHaveBeenCalledWith(0, 49);
    expect(body.per_page).toBe(50);
  });

  it('GET /api/investor/catalog?per_page=0 clamps per_page to at least 1', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?per_page=0');

    expect(mockRange).toHaveBeenCalledWith(0, 0);
    expect(body.per_page).toBe(1);
  });

  it('GET /api/investor/catalog?page=-1 clamps page to at least 1', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?page=-1');

    expect(mockRange).toHaveBeenCalledWith(0, 11);
    expect(body.page).toBe(1);
  });

  it('GET /api/investor/catalog calculates total_pages as ceil(total / per_page)', async () => {
    const { body } = await getCatalog('http://localhost/api/investor/catalog?per_page=5');

    expect(body.total_pages).toBe(9);
  });

  it('GET /api/investor/catalog applies industry filter with pagination', async () => {
    await getCatalog('http://localhost/api/investor/catalog?industry=FinTech&page=2');

    expect(mockEq).toHaveBeenCalledWith('industry', 'FinTech');
    expect(mockRange).toHaveBeenCalledWith(12, 23);
  });

  it('GET /api/investor/catalog applies stage filter with pagination', async () => {
    await getCatalog('http://localhost/api/investor/catalog?stage=seed&page=2');

    expect(mockEq).toHaveBeenCalledWith('stage', 'seed');
    expect(mockRange).toHaveBeenCalledWith(12, 23);
  });

  it('GET /api/investor/catalog applies sorting with pagination', async () => {
    await getCatalog('http://localhost/api/investor/catalog?sort=score_desc&page=2');

    expect(mockOrder).toHaveBeenCalledWith('ai_score', {
      ascending: false,
      nullsFirst: false,
    });
    expect(mockRange).toHaveBeenCalledWith(12, 23);
  });

  it('GET /api/investor/catalog returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await catalogGet(new NextRequest('http://localhost/api/investor/catalog'));

    expect(response.status).toBe(401);
  });

  it('CatalogResponse type contains fields items, total, page, per_page, total_pages', () => {
    const response: CatalogResponse = {
      items: [],
      total: 0,
      page: 1,
      per_page: 12,
      total_pages: 0,
    };

    expect(Object.keys(response)).toEqual(['items', 'total', 'page', 'per_page', 'total_pages']);
  });
});
