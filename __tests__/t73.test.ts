import { NextRequest } from 'next/server';

type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

type NotificationRow = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type ProjectRow = {
  owner_id: string | null;
  name: string | null;
};

type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  investor_id: string;
  project_id: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makePatchRequest(status: string) {
  return new NextRequest('http://localhost/api/admin/applications/application-1', {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

async function loadNotifyOwnerApplicationStatusTest(options?: {
  project?: ProjectRow | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockSingle = jest.fn(async () => ({
    data: { id: 'notification-1' },
    error: null,
  }));
  const mockNotificationSelect = jest.fn(() => ({
    single: mockSingle,
  }));
  const mockInsert = jest.fn((row: NotificationRow) => {
    void row;
    if (options?.insertThrows) throw new Error('insert failed');
    return {
      select: mockNotificationSelect,
    };
  });
  const mockProjectMaybeSingle = jest.fn(async () => ({
    data:
      options && 'project' in options
        ? options.project
        : { owner_id: 'owner-uuid', name: 'Тестовый проект' },
    error: null,
  }));
  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: mockProjectMaybeSingle,
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

  const notifyModule = await import('@/lib/notifications/notify-owner-application-status');

  return {
    notifyOwnerApplicationStatus: notifyModule.notifyOwnerApplicationStatus,
    mockInsert,
  };
}

function makeApplicationsQuery(app: ApplicationRow) {
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
    eq: jest.fn(() => (mode === 'update' ? Promise.resolve({ error: null }) : query)),
    maybeSingle: jest.fn(async () => ({ data: app, error: null })),
  };

  return query;
}

function makeProjectsQuery() {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => ({ data: { name: 'Проект' }, error: null })),
  };

  return query;
}

async function loadPatchRouteTest(appStatus: ApplicationStatus = 'pending') {
  jest.resetModules();

  const mockNotifyOwnerApplicationStatus = jest.fn().mockResolvedValue(undefined);
  const mockCreateNotification = jest.fn().mockResolvedValue(undefined);
  const app: ApplicationRow = {
    id: 'application-1',
    status: appStatus,
    investor_id: 'investor-1',
    project_id: 'project-1',
  };

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: { id: 'manager-1', email: 'manager@example.com' } },
        })),
      },
      from: jest.fn(() => ({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn(async () => ({ data: { role: 'manager' }, error: null })),
      })),
    })),
  }));
  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: jest.fn((table: string) => {
        if (table === 'applications') return makeApplicationsQuery(app);
        if (table === 'projects') return makeProjectsQuery();
        return {};
      }),
    })),
  }));
  jest.doMock('@/lib/audit/log', () => ({
    writeAuditLog: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@/lib/notifications/create', () => ({
    createNotification: mockCreateNotification,
  }));
  jest.doMock('@/lib/notifications/notify-owner-application-status', () => ({
    notifyOwnerApplicationStatus: mockNotifyOwnerApplicationStatus,
  }));

  const route = await import('@/app/api/admin/applications/[id]/route');

  return {
    PATCH: route.PATCH,
    mockNotifyOwnerApplicationStatus,
    mockCreateNotification,
  };
}

describe('T73 notifyOwnerApplicationStatus', () => {
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
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest({
      project: null,
    });

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns early when owner_id is null', async () => {
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest({
      project: { owner_id: null, name: 'Тестовый проект' },
    });

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("uses approved title when newStatus is 'approved'", async () => {
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest();

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Заявка инвестора одобрена' })
    );
  });

  it("uses rejected title when newStatus is 'rejected'", async () => {
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest();

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'rejected',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Заявка инвестора отклонена' })
    );
  });

  it('includes project name in body', async () => {
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest({
      project: { owner_id: 'owner-uuid', name: 'Проект Альфа' },
    });

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Проект Альфа') })
    );
  });

  it("uses '/project' link", async () => {
    const { notifyOwnerApplicationStatus, mockInsert } = await loadNotifyOwnerApplicationStatusTest();

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link: '/project' }));
  });

  it('calls dispatch-email fetch after insert', async () => {
    const { notifyOwnerApplicationStatus } = await loadNotifyOwnerApplicationStatusTest();

    await notifyOwnerApplicationStatus({
      applicationId: 'application-1',
      projectId: 'project-1',
      newStatus: 'approved',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert fails', async () => {
    const { notifyOwnerApplicationStatus } = await loadNotifyOwnerApplicationStatusTest({
      insertThrows: true,
    });

    await expect(
      notifyOwnerApplicationStatus({
        applicationId: 'application-1',
        projectId: 'project-1',
        newStatus: 'approved',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });
});

describe('T73 PATCH /api/admin/applications/[id]', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-owner-application-status');
  });

  it('calls notifyOwnerApplicationStatus on approve', async () => {
    const { PATCH, mockNotifyOwnerApplicationStatus } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('approved'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyOwnerApplicationStatus).toHaveBeenCalled();
  });

  it('calls notifyOwnerApplicationStatus on reject', async () => {
    const { PATCH, mockNotifyOwnerApplicationStatus } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('rejected'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyOwnerApplicationStatus).toHaveBeenCalled();
  });

  it("passes newStatus 'approved' to notifyOwnerApplicationStatus", async () => {
    const { PATCH, mockNotifyOwnerApplicationStatus } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('approved'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyOwnerApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'approved' })
    );
  });

  it("passes newStatus 'rejected' to notifyOwnerApplicationStatus", async () => {
    const { PATCH, mockNotifyOwnerApplicationStatus } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('rejected'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockNotifyOwnerApplicationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'rejected' })
    );
  });

  it('still calls createNotification for investor', async () => {
    const { PATCH, mockCreateNotification } = await loadPatchRouteTest();

    await PATCH(makePatchRequest('approved'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'investor-1' })
    );
  });

  it('does not call notifyOwnerApplicationStatus on invalid transition', async () => {
    const { PATCH, mockNotifyOwnerApplicationStatus } = await loadPatchRouteTest('cancelled');

    const response = await PATCH(makePatchRequest('approved'), {
      params: Promise.resolve({ id: 'application-1' }),
    });

    expect(response.status).toBe(400);
    expect(mockNotifyOwnerApplicationStatus).not.toHaveBeenCalled();
  });
});
