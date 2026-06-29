import { NextRequest } from 'next/server';

type ProjectRow = {
  owner_id: string | null;
  name: string | null;
};

type StaffRow = {
  id: string;
};

type NotificationRow = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type InsertedNotification = {
  id: string;
  user_id: string;
};

type ApplicationRow = {
  id: string;
  status: string;
  investor_id: string;
  project_id: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makeDeleteRequest(investorId: string) {
  return new NextRequest(
    `http://localhost/api/investor/applications/application-1?investor_id=${investorId}`,
    { method: 'DELETE' }
  );
}

async function loadNotifyApplicationWithdrawnTest(options?: {
  project?: ProjectRow | null;
  staff?: StaffRow[] | null;
  inserted?: InsertedNotification[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockProjectMaybeSingle = jest.fn(async () => ({
    data:
      options && 'project' in options
        ? options.project
        : { owner_id: 'owner-uuid', name: 'Тестовый проект' },
    error: null,
  }));
  const mockUsersIn = jest.fn(async () => ({
    data:
      options && 'staff' in options
        ? options.staff
        : [
            { id: 'manager-uuid' },
            { id: 'admin-uuid' },
          ],
    error: null,
  }));
  const mockNotificationsSelect = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notification-owner', user_id: 'owner-uuid' },
            { id: 'notification-manager', user_id: 'manager-uuid' },
            { id: 'notification-admin', user_id: 'admin-uuid' },
          ],
    error: null,
  }));
  const mockInsert = jest.fn((rows: NotificationRow[]) => {
    void rows;
    if (options?.insertThrows) throw new Error('insert failed');
    return {
      select: mockNotificationsSelect,
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: mockProjectMaybeSingle,
      };
    }

    if (table === 'users') {
      return {
        select: jest.fn().mockReturnThis(),
        in: mockUsersIn,
      };
    }

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

  const notifyModule = await import('@/lib/notifications/notify-application-withdrawn');

  return {
    notifyApplicationWithdrawn: notifyModule.notifyApplicationWithdrawn,
    mockInsert,
  };
}

function makeApplicationsQuery(app: ApplicationRow, updateError: { message: string } | null = null) {
  let mode: 'select' | 'update' = 'select';
  const query = {
    select: jest.fn(() => {
      mode = 'select';
      return query;
    }),
    update: jest.fn(() => {
      mode = 'update';
      return query;
    }),
    eq: jest.fn(() => (mode === 'update' ? Promise.resolve({ error: updateError }) : query)),
    maybeSingle: jest.fn(async () => ({ data: app, error: null })),
  };

  return query;
}

async function loadDeleteRouteTest(options?: { app?: ApplicationRow }) {
  jest.resetModules();

  const mockNotifyApplicationWithdrawn = jest.fn().mockResolvedValue(undefined);
  const app = options?.app ?? {
    id: 'application-1',
    status: 'pending',
    investor_id: 'investor-uuid',
    project_id: 'project-uuid',
  };

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: jest.fn((table: string) => {
        if (table === 'applications') return makeApplicationsQuery(app);
        return {};
      }),
    })),
  }));
  jest.doMock('@/lib/notifications/notify-application-withdrawn', () => ({
    notifyApplicationWithdrawn: mockNotifyApplicationWithdrawn,
  }));

  const route = await import('@/app/api/investor/applications/[id]/route');

  return {
    DELETE: route.DELETE,
    mockNotifyApplicationWithdrawn,
  };
}

