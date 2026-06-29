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

type ProjectRow = {
  id: string;
  status: string;
  owner_id: string;
  name: string | null;
};

type StaffRow = {
  id: string;
  role: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makeRequest(url: string, body: Record<string, unknown> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function loadNotifyProjectStatusTest(options?: {
  inserted?: InsertedNotification[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockSelect = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notif-1', user_id: 'user-1' },
            { id: 'notif-2', user_id: 'user-2' },
          ],
    error: null,
  }));
  const mockInsert = jest.fn((rows: NotificationRow[]) => {
    void rows;
    if (options?.insertThrows) throw new Error('insert failed');
    return { select: mockSelect };
  });
  const mockFrom = jest.fn(() => ({
    insert: mockInsert,
  }));

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));

  const notifyProjectStatusModule = await import('@/lib/notifications/notify-project-status');

  return {
    notifyProjectStatus: notifyProjectStatusModule.notifyProjectStatus,
    mockFrom,
    mockInsert,
    mockSelect,
  };
}

function makeSubmitRouteQuery(options: {
  project: { id: string; status: string; name: string | null };
  questionnaire: Array<{ section: string }>;
}) {
  return jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({ data: options.project, error: null })),
      };
    }

    if (table === 'project_questionnaire') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(async () => ({ data: options.questionnaire, error: null })),
      };
    }

    return {};
  });
}

function makeSubmitAdminFrom(staff: StaffRow[]) {
  return jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn(async () => ({ error: null })),
      };
    }

    if (table === 'project_status_log') {
      return {
        insert: jest.fn(async () => ({ error: null })),
      };
    }

    if (table === 'users') {
      return {
        select: jest.fn().mockReturnThis(),
        in: jest.fn(async (_field: string, roles: string[]) => ({
          data: staff.filter((user) => roles.includes(user.role)).map((user) => ({ id: user.id })),
          error: null,
        })),
      };
    }

    return {};
  });
}

async function loadSubmitRouteTest(staff: StaffRow[]) {
  jest.resetModules();

  const mockNotifyProjectStatus = jest.fn().mockResolvedValue(undefined);
  const mockServerFrom = makeSubmitRouteQuery({
    project: { id: 'project-1', status: 'draft', name: 'Проект' },
    questionnaire: [{ section: 's1' }],
  });
  const mockAdminFrom = makeSubmitAdminFrom(staff);

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({ data: { user: { id: 'owner-1' } } })),
      },
      from: mockServerFrom,
    })),
  }));
  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockAdminFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-moderators', () => ({
    notifyModerators: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@/lib/notifications/notify-project-status', () => ({
    notifyProjectStatus: mockNotifyProjectStatus,
  }));

  const route = await import('@/app/api/project/submit/route');

  return {
    POST: route.POST,
    mockNotifyProjectStatus,
  };
}

function makeAdminProjectRouteFrom(project: ProjectRow) {
  return jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(async () => ({ data: project, error: null })),
      };
    }

    if (table === 'admin_action_log') {
      return {
        insert: jest.fn(async () => ({ error: null })),
      };
    }

    return {};
  });
}

async function loadAdminProjectRouteTest(routePath: 'approve' | 'reject') {
  jest.resetModules();

  const mockNotifyProjectStatus = jest.fn().mockResolvedValue(undefined);
  const project: ProjectRow = {
    id: 'project-1',
    status: 'submitted',
    owner_id: 'owner-1',
    name: 'Проект',
  };

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: makeAdminProjectRouteFrom(project),
    })),
  }));
  jest.doMock('@/lib/audit/log', () => ({
    writeAuditLog: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@/lib/notifications/create', () => ({
    createNotification: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@/lib/notifications/notify-project-status', () => ({
    notifyProjectStatus: mockNotifyProjectStatus,
  }));

  const route =
    routePath === 'approve'
      ? await import('@/app/api/admin/projects/[id]/approve/route')
      : await import('@/app/api/admin/projects/[id]/reject/route');

  return {
    POST: route.POST,
    mockNotifyProjectStatus,
  };
}

