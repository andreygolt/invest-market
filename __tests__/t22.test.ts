import { NextRequest } from 'next/server';
import { GET as getUsers } from '@/app/api/admin/users/route';
import { GET as getUser, PATCH } from '@/app/api/admin/users/[id]/route';
import type { UserProfile } from '@/types';

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

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeUsersListQuery(data: UserProfile[], count = data.length) {
  const query = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    or: jest.fn(() => query),
    eq: jest.fn(() => query),
    range: jest.fn(async () => ({ data, error: null, count })),
  };
  return query;
}

function makeSingleUserQuery(result: QueryResult) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => result),
      })),
    })),
  };
}

function makeUpdateUserQuery(result: QueryResult) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => result),
        })),
      })),
    })),
  };
}

const sampleUser: UserProfile = {
  id: 'user-1',
  email: 'user@example.com',
  role: 'investor',
  full_name: 'Иван Иванов',
  is_active: true,
  created_at: '2026-06-28T10:00:00Z',
};

describe('T22 admin users', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
  });

  it('GET /api/admin/users returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await getUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/admin/users returns 403 for role=investor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeRoleQuery('investor');
    });

    const response = await getUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET /api/admin/users returns list with total', async () => {
    const listQuery = makeUsersListQuery([sampleUser], 1);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      return makeRoleQuery('admin');
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'users') return listQuery;
      return listQuery;
    });

    const response = await getUsers(new NextRequest('http://localhost/api/admin/users'));
    const body = (await response.json()) as { users: UserProfile[]; total: number };

    expect(response.status).toBe(200);
    expect(body.users).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it('GET /api/admin/users?role=investor filters by role', async () => {
    const listQuery = makeUsersListQuery([sampleUser], 1);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));
    mockAdminFrom.mockImplementation(() => listQuery);

    await getUsers(new NextRequest('http://localhost/api/admin/users?role=investor'));

    expect(listQuery.eq).toHaveBeenCalledWith('role', 'investor');
  });

  it('PATCH /api/admin/users/[id] returns 400 if id === auth.uid()', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/users/admin-1', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve({ id: 'admin-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('Cannot update own account');
  });

  it('PATCH /api/admin/users/[id] returns 403 when admin assigns superadmin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/users/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'superadmin' }),
      }),
      { params: Promise.resolve({ id: 'user-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Only superadmin can assign superadmin role');
  });

  it('PATCH /api/admin/users/[id] updates is_active', async () => {
    const updateQuery = makeUpdateUserQuery({
      data: { ...sampleUser, is_active: false },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));
    mockAdminFrom.mockImplementation(() => updateQuery);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/users/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ is_active: false }),
      }),
      { params: Promise.resolve({ id: 'user-1' }) }
    );
    const body = (await response.json()) as UserProfile;

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ is_active: false });
    expect(body.is_active).toBe(false);
  });

  it('PATCH /api/admin/users/[id] updates role', async () => {
    const updateQuery = makeUpdateUserQuery({
      data: { ...sampleUser, role: 'manager' },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));
    mockAdminFrom.mockImplementation(() => updateQuery);

    const response = await PATCH(
      new NextRequest('http://localhost/api/admin/users/user-1', {
        method: 'PATCH',
        body: JSON.stringify({ role: 'manager' }),
      }),
      { params: Promise.resolve({ id: 'user-1' }) }
    );
    const body = (await response.json()) as UserProfile;

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ role: 'manager' });
    expect(body.role).toBe('manager');
  });

  it('GET /api/admin/users/[id] returns one user', async () => {
    const singleQuery = makeSingleUserQuery({ data: sampleUser, error: null });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation(() => makeRoleQuery('admin'));
    mockAdminFrom.mockImplementation(() => singleQuery);

    const response = await getUser(new NextRequest('http://localhost/api/admin/users/user-1'), {
      params: Promise.resolve({ id: 'user-1' }),
    });
    const body = (await response.json()) as UserProfile;

    expect(response.status).toBe(200);
    expect(body.id).toBe('user-1');
  });
});
