import { NextRequest } from 'next/server';

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

type ManagerRow = {
  id: string;
  role?: string;
};

type ProjectRow = {
  id: string;
  name: string | null;
  status: string;
  owner_id: string | null;
};

type ApplicationRow = {
  id: string;
  project_id: string;
  amount: number | null;
  status: string;
  message: string;
  created_at: string;
  updated_at: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/investor/applications', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function loadNotifyManagersNewApplicationTest(options?: {
  managers?: ManagerRow[] | null;
  inserted?: InsertedNotification[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockUsersIn = jest.fn(async () => ({
    data:
      options && 'managers' in options
        ? options.managers
        : [
            { id: 'manager-1' },
            { id: 'admin-1' },
          ],
    error: null,
  }));
  const mockUsersSelect = jest.fn(() => ({
    in: mockUsersIn,
  }));
  const mockNotificationsSelect = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notification-1', user_id: 'manager-1' },
            { id: 'notification-2', user_id: 'admin-1' },
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
    if (table === 'users') {
      return {
        select: mockUsersSelect,
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

  const notifyModule = await import('@/lib/notifications/notify-managers-new-application');

  return {
    notifyManagersNewApplication: notifyModule.notifyManagersNewApplication,
    mockUsersIn,
    mockInsert,
  };
}

function makeApplicationsSelectQuery(existing: { id: string; status: string } | null) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    maybeSingle: jest.fn(async () => ({ data: existing, error: null })),
  };

  return query;
}

function makeApplicationsInsertQuery(result: { app: ApplicationRow | null; error: { message: string } | null }) {
  return {
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({
          data: result.app,
          error: result.error,
        })),
      })),
    })),
  };
}

async function loadInvestorApplicationsRouteTest(options?: {
  project?: ProjectRow | null;
  applicationError?: { message: string } | null;
}) {
  jest.resetModules();

  const mockNotifyManagersNewApplication = jest.fn().mockResolvedValue(undefined);
  const mockNotifyManagers = jest.fn().mockResolvedValue(undefined);
  const mockOwnerNotificationInsert = jest.fn(async () => ({ error: null }));
  const app: ApplicationRow = {
    id: 'application-1',
    project_id: 'project-1',
    amount: 1000,
    status: 'pending',
    message: 'Хочу инвестировать',
    created_at: '2026-06-29T10:00:00.000Z',
    updated_at: '2026-06-29T10:00:00.000Z',
  };
  let applicationsFromCount = 0;

  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({
          data:
            options && 'project' in options
              ? options.project
              : {
                  id: 'project-1',
                  name: 'Проект Альфа',
                  status: 'approved',
                  owner_id: 'owner-1',
                },
          error: null,
        })),
      };
    }

    if (table === 'applications') {
      applicationsFromCount += 1;
      if (applicationsFromCount === 1) return makeApplicationsSelectQuery(null);

      return makeApplicationsInsertQuery({
        app,
        error: options?.applicationError ?? null,
      });
    }

    if (table === 'notifications') {
      return {
        insert: mockOwnerNotificationInsert,
      };
    }

    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-managers-new-application', () => ({
    notifyManagersNewApplication: mockNotifyManagersNewApplication,
  }));
  jest.doMock('@/lib/notifications/notify-managers', () => ({
    notifyManagers: mockNotifyManagers,
  }));

  const route = await import('@/app/api/investor/applications/route');

  return {
    POST: route.POST,
    mockNotifyManagersNewApplication,
    mockOwnerNotificationInsert,
  };
}

