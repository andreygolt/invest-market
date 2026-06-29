import { NextRequest } from 'next/server';
import { GET } from '@/app/api/admin/applications/route';
import { PATCH } from '@/app/api/admin/applications/[id]/route';
import type { AdminApplicationItem } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

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

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function mockRole(role: string | null) {
  if (role === null) {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    return;
  }

  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockServerFrom.mockImplementation((table: string) => {
    if (table === 'users') return makeRoleQuery(role);
    return {};
  });
}

const appRow = {
  id: 'app-1',
  project_id: 'project-1',
  investor_id: 'investor-1',
  amount: 1000000,
  status: 'pending',
  message: 'Комментарий',
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
  projects: { name: 'Проект' },
  users: { full_name: 'Инвестор', email: 'investor@example.com' },
};

function makeListQuery() {
  const query = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    eq: jest.fn(() => query),
    then: (onfulfilled?: (value: { data: typeof appRow[]; error: null }) => unknown) =>
      Promise.resolve({ data: [appRow], error: null }).then(onfulfilled),
  };
  return query;
}

function makePatchQuery(currentStatus = 'pending') {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({
          data: { id: 'app-1', status: currentStatus },
          error: null,
        })),
      })),
    })),
    update: jest.fn(() => ({
      eq: jest.fn(async () => ({ data: null, error: null })),
    })),
  };
}

describe('T24 admin applications', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
  });

  it('GET /api/admin/applications returns 401 without auth', async () => {
    mockRole(null);

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/applications returns 403 for role=investor', async () => {
    mockRole('investor');

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/applications returns 403 for role=project', async () => {
    mockRole('project');

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/applications returns 200 for role=admin', async () => {
    mockRole('admin');
    mockAdminFrom.mockReturnValue(makeListQuery());

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));
    const body = (await response.json()) as { applications: AdminApplicationItem[] };

    expect(response.status).toBe(200);
    expect(body.applications[0].id).toBe('app-1');
  });

  it('GET /api/admin/applications returns 200 for role=manager', async () => {
    mockRole('manager');
    mockAdminFrom.mockReturnValue(makeListQuery());

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/applications returns 200 for role=moderator', async () => {
    mockRole('moderator');
    mockAdminFrom.mockReturnValue(makeListQuery());

    const response = await GET(new NextRequest('http://localhost/api/admin/applications'));

    expect(response.status).toBe(200);
  });

  it('PATCH /api/admin/applications/[id] returns 401 without auth', async () => {
    mockRole(null);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'app-1' }) }
    );

    expect(response.status).toBe(401);
  });

  it('PATCH /api/admin/applications/[id] returns 403 for role=investor', async () => {
    mockRole('investor');

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'app-1' }) }
    );

    expect(response.status).toBe(403);
  });

  it("PATCH /api/admin/applications/[id] { status: 'approved' } returns 200 for role=manager", async () => {
    mockRole('manager');
    mockAdminFrom.mockReturnValue(makePatchQuery());

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'app-1' }) }
    );

    expect(response.status).toBe(200);
  });

  it("PATCH /api/admin/applications/[id] { status: 'rejected' } returns 200 for role=admin", async () => {
    mockRole('admin');
    mockAdminFrom.mockReturnValue(makePatchQuery());

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      }),
      { params: Promise.resolve({ id: 'app-1' }) }
    );

    expect(response.status).toBe(200);
  });

  it('PATCH /api/admin/applications/[id] returns 400 for invalid status', async () => {
    mockRole('admin');
    mockAdminFrom.mockReturnValue(makePatchQuery());

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/applications/app-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'reviewing' }),
      }),
      { params: Promise.resolve({ id: 'app-1' }) }
    );

    expect(response.status).toBe(400);
  });

  it('AdminApplicationItem has required fields', () => {
    const item: AdminApplicationItem = {
      id: 'app-1',
      project_id: 'project-1',
      project_name: 'Проект',
      investor_id: 'investor-1',
      investor_email: 'investor@example.com',
      amount: 1000000,
      instrument: null,
      comment: null,
      status: 'pending',
      rejection_reason: null,
      created_at: '2026-06-28T10:00:00Z',
    };

    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('project_id');
    expect(item).toHaveProperty('investor_id');
    expect(item).toHaveProperty('amount');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('created_at');
  });
});
