import { NextRequest } from 'next/server';
import type { UserProfile, UserRole } from '@/types';

type NotificationInsert = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadNotifyUserAccountChangeTest(options?: {
  inserted?: { id: string } | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockSingle = jest.fn(async () => ({
    data: options && 'inserted' in options ? options.inserted : { id: 'notif-uuid' },
    error: options && 'inserted' in options && options.inserted === null ? { message: 'DB error' } : null,
  }));
  const mockSelect = jest.fn(() => ({
    single: mockSingle,
  }));
  const mockInsert = jest.fn((row: NotificationInsert) => {
    void row;
    if (options?.insertThrows) throw new Error('insert failed');
    return {
      select: mockSelect,
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'notifications') {
      return {
        insert: mockInsert,
      };
    }

    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));

  const notifyModule = await import('@/lib/notifications/notify-user-account-change');

  return {
    notifyUserAccountChange: notifyModule.notifyUserAccountChange,
    mockInsert,
  };
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string): RouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

async function loadPatchRouteTest(options?: { updatedUser?: Partial<UserProfile> }) {
  jest.resetModules();

  const mockNotifyUserAccountChange = jest.fn().mockResolvedValue(undefined);
  const updatedUser: UserProfile = {
    id: 'user-uuid',
    email: 'user@example.com',
    role: 'investor',
    full_name: null,
    is_active: true,
    created_at: '2026-06-29T10:00:00.000Z',
    ...options?.updatedUser,
  };
  const usersAdminQuery = {
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: updatedUser,
      error: null,
    })),
  };
  const mockAdminFrom = jest.fn((table: string) => {
    if (table === 'users') return usersAdminQuery;
    return {};
  });

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'admin-uuid' } },
        }),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        }),
      })),
    }),
  }));
  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockAdminFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-user-account-change', () => ({
    notifyUserAccountChange: mockNotifyUserAccountChange,
  }));

  const route = await import('@/app/api/admin/users/[id]/route');

  return {
    PATCH: route.PATCH,
    mockNotifyUserAccountChange,
  };
}

describe('T78 notifyUserAccountChange', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('returns early when newRole and newIsActive are both undefined', async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("uses title 'Ваша роль изменена' and role label for role-only change", async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newRole: 'manager',
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.title).toBe('Ваша роль изменена');
    expect(row.body).toContain('Менеджер');
  });

  it("uses title 'Аккаунт деактивирован' for newIsActive=false", async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newIsActive: false,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.title).toBe('Аккаунт деактивирован');
  });

  it("uses title 'Аккаунт активирован' for newIsActive=true", async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newIsActive: true,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.title).toBe('Аккаунт активирован');
  });

  it("uses title 'Изменены роль и статус аккаунта' when both fields are provided", async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newRole: 'admin',
      newIsActive: false,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.title).toBe('Изменены роль и статус аккаунта');
  });

  it("uses '/profile' link", async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newRole: 'investor',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link: '/profile' }));
  });

  it('calls dispatch-email fetch once after insert', async () => {
    const { notifyUserAccountChange } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newRole: 'project',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('passes notificationId and userId to dispatch-email payload', async () => {
    const { notifyUserAccountChange } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'user-uuid',
      newRole: 'moderator',
      baseUrl: 'https://invest.test',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      notificationId: 'notif-uuid',
      userId: 'user-uuid',
    });
  });

  it('does not throw when insert fails', async () => {
    const { notifyUserAccountChange } = await loadNotifyUserAccountChangeTest({
      insertThrows: true,
    });

    await expect(
      notifyUserAccountChange({
        userId: 'user-uuid',
        newRole: 'manager',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('inserts notification with correct user_id', async () => {
    const { notifyUserAccountChange, mockInsert } = await loadNotifyUserAccountChangeTest();

    await notifyUserAccountChange({
      userId: 'target-user-uuid',
      newRole: 'manager',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'target-user-uuid' }));
  });
});

describe('T78 PATCH /api/admin/users/[id]', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-user-account-change');
  });

  it('calls notifyUserAccountChange when role changes', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest({
      updatedUser: { role: 'manager' },
    });

    const response = await PATCH(makePatchRequest('user-uuid', { role: 'manager' }), makeContext('user-uuid'));

    expect(response.status).toBe(200);
    expect(mockNotifyUserAccountChange).toHaveBeenCalledTimes(1);
  });

  it('calls notifyUserAccountChange when is_active changes', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest({
      updatedUser: { is_active: false },
    });

    const response = await PATCH(makePatchRequest('user-uuid', { is_active: false }), makeContext('user-uuid'));

    expect(response.status).toBe(200);
    expect(mockNotifyUserAccountChange).toHaveBeenCalledTimes(1);
  });

  it('passes userId from params to notifyUserAccountChange', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('target-user-uuid', { role: 'manager' }), makeContext('target-user-uuid'));

    expect(mockNotifyUserAccountChange).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'target-user-uuid' })
    );
  });

  it('passes newRole from request body to notifyUserAccountChange', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest();
    const newRole: UserRole = 'moderator';

    await PATCH(makePatchRequest('user-uuid', { role: newRole }), makeContext('user-uuid'));

    expect(mockNotifyUserAccountChange).toHaveBeenCalledWith(expect.objectContaining({ newRole }));
  });

  it('does not call notifyUserAccountChange for invalid data', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest();

    const response = await PATCH(makePatchRequest('user-uuid', { role: 'owner' }), makeContext('user-uuid'));

    expect(response.status).toBe(400);
    expect(mockNotifyUserAccountChange).not.toHaveBeenCalled();
  });

  it('does not call notifyUserAccountChange when updating own account', async () => {
    const { PATCH, mockNotifyUserAccountChange } = await loadPatchRouteTest();

    const response = await PATCH(makePatchRequest('admin-uuid', { role: 'manager' }), makeContext('admin-uuid'));

    expect(response.status).toBe(400);
    expect(mockNotifyUserAccountChange).not.toHaveBeenCalled();
  });
});