describe('T74 notifyManagersNewApplication', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('returns early when managers is an empty array', async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest({
      managers: [],
    });

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns early when managers is null', async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest({
      managers: null,
    });

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("always uses title 'Новая заявка инвестора'", async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest();

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Новая заявка инвестора' }),
      expect.objectContaining({ title: 'Новая заявка инвестора' }),
    ]);
  });

  it('includes project name in body', async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest();

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект Альфа',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ body: expect.stringContaining('Проект Альфа') }),
      expect.objectContaining({ body: expect.stringContaining('Проект Альфа') }),
    ]);
  });

  it("uses '/manager/applications' link", async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest();

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ link: '/manager/applications' }),
      expect.objectContaining({ link: '/manager/applications' }),
    ]);
  });

  it('inserts one row for each manager', async () => {
    const { notifyManagersNewApplication, mockInsert } = await loadNotifyManagersNewApplicationTest({
      managers: [{ id: 'manager-1' }, { id: 'admin-1' }, { id: 'superadmin-1' }],
    });

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows).toHaveLength(3);
  });

  it('calls dispatch-email fetch once per inserted notification', async () => {
    const { notifyManagersNewApplication } = await loadNotifyManagersNewApplicationTest();

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert fails', async () => {
    const { notifyManagersNewApplication } = await loadNotifyManagersNewApplicationTest({
      insertThrows: true,
    });

    await expect(
      notifyManagersNewApplication({
        applicationId: 'application-1',
        projectId: 'project-1',
        projectName: 'Проект',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('requests users with manager, admin and superadmin roles', async () => {
    const { notifyManagersNewApplication, mockUsersIn } = await loadNotifyManagersNewApplicationTest();

    await notifyManagersNewApplication({
      applicationId: 'application-1',
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockUsersIn).toHaveBeenCalledWith('role', ['manager', 'admin', 'superadmin']);
  });
});

describe('T74 POST /api/investor/applications', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-managers-new-application');
    jest.dontMock('@/lib/notifications/notify-managers');
  });

  it('calls notifyManagersNewApplication after successful POST', async () => {
    const { POST, mockNotifyManagersNewApplication } = await loadInvestorApplicationsRouteTest();

    await POST(
      makePostRequest({
        investor_id: 'investor-1',
        project_id: 'project-1',
        amount: 1000,
        message: 'Хочу инвестировать',
      })
    );

    expect(mockNotifyManagersNewApplication).toHaveBeenCalled();
  });

  it('passes application projectId to notifyManagersNewApplication', async () => {
    const { POST, mockNotifyManagersNewApplication } = await loadInvestorApplicationsRouteTest();

    await POST(
      makePostRequest({
        investor_id: 'investor-1',
        project_id: 'project-1',
        message: 'Хочу инвестировать',
      })
    );

    expect(mockNotifyManagersNewApplication).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1' })
    );
  });

  it('passes projectName to notifyManagersNewApplication', async () => {
    const { POST, mockNotifyManagersNewApplication } = await loadInvestorApplicationsRouteTest({
      project: {
        id: 'project-1',
        name: 'Проект Бета',
        status: 'approved',
        owner_id: 'owner-1',
      },
    });

    await POST(
      makePostRequest({
        investor_id: 'investor-1',
        project_id: 'project-1',
        message: 'Хочу инвестировать',
      })
    );

    expect(mockNotifyManagersNewApplication).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Проект Бета' })
    );
  });

  it('still creates existing owner notification', async () => {
    const { POST, mockOwnerNotificationInsert } = await loadInvestorApplicationsRouteTest();

    await POST(
      makePostRequest({
        investor_id: 'investor-1',
        project_id: 'project-1',
        message: 'Хочу инвестировать',
      })
    );

    expect(mockOwnerNotificationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'owner-1',
        title: 'Новая заявка от инвестора',
      })
    );
  });

  it('does not call notifyManagersNewApplication when application creation fails', async () => {
    const { POST, mockNotifyManagersNewApplication } = await loadInvestorApplicationsRouteTest({
      applicationError: { message: 'insert failed' },
    });

    const response = await POST(
      makePostRequest({
        investor_id: 'investor-1',
        project_id: 'project-1',
        message: 'Хочу инвестировать',
      })
    );

    expect(response.status).toBe(500);
    expect(mockNotifyManagersNewApplication).not.toHaveBeenCalled();
  });
});
