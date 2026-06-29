import { NextRequest } from 'next/server';

import { GET as GET_ADMIN_APPLICATIONS } from '@/app/api/admin/applications/route';
import { PATCH as PATCH_ADMIN_APPLICATION } from '@/app/api/admin/applications/[id]/route';
import { createNotification } from '@/lib/notifications/create';

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

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn(),
}));

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type ApplicationListRow = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  instrument: string | null;
  status: string;
  message: string | null;
  created_at: string;
  projects: { name: string };
  users: { full_name: string | null; email: string };
};

type ApplicationPatchRow = {
  id: string;
  status: string;
  investor_id: string;
  project_id: string;
};

const applicationRow: ApplicationListRow = {
  id: 'application-1',
  project_id: 'project-1',
  investor_id: 'investor-1',
  amount: 1000000,
  instrument: 'equity',
  status: 'pending',
  message: 'Хочу инвестировать',
  created_at: '2026-06-28T10:00:00Z',
  projects: { name: 'Проект' },
  users: { full_name: null, email: 'investor@example.com' },
};

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async (): Promise<QueryResult<{ role: string }>> => ({
          data: { role },
          error: null,
        })),
      })),
    })),
  };
}

function makeApplicationsListQuery(rows: ApplicationListRow[]) {
  let filteredRows = rows;
  const eq = jest.fn((column: string, value: string) => {
    if (column === 'status') {
      filteredRows = filteredRows.filter((row) => row.status === value);
    }
    return query;
  });
  const query = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    eq,
    then: (resolve: (result: QueryResult<ApplicationListRow[]>) => void) =>
      resolve({ data: filteredRows, error: null }),
  };

  return query;
}

function makeApplicationFindQuery(application: ApplicationPatchRow | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async (): Promise<QueryResult<ApplicationPatchRow | null>> => ({
          data: application,
          error: null,
        })),
      })),
    })),
  };
}

function makeApplicationUpdateQuery(updateSpy: jest.Mock) {
  return {
    update: updateSpy.mockImplementation(() => ({
      eq: jest.fn(async (): Promise<QueryResult<null>> => ({ data: null, error: null })),
    })),
  };
}

function makeProjectNameQuery() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: { name: 'Проект' }, error: null })),
      })),
    })),
  };
}

function setupRole(role: string, userId = 'manager-1') {
  mockUser(userId);
  mockServerFrom.mockReturnValue(makeRoleQuery(role));
}

function setupPatch(role: string, status = 'pending') {
  const updateSpy = jest.fn();
  setupRole(role);
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'applications') {
      const calls = mockAdminFrom.mock.calls.filter(([name]) => name === 'applications').length;
      return calls === 1
        ? makeApplicationFindQuery({
            id: 'application-1',
            status,
            investor_id: 'investor-1',
            project_id: 'project-1',
          })
        : makeApplicationUpdateQuery(updateSpy);
    }
    if (table === 'projects') return makeProjectNameQuery();
    return {};
  });

  return { updateSpy };
}

describe('T37 manager applications cabinet API', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    jest.mocked(createNotification).mockReset();
  });

  it('GET /api/admin/applications returns 200 for manager role', async () => {
    setupRole('manager');
    mockAdminFrom.mockReturnValue(makeApplicationsListQuery([applicationRow]));

    const response = await GET_ADMIN_APPLICATIONS(
      new NextRequest('http://localhost/api/admin/applications')
    );

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/applications returns 403 for investor role', async () => {
    setupRole('investor');

    const response = await GET_ADMIN_APPLICATIONS(
      new NextRequest('http://localhost/api/admin/applications')
    );

    expect(response.status).toBe(403);
  });

  it('PATCH /api/admin/applications/[id] returns 200 for manager role', async () => {
    const { updateSpy } = setupPatch('manager');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved' }) as { status: string }
    );
  });

  it('PATCH /api/admin/applications/[id] returns 403 for investor role', async () => {
    setupRole('investor');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(403);
  });

  it('PATCH /api/admin/applications/[id] status=approved returns 200 for admin role', async () => {
    setupPatch('admin');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(200);
  });

  it('PATCH /api/admin/applications/[id] status=rejected returns 200 for manager role', async () => {
    setupPatch('manager');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(200);
  });

  it('PATCH /api/admin/applications/[id] status=cancelled returns 200 for manager role', async () => {
    setupPatch('manager');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(200);
  });

  it('PATCH /api/admin/applications/[id] returns 401 without auth', async () => {
    mockUser(null);

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/applications?status=pending filters by status', async () => {
    setupRole('manager');
    const query = makeApplicationsListQuery([
      applicationRow,
      { ...applicationRow, id: 'application-2', status: 'approved' },
    ]);
    mockAdminFrom.mockReturnValue(query);

    const response = await GET_ADMIN_APPLICATIONS(
      new NextRequest('http://localhost/api/admin/applications?status=pending')
    );
    const body = (await response.json()) as { applications: ApplicationListRow[] };

    expect(response.status).toBe(200);
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
    expect(body.applications).toHaveLength(1);
  });

  it('PATCH /api/admin/applications/[id] returns 400 for invalid status', async () => {
    setupRole('manager');

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'unknown' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(400);
  });
});
