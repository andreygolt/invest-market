import { NextRequest } from 'next/server';

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type ApplicationRow = {
  investor_id: string;
};

type NotificationInsertRow = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadNotifyProjectUpdateTest(options?: {
  applications?: ApplicationRow[] | null;
  insertedNotifications?: Array<{ id: string; user_id: string }>;
  insertThrows?: boolean;
  insertData?: Array<{ id: string; user_id: string }> | null;
}) {
  jest.resetModules();

  const mockInsert = jest.fn(() => {
    if (options?.insertThrows) throw new Error('insert failed');
    return {
    select: jest.fn(async () => ({
      data:
        options && 'insertData' in options
          ? options.insertData
          : (options?.insertedNotifications ?? [{ id: 'notif-1', user_id: 'investor-1' }]),
      error: null,
    })),
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'applications') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        not: jest.fn(async () => ({ data: options?.applications ?? [], error: null })),
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
    createAdminClient: jest.fn(() => ({ from: mockFrom })),
  }));

  const notifyModule = await import('@/lib/notifications/notify-project-update');

  return {
    notifyProjectUpdate: notifyModule.notifyProjectUpdate,
    mockFrom,
    mockInsert,
  };
}

function makeRouteQuery(result: QueryResult<unknown>) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn(() => query),
    single: jest.fn(async () => result),
  };

  return query;
}

async function loadProjectUpdatesRouteTest(options: {
  userId?: string | null;
  project?: { id: string; name: string } | null;
  updateResult?: QueryResult<unknown>;
}) {
  jest.resetModules();

  const mockNotifyProjectUpdate = jest.fn().mockResolvedValue(undefined);
  const mockNotifyProjectInvestors = jest.fn().mockResolvedValue(undefined);
  const mockGenerateUpdateSummary = jest.fn().mockResolvedValue(undefined);
  const mockGetUser = jest.fn().mockResolvedValue({
    data: { user: options.userId === null ? null : { id: options.userId ?? 'project-owner-1' } },
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return makeRouteQuery({ data: options.project ?? { id: 'proj-1', name: 'Проект' }, error: null });
    }

    if (table === 'project_updates') {
      return makeRouteQuery(
        options.updateResult ?? {
          data: {
            id: 'update-1',
            title: 'Тест',
            body: 'Текст',
            project_id: 'proj-1',
            ai_summary: null,
            created_at: '2026-06-28T10:00:00Z',
            updated_at: '2026-06-28T10:00:00Z',
          },
          error: null,
        }
      );
    }

    return makeRouteQuery({ data: null, error: null });
  });

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-project-update', () => ({
    notifyProjectUpdate: mockNotifyProjectUpdate,
  }));
  jest.doMock('@/lib/notifications/notify-project-investors', () => ({
    notifyProjectInvestors: mockNotifyProjectInvestors,
  }));
  jest.doMock('@/lib/ai/updates', () => ({
    generateUpdateSummary: mockGenerateUpdateSummary,
  }));

  const routeModule = await import('@/app/api/project/updates/route');

  return {
    POST: routeModule.POST,
    mockNotifyProjectUpdate,
    mockFrom,
  };
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/project/updates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('T62 notifyProjectUpdate', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('returns undefined and does not insert when applications are empty', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest();

    await expect(
      notifyProjectUpdate({
        projectId: 'proj-1',
        projectName: 'Проект',
        updateTitle: 'Апдейт',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('collects investor_id from applications', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-2' }],
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([expect.objectContaining({ user_id: 'investor-2' })]);
  });

  it('deduplicates investor_id across applications', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }, { investor_id: 'investor-1' }],
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows).toHaveLength(1);
  });

  it('inserts one notification for each unique investor_id', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }, { investor_id: 'investor-2' }],
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows).toHaveLength(2);
  });

  it('formats notification title, body and link', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }],
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект А',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        title: 'Новое обновление от проекта',
        body: 'Проект «Проект А» опубликовал новое обновление: «Апдейт».',
        link: '/deals/proj-1',
      }),
    ]);
  });

  it('calls dispatch-email fetch for each inserted notification', async () => {
    const { notifyProjectUpdate } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }, { investor_id: 'investor-2' }],
      insertedNotifications: [
        { id: 'notif-1', user_id: 'investor-1' },
        { id: 'notif-2', user_id: 'investor-2' },
      ],
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert throws', async () => {
    const { notifyProjectUpdate } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }],
      insertThrows: true,
    });

    await expect(
      notifyProjectUpdate({
        projectId: 'proj-1',
        projectName: 'Проект',
        updateTitle: 'Апдейт',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('does not call fetch when insert returns empty data', async () => {
    const { notifyProjectUpdate } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }],
      insertData: null,
    });

    await notifyProjectUpdate({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('T62 POST /api/project/updates', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  });

  afterEach(() => {
    restoreEnv();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/notifications/notify-project-update');
    jest.dontMock('@/lib/notifications/notify-project-investors');
    jest.dontMock('@/lib/ai/updates');
  });

  it('returns 401 without authorization', async () => {
    const { POST } = await loadProjectUpdatesRouteTest({ userId: null });

    const response = await POST(makePostRequest({ title: 'Тест', body: 'Текст' }));

    expect(response.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    const { POST } = await loadProjectUpdatesRouteTest({});

    const response = await POST(makePostRequest({ body: 'Текст' }));

    expect(response.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    const { POST } = await loadProjectUpdatesRouteTest({});

    const response = await POST(makePostRequest({ title: 'Тест' }));

    expect(response.status).toBe(400);
  });

  it('returns 201 on successful update creation', async () => {
    const { POST } = await loadProjectUpdatesRouteTest({});

    const response = await POST(makePostRequest({ title: 'Тест', body: 'Текст' }));
    const body = (await response.json()) as { id: string };

    expect(response.status).toBe(201);
    expect(body.id).toBe('update-1');
  });

  it('calls notifyProjectUpdate after successful update creation', async () => {
    const { POST, mockNotifyProjectUpdate } = await loadProjectUpdatesRouteTest({});

    await POST(makePostRequest({ title: 'Тест', body: 'Текст' }));

    expect(mockNotifyProjectUpdate).toHaveBeenCalledWith({
      projectId: 'proj-1',
      projectName: 'Проект',
      updateTitle: 'Тест',
      baseUrl: 'https://invest.test',
    });
  });

  it('does not call notifyProjectUpdate when update insert fails', async () => {
    const { POST, mockNotifyProjectUpdate } = await loadProjectUpdatesRouteTest({
      updateResult: { data: null, error: { message: 'insert failed' } },
    });

    const response = await POST(makePostRequest({ title: 'Тест', body: 'Текст' }));

    expect(response.status).toBe(500);
    expect(mockNotifyProjectUpdate).not.toHaveBeenCalled();
  });
});
