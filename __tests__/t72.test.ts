import { NextRequest } from 'next/server';

type InvestorRow = {
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

type ProjectRow = {
  id: string;
  status: string;
  owner_id: string;
  name: string | null;
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

async function loadNotifyInvestorsNewDealTest(options?: {
  investors?: InvestorRow[] | null;
  inserted?: InsertedNotification[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockUsersEq = jest.fn(async () => ({
    data:
      options && 'investors' in options
        ? options.investors
        : [{ id: 'investor-1' }, { id: 'investor-2' }],
    error: null,
  }));
  const mockUsersSelect = jest.fn(() => ({
    eq: mockUsersEq,
  }));

  const mockNotificationsSelect = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notification-1', user_id: 'investor-1' },
            { id: 'notification-2', user_id: 'investor-2' },
          ],
    error: null,
  }));
  const mockInsert = jest.fn((rows: NotificationRow[]) => {
    void rows;
    if (options?.insertThrows) throw new Error('insert failed');
    return { select: mockNotificationsSelect };
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

  const notifyModule = await import('@/lib/notifications/notify-investors-new-deal');

  return {
    notifyInvestorsNewDeal: notifyModule.notifyInvestorsNewDeal,
    mockFrom,
    mockInsert,
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

async function loadApproveRouteTest() {
  jest.resetModules();

  const mockNotifyInvestorsNewDeal = jest.fn().mockResolvedValue(undefined);
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
  jest.doMock('@/lib/notifications/notify-investors-new-deal', () => ({
    notifyInvestorsNewDeal: mockNotifyInvestorsNewDeal,
  }));
  jest.doMock('@/lib/notifications/notify-project-status', () => ({
    notifyProjectStatus: mockNotifyProjectStatus,
  }));

  const route = await import('@/app/api/admin/projects/[id]/approve/route');

  return {
    POST: route.POST,
    mockNotifyInvestorsNewDeal,
    mockNotifyProjectStatus,
  };
}

describe('T72 notifyInvestorsNewDeal', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('does not insert when investors list is empty', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest({
      investors: [],
    });

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not insert when investors list is null', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest({
      investors: null,
    });

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('uses new investment opportunity title', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest();

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ title: 'Новая инвестиционная возможность' }),
      expect.objectContaining({ title: 'Новая инвестиционная возможность' }),
    ]);
  });

  it('includes project name in body', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest();

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект Альфа',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ body: expect.stringContaining('Проект Альфа') }),
      expect.objectContaining({ body: expect.stringContaining('Проект Альфа') }),
    ]);
  });

  it('uses deal room link', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest();

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ link: '/deals/project-1' }),
      expect.objectContaining({ link: '/deals/project-1' }),
    ]);
  });

  it('inserts one row for each investor', async () => {
    const { notifyInvestorsNewDeal, mockInsert } = await loadNotifyInvestorsNewDealTest();

    await notifyInvestorsNewDeal({
      projectId: 'project-1',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationRow[]];
    expect(rows).toHaveLength(2);
  });

  it('calls dispatch-email fetch once per inserted notification', async () => {
    const { notifyInvestorsNewDeal } = await loadNotifyInvestorsNewDealTest();

    await notifyInvestorsNewDeal({
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
    const { notifyInvestorsNewDeal } = await loadNotifyInvestorsNewDealTest({
      insertThrows: true,
    });

    await expect(
      notifyInvestorsNewDeal({
        projectId: 'project-1',
        projectName: 'Проект',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });
});

describe('T72 POST /api/admin/projects/[id]/approve', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-investors-new-deal');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  it('calls notifyInvestorsNewDeal after successful approve', async () => {
    const { POST, mockNotifyInvestorsNewDeal } = await loadApproveRouteTest();

    await POST(
      makeRequest('http://localhost/api/admin/projects/project-1/approve', {
        moderator_id: 'moderator-1',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(mockNotifyInvestorsNewDeal).toHaveBeenCalled();
  });

  it('passes project id to notifyInvestorsNewDeal', async () => {
    const { POST, mockNotifyInvestorsNewDeal } = await loadApproveRouteTest();

    await POST(
      makeRequest('http://localhost/api/admin/projects/project-1/approve', {
        moderator_id: 'moderator-1',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(mockNotifyInvestorsNewDeal).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'project-1' })
    );
  });

  it('passes project name to notifyInvestorsNewDeal', async () => {
    const { POST, mockNotifyInvestorsNewDeal } = await loadApproveRouteTest();

    await POST(
      makeRequest('http://localhost/api/admin/projects/project-1/approve', {
        moderator_id: 'moderator-1',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(mockNotifyInvestorsNewDeal).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'Проект' })
    );
  });

  it('still calls notifyProjectStatus for owner', async () => {
    const { POST, mockNotifyProjectStatus } = await loadApproveRouteTest();

    await POST(
      makeRequest('http://localhost/api/admin/projects/project-1/approve', {
        moderator_id: 'moderator-1',
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(mockNotifyProjectStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        newStatus: 'approved',
        recipientIds: ['owner-1'],
      })
    );
  });
});
