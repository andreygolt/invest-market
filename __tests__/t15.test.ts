import { NextRequest } from 'next/server';
import { GET as adminGet, POST as adminPost } from '@/app/api/admin/commercial-terms/route';
import { GET as projectGet } from '@/app/api/project/commercial-terms/route';
import type { CommercialTermsRow } from '@/types';

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

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeProjectsListQuery(data: unknown[]) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        order: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function makeUpsertQuery(data: CommercialTermsRow) {
  return {
    upsert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function makeMaybeSingleQuery(data: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

describe('T15 admin commercial terms API', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/admin/commercial-terms returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await adminGet();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/admin/commercial-terms returns 403 for investor role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeProjectsListQuery([]);
    });

    const response = await adminGet();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('POST /api/admin/commercial-terms returns 400 for invalid success_fee_pct', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      return makeProjectsListQuery([]);
    });

    const request = new NextRequest('http://localhost/api/admin/commercial-terms', {
      method: 'POST',
      body: JSON.stringify({
        project_id: 'project-1',
        success_fee_pct: 101,
        fixed_fee: 0,
      }),
    });

    const response = await adminPost(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid commercial terms');
  });

  it('POST /api/admin/commercial-terms returns 200 and upserts valid data for admin', async () => {
    const row: CommercialTermsRow = {
      id: 'terms-1',
      project_id: 'project-1',
      success_fee_pct: 5,
      fixed_fee: 10_000,
      notes: 'Базовые условия',
      created_by: 'admin-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const commercialTermsQuery = makeUpsertQuery(row);

    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'commercial_terms') return commercialTermsQuery;
      return makeProjectsListQuery([]);
    });

    const request = new NextRequest('http://localhost/api/admin/commercial-terms', {
      method: 'POST',
      body: JSON.stringify({
        project_id: 'project-1',
        success_fee_pct: 5,
        fixed_fee: 10_000,
        notes: 'Базовые условия',
      }),
    });

    const response = await adminPost(request);
    const body = (await response.json()) as CommercialTermsRow;

    expect(response.status).toBe(200);
    expect(commercialTermsQuery.upsert).toHaveBeenCalled();
    expect(body.project_id).toBe('project-1');
    expect(body.success_fee_pct).toBe(5);
    expect(body.fixed_fee).toBe(10_000);
  });
});

describe('T15 project commercial terms API', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/project/commercial-terms returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await projectGet();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/project/commercial-terms returns null summary when terms are missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'project-owner-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeMaybeSingleQuery({ id: 'project-1' });
      if (table === 'commercial_terms') return makeMaybeSingleQuery(null);
      return makeProjectsListQuery([]);
    });

    const response = await projectGet();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ terms: null, estimated_fee: null });
  });
});

describe('T15 CommercialTermsRow type', () => {
  it('has success_fee_pct, fixed_fee and project_id fields', () => {
    const row: CommercialTermsRow = {
      id: 'terms-1',
      project_id: 'project-1',
      success_fee_pct: 5,
      fixed_fee: 0,
      notes: null,
      created_by: 'admin-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    expect(typeof row.project_id).toBe('string');
    expect(typeof row.success_fee_pct).toBe('number');
    expect(typeof row.fixed_fee).toBe('number');
  });
});
