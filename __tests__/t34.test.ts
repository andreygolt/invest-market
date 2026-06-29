import { NextRequest } from 'next/server';

import { PATCH as PATCH_ADMIN_APPLICATION } from '@/app/api/admin/applications/[id]/route';
import { PATCH as PATCH_NOTIFICATION } from '@/app/api/notifications/[id]/route';
import { GET as GET_NOTIFICATIONS } from '@/app/api/notifications/route';
import { POST as POST_READ_ALL } from '@/app/api/notifications/read-all/route';
import { createNotification } from '@/lib/notifications/create';
import type { NotificationInsert, NotificationRow } from '@/types';

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

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

const notificationRows: NotificationRow[] = [
  {
    id: 'notification-1',
    user_id: 'user-1',
    type: 'application_approved',
    title: 'Заявка одобрена',
    body: 'Ваша заявка на участие в проекте одобрена.',
    link: '/applications',
    is_read: false,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 'notification-2',
    user_id: 'user-1',
    type: 'project_approved',
    title: 'Проект одобрен',
    body: 'Ваш проект прошёл модерацию.',
    link: '/project',
    is_read: true,
    created_at: '2026-06-27T10:00:00Z',
  },
];

function makeNotificationsQuery(rows: NotificationRow[]) {
  let filtered = rows;
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string | boolean) => {
      if (column === 'is_read') {
        filtered = filtered.filter((row) => row.is_read === value);
      }
      return query;
    }),
    order: jest.fn(() => query),
    limit: jest.fn(async (limit: number): Promise<QueryResult<NotificationRow[]>> => ({
      data: filtered.slice(0, limit),
      error: null,
    })),
  };
  return query;
}

function makeNotificationFindQuery(result: QueryResult<{ id: string } | null>) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(async () => result),
        })),
      })),
    })),
  };
}

function makeNotificationUpdateQuery(result: QueryResult<unknown>) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(async () => result),
      })),
    })),
  };
}

function makeReadAllQuery(updatedIds: Array<{ id: string }>) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        eq: jest.fn(() => ({
          select: jest.fn(async () => ({ data: updatedIds, error: null })),
        })),
      })),
    })),
  };
}

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeAdminApplicationSelect() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({
          data: {
            id: 'application-1',
            status: 'pending',
            investor_id: 'investor-1',
            project_id: 'project-1',
          },
          error: null,
        })),
      })),
    })),
  };
}

function makeAdminApplicationUpdate() {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(async () => ({ data: null, error: null })),
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

describe('T34 notifications', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
  });

  it('GET /api/notifications returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));

    expect(response.status).toBe(401);
  });

  it('GET /api/notifications returns notifications and unread_count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockReturnValue(makeNotificationsQuery(notificationRows));

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));
    const body = (await response.json()) as {
      notifications: NotificationRow[];
      unread_count: number;
    };

    expect(response.status).toBe(200);
    expect(body.notifications).toHaveLength(2);
    expect(body.unread_count).toBe(1);
  });

  it('GET /api/notifications?unread_only=true returns only unread notifications', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockReturnValue(makeNotificationsQuery(notificationRows));

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?unread_only=true')
    );
    const body = (await response.json()) as { notifications: NotificationRow[] };

    expect(response.status).toBe(200);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0]?.is_read).toBe(false);
  });

  it('PATCH /api/notifications/[id] returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH_NOTIFICATION(new Request('http://localhost/api/notifications/1'), {
      params: Promise.resolve({ id: 'notification-1' }),
    });

    expect(response.status).toBe(401);
  });

  it('PATCH /api/notifications/[id] returns 404 when notification is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockReturnValue(makeNotificationFindQuery({ data: null, error: null }));

    const response = await PATCH_NOTIFICATION(new Request('http://localhost/api/notifications/1'), {
      params: Promise.resolve({ id: 'notification-1' }),
    });

    expect(response.status).toBe(404);
  });

  it('PATCH /api/notifications/[id] marks notification read', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom
      .mockReturnValueOnce(makeNotificationFindQuery({ data: { id: 'notification-1' }, error: null }))
      .mockReturnValueOnce(makeNotificationUpdateQuery({ data: null, error: null }));

    const response = await PATCH_NOTIFICATION(new Request('http://localhost/api/notifications/1'), {
      params: Promise.resolve({ id: 'notification-1' }),
    });
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('POST /api/notifications/read-all returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST_READ_ALL();

    expect(response.status).toBe(401);
  });

  it('POST /api/notifications/read-all updates all unread notifications', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockReturnValue(makeReadAllQuery([{ id: 'notification-1' }, { id: 'notification-2' }]));

    const response = await POST_READ_ALL();
    const body = (await response.json()) as { ok: boolean; updated: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, updated: 2 });
  });

  it('createNotification inserts notification data', async () => {
    const insert = jest.fn(async () => ({ data: null, error: null }));
    const data: NotificationInsert = {
      user_id: 'user-1',
      type: 'project_approved',
      title: 'Проект одобрен',
      body: 'Ваш проект прошёл модерацию.',
      link: '/project',
    };
    mockAdminFrom.mockReturnValue({ insert });

    await createNotification(data);

    expect(mockAdminFrom).toHaveBeenCalledWith('notifications');
    expect(insert).toHaveBeenCalledWith(data);
  });

  it('NotificationRow has required fields', () => {
    expect(notificationRows[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        user_id: expect.any(String),
        type: expect.any(String),
        title: expect.any(String),
        body: expect.any(String),
        link: expect.any(String),
        is_read: expect.any(Boolean),
        created_at: expect.any(String),
      })
    );
  });

  it('GET /api/notifications unread_count matches unread mock rows', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockReturnValue(makeNotificationsQuery(notificationRows));

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));
    const body = (await response.json()) as { unread_count: number };

    expect(body.unread_count).toBe(notificationRows.filter((row) => !row.is_read).length);
  });

  it('PATCH /api/admin/applications/[id] status=approved returns 200 when notification insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockReturnValue(makeRoleQuery('admin'));

    const notificationInsert = jest.fn(async () => ({
      data: null,
      error: { message: 'insert failed' },
    }));
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'applications') {
        return mockAdminFrom.mock.calls.filter(([name]) => name === 'applications').length === 1
          ? makeAdminApplicationSelect()
          : makeAdminApplicationUpdate();
      }
      if (table === 'projects') return makeProjectNameQuery();
      if (table === 'notifications') return { insert: notificationInsert };
      return {};
    });

    const response = await PATCH_ADMIN_APPLICATION(
      new NextRequest('http://localhost/api/admin/applications/application-1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      }),
      { params: Promise.resolve({ id: 'application-1' }) }
    );

    expect(response.status).toBe(200);
  });
});