describe('T77 notifyApplicationWithdrawn', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('returns early when project is not found', async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest({
      project: null,
    });

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns early when owner_id is null and staff is empty', async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest({
      project: { owner_id: null, name: 'Тестовый проект' },
      staff: [],
    });

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("always uses title 'Инвестор отозвал заявку'", async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest();

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Инвестор отозвал заявку' }),
      expect.objectContaining({ title: 'Инвестор отозвал заявку' }),
      expect.objectContaining({ title: 'Инвестор отозвал заявку' }),
    ]);
  });

  it('body contains project name', async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest({
      project: { owner_id: 'owner-uuid', name: 'Проект Альфа' },
    });

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows[0].body).toContain('Проект Альфа');
  });

  it("uses '/project' link for owner", async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest();

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows[0]).toEqual(expect.objectContaining({ user_id: 'owner-uuid', link: '/project' }));
  });

  it("uses '/manager/applications' link for staff", async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest();

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows.slice(1)).toEqual([
      expect.objectContaining({ user_id: 'manager-uuid', link: '/manager/applications' }),
      expect.objectContaining({ user_id: 'admin-uuid', link: '/manager/applications' }),
    ]);
  });

  it('calls dispatch-email fetch once per inserted notification', async () => {
    const { notifyApplicationWithdrawn } = await loadNotifyApplicationWithdrawnTest();

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert fails', async () => {
    const { notifyApplicationWithdrawn } = await loadNotifyApplicationWithdrawnTest({
      insertThrows: true,
    });

    await expect(
      notifyApplicationWithdrawn({
        applicationId: 'application-1',
        projectId: 'project-1',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('inserts owner row and one row for each staff user', async () => {
    const { notifyApplicationWithdrawn, mockInsert } = await loadNotifyApplicationWithdrawnTest({
      staff: [{ id: 'manager-1' }, { id: 'admin-1' }, { id: 'superadmin-1' }],
    });

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.user_id)).toEqual([
      'owner-uuid',
      'manager-1',
      'admin-1',
      'superadmin-1',
    ]);
  });

  it('passes notificationId and userId to dispatch-email payload', async () => {
    const { notifyApplicationWithdrawn } = await loadNotifyApplicationWithdrawnTest();

    await notifyApplicationWithdrawn({
      applicationId: 'application-1',
      projectId: 'project-1',
      baseUrl: 'https://invest.test',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      notificationId: 'notification-owner',
      userId: 'owner-uuid',
    });
  });
});

describe('T77 DELETE /api/investor/applications/[id]', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-application-withdrawn');
  });

  it('calls notifyApplicationWithdrawn after successful withdraw', async () => {
    const { DELETE, mockNotifyApplicationWithdrawn } = await loadDeleteRouteTest();

    const response = await DELETE(makeDeleteRequest('investor-uuid'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(response.status).toBe(200);
    expect(mockNotifyApplicationWithdrawn).toHaveBeenCalledTimes(1);
  });

  it('passes applicationId to notifyApplicationWithdrawn', async () => {
    const { DELETE, mockNotifyApplicationWithdrawn } = await loadDeleteRouteTest({
      app: {
        id: 'application-1',
        status: 'pending',
        investor_id: 'investor-uuid',
        project_id: 'project-from-app',
      },
    });

    await DELETE(makeDeleteRequest('investor-uuid'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyApplicationWithdrawn).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 'application-1',
      })
    );
  });

  it('passes projectId to notifyApplicationWithdrawn', async () => {
    const { DELETE, mockNotifyApplicationWithdrawn } = await loadDeleteRouteTest({
      app: {
        id: 'application-1',
        status: 'pending',
        investor_id: 'investor-uuid',
        project_id: 'project-from-app',
      },
    });

    await DELETE(makeDeleteRequest('investor-uuid'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyApplicationWithdrawn).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-from-app',
      })
    );
  });

  it('does not call notifyApplicationWithdrawn when status is not pending', async () => {
    const { DELETE, mockNotifyApplicationWithdrawn } = await loadDeleteRouteTest({
      app: {
        id: 'application-1',
        status: 'approved',
        investor_id: 'investor-uuid',
        project_id: 'project-uuid',
      },
    });

    const response = await DELETE(makeDeleteRequest('investor-uuid'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockNotifyApplicationWithdrawn).not.toHaveBeenCalled();
  });

  it('does not call notifyApplicationWithdrawn for another investor application', async () => {
    const { DELETE, mockNotifyApplicationWithdrawn } = await loadDeleteRouteTest({
      app: {
        id: 'application-1',
        status: 'pending',
        investor_id: 'other-user',
        project_id: 'project-uuid',
      },
    });

    const response = await DELETE(makeDeleteRequest('investor-uuid'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockNotifyApplicationWithdrawn).not.toHaveBeenCalled();
  });
});