describe('T71 notifyProjectStatus', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('does not call admin.from when recipientIds is empty', async () => {
    const { notifyProjectStatus, mockFrom } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: [],
      baseUrl: 'https://invest.test',
    });

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('uses submitted title', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Новый проект на проверке' }),
    ]);
  });

  it('uses approved title', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'approved',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ title: 'Проект одобрен' })]);
  });

  it('uses rejected title', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'rejected',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ title: 'Проект отклонён' })]);
  });

  it('adds rejection reason to rejected body', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'rejected',
      rejectionReason: 'Недостаточно документов',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ body: expect.stringContaining('Недостаточно документов') }),
    ]);
  });

  it('uses moderation link for submitted status', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ link: '/moderation/project-1' }),
    ]);
  });

  it('uses project link for approved status', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'approved',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ link: '/project' })]);
  });

  it('uses project link for rejected status', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'rejected',
      recipientIds: ['user-1'],
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ link: '/project' })]);
  });

  it('inserts one row for each recipient', async () => {
    const { notifyProjectStatus, mockInsert } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: ['user-1', 'user-2'],
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows).toHaveLength(2);
  });

  it('calls fetch once per inserted notification', async () => {
    const { notifyProjectStatus } = await loadNotifyProjectStatusTest();

    await notifyProjectStatus({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: ['user-1', 'user-2'],
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('T71 POST /api/project/submit', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-moderators');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  it('calls notifyProjectStatus after successful submit', async () => {
    const { POST, mockNotifyProjectStatus } = await loadSubmitRouteTest([
      { id: 'moderator-1', role: 'moderator' },
    ]);

    await POST(makeRequest('http://localhost/api/project/submit'));

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith({
      projectId: 'project-1',
      projectName: 'Проект',
      newStatus: 'submitted',
      recipientIds: ['moderator-1'],
      baseUrl: 'http://localhost:3000',
    });
  });

  it('passes only moderator/admin/superadmin recipient ids', async () => {
    const { POST, mockNotifyProjectStatus } = await loadSubmitRouteTest([
      { id: 'moderator-1', role: 'moderator' },
      { id: 'admin-1', role: 'admin' },
      { id: 'superadmin-1', role: 'superadmin' },
      { id: 'investor-1', role: 'investor' },
      { id: 'project-user-1', role: 'project' },
    ]);

    await POST(makeRequest('http://localhost/api/project/submit'));

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientIds: ['moderator-1', 'admin-1', 'superadmin-1'],
      })
    );
  });
});

describe('T71 POST /api/admin/projects/[id]/approve', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  it('calls notifyProjectStatus with approved status', async () => {
    const { POST, mockNotifyProjectStatus } = await loadAdminProjectRouteTest('approve');

    await POST(makeRequest('http://localhost/api/admin/projects/project-1/approve', {
      moderator_id: 'moderator-1',
    }), { params: Promise.resolve({ id: 'project-1' }) });

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'approved' })
    );
  });

  it('passes project owner as recipient', async () => {
    const { POST, mockNotifyProjectStatus } = await loadAdminProjectRouteTest('approve');

    await POST(makeRequest('http://localhost/api/admin/projects/project-1/approve', {
      moderator_id: 'moderator-1',
    }), { params: Promise.resolve({ id: 'project-1' }) });

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['owner-1'] })
    );
  });
});

describe('T71 POST /api/admin/projects/[id]/reject', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  it('calls notifyProjectStatus with rejected status', async () => {
    const { POST, mockNotifyProjectStatus } = await loadAdminProjectRouteTest('reject');

    await POST(makeRequest('http://localhost/api/admin/projects/project-1/reject', {
      moderator_id: 'moderator-1',
      rejection_reason: 'Недостаточно документов',
    }), { params: Promise.resolve({ id: 'project-1' }) });

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ newStatus: 'rejected' })
    );
  });

  it('passes rejectionReason to notifyProjectStatus', async () => {
    const { POST, mockNotifyProjectStatus } = await loadAdminProjectRouteTest('reject');

    await POST(makeRequest('http://localhost/api/admin/projects/project-1/reject', {
      moderator_id: 'moderator-1',
      rejection_reason: 'Недостаточно документов',
    }), { params: Promise.resolve({ id: 'project-1' }) });

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({ rejectionReason: 'Недостаточно документов' })
    );
  });
});
