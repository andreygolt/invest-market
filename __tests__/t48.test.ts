import { NextRequest } from 'next/server';

import { POST as POST_BROADCAST } from '@/app/api/admin/notifications/broadcast/route';
import type { BroadcastResult, BroadcastTargetRole } from '@/types';

type MockUser = {
  id: string;
  role: Exclude<BroadcastTargetRole, 'all'>;
};

type NotificationInsertRow = {
  user_id: string;
  type: 'announcement';
  title: string;
  body: string;
  link: string | null;
  is_read: boolean;
};

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type UsersQuery = PromiseLike<QueryResult<MockUser[]>> & {
  select: jest.Mock<UsersQuery, [string]>;
  eq: jest.Mock<UsersQuery, [string, string]>;
};

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockInsert = jest.fn();

const mockUsers: MockUser[] = [
  { id: 'u1', role: 'investor' },
  { id: 'u2', role: 'investor' },
  { id: 'u3', role: 'admin' },
];

let adminUsers = mockUsers;

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

function makeUsersQuery(rows: MockUser[]): UsersQuery {
  let filtered = rows;
  const query: UsersQuery = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string) => {
      if (column === 'role') {
        filtered = rows.filter((row) => row.role === value);
      }
      return query;
    }),
    then: (resolve, reject) => Promise.resolve({ data: filtered, error: null }).then(resolve, reject),
  };
  return query;
}

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/notifications/broadcast', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function setupAuth(role: MockUser['role'] | null = 'admin') {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: role ? { role } : null,
      error: null,
    })),
  });
}

function setupAdminRows(rows: MockUser[] = mockUsers) {
  adminUsers = rows;
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'users') return makeUsersQuery(adminUsers);
    if (table === 'notifications') return { insert: mockInsert };
    return {};
  });
}

describe('T48 broadcast notifications', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ error: null });
    setupAuth();
    setupAdminRows();
  });

  it('POST /api/admin/notifications/broadcast returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all' })
    );

    expect(response.status).toBe(401);
  });

  it('POST /api/admin/notifications/broadcast returns 403 for investor role', async () => {
    setupAuth('investor');

    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all' })
    );

    expect(response.status).toBe(403);
  });

  it('POST /api/admin/notifications/broadcast returns 400 when title is empty', async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: ' ', body: 'Body', target_role: 'all' })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/admin/notifications/broadcast returns 400 when body is empty', async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: ' ', target_role: 'all' })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/admin/notifications/broadcast returns 400 when title is too long', async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'a'.repeat(121), body: 'Body', target_role: 'all' })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/admin/notifications/broadcast returns 400 when body is too long', async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'a'.repeat(1001), target_role: 'all' })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/admin/notifications/broadcast returns 400 for invalid target_role', async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'invalid' })
    );

    expect(response.status).toBe(400);
  });

  it("POST /api/admin/notifications/broadcast succeeds for admin and target_role='all'", async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all' })
    );
    const body = (await response.json()) as BroadcastResult;

    expect(response.status).toBe(200);
    expect(body).toEqual({ sent: 3, target_role: 'all' });
  });

  it('POST /api/admin/notifications/broadcast succeeds for superadmin', async () => {
    setupAuth('superadmin');

    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all' })
    );
    const body = (await response.json()) as BroadcastResult;

    expect(response.status).toBe(200);
    expect(body.sent).toBe(3);
  });

  it("POST /api/admin/notifications/broadcast target_role='investor' filters investor users only", async () => {
    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'investor' })
    );
    const body = (await response.json()) as BroadcastResult;
    const inserted = mockInsert.mock.calls[0]?.[0] as NotificationInsertRow[];

    expect(body).toEqual({ sent: 2, target_role: 'investor' });
    expect(inserted.map((row) => row.user_id)).toEqual(['u1', 'u2']);
  });

  it('POST /api/admin/notifications/broadcast returns sent 0 when target role has no users', async () => {
    setupAdminRows([]);

    const response = await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'manager' })
    );
    const body = (await response.json()) as BroadcastResult;

    expect(body).toEqual({ sent: 0, target_role: 'manager' });
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("POST /api/admin/notifications/broadcast inserts notifications with type='announcement'", async () => {
    await POST_BROADCAST(makeRequest({ title: 'Title', body: 'Body', target_role: 'all' }));

    const inserted = mockInsert.mock.calls[0]?.[0] as NotificationInsertRow[];
    expect(inserted.every((row) => row.type === 'announcement')).toBe(true);
  });

  it('POST /api/admin/notifications/broadcast writes optional link to notifications', async () => {
    await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all', link: '/catalog' })
    );

    const inserted = mockInsert.mock.calls[0]?.[0] as NotificationInsertRow[];
    expect(inserted[0]?.link).toBe('/catalog');
  });

  it("POST /api/admin/notifications/broadcast writes link='' as null", async () => {
    await POST_BROADCAST(
      makeRequest({ title: 'Title', body: 'Body', target_role: 'all', link: ' ' })
    );

    const inserted = mockInsert.mock.calls[0]?.[0] as NotificationInsertRow[];
    expect(inserted[0]?.link).toBeNull();
  });

  it('BroadcastTargetRole and BroadcastResult types contain expected fields', () => {
    const targetRole: BroadcastTargetRole = 'all';
    const result: BroadcastResult = {
      sent: 1,
      target_role: targetRole,
    };

    expect(result.sent).toBe(1);
    expect(result.target_role).toBe('all');
  });
});
