import { NextRequest } from 'next/server';

type NotificationInsertRow = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type InsertedNotificationRow = {
  id: string;
  user_id: string;
};

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadNotifyProjectUpdateTest(options?: {
  applications?: Array<{ investor_id: string }> | null;
  inserted?: InsertedNotificationRow[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockNot = jest.fn(async () => ({
    data:
      options && 'applications' in options
        ? options.applications
        : [
            { investor_id: 'investor-1' },
            { investor_id: 'investor-2' },
          ],
    error: null,
  }));
  const applicationsQuery = {
    select: jest.fn(() => applicationsQuery),
    eq: jest.fn(() => applicationsQuery),
    not: mockNot,
  };
  const mockSelectInserted = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notif-1', user_id: 'investor-1' },
            { id: 'notif-2', user_id: 'investor-2' },
          ],
    error: null,
  }));
  const mockInsert = jest.fn((rows: NotificationInsertRow[]) => {
    void rows;
    if (options?.insertThrows) throw new Error('insert failed');
    return {
      select: mockSelectInserted,
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'applications') return applicationsQuery;
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

  const notifyModule = await import('@/lib/notifications/notify-project-update');

  return {
    notifyProjectUpdate: notifyModule.notifyProjectUpdate,
    applicationsQuery,
    mockInsert,
  };
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/project/updates', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function makeRouteQuery(result: QueryResult<unknown>) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn(() => query),
    single: jest.fn(async () => result),
    order: jest.fn(() => query),
  };

  return query;
}

async function loadProjectUpdatesRouteTest(options?: {
  userId?: string | null;
  updateResult?: QueryResult<unknown>;
}) {
  jest.resetModules();

  const mockNotifyProjectUpdate = jest.fn().mockResolvedValue(undefined);
  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return makeRouteQuery({ data: { id: 'project-uuid', name: 'Проект T79' }, error: null });
    }

    if (table === 'project_updates') {
      return makeRouteQuery(
        options?.updateResult ?? {
          data: {
            id: 'update-uuid',
            project_id: 'project-uuid',
            title: 'Новый квартальный отчёт',
            body: 'Текст обновления',
            ai_summary: null,
            created_at: '2026-06-29T10:00:00.000Z',
            updated_at: '2026-06-29T10:00:00.000Z',
          },
          error: null,
        }
      );
    }

    return makeRouteQuery({ data: null, error: null });
  });

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: options?.userId === null ? null : { id: options?.userId ?? 'project-owner-uuid' } },
        })),
      },
      from: mockFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-project-update', () => ({
    notifyProjectUpdate: mockNotifyProjectUpdate,
  }));
  jest.doMock('@/lib/notifications/notify-project-investors', () => ({
    notifyProjectInvestors: jest.fn().mockResolvedValue(undefined),
  }));
  jest.doMock('@/lib/ai/updates', () => ({
    generateUpdateSummary: jest.fn().mockResolvedValue(undefined),
  }));

  const route = await import('@/app/api/project/updates/route');

  return {
    POST: route.POST,
    mockNotifyProjectUpdate,
  };
}

describe('T79 notifyProjectUpdate', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('does not insert when applications is an empty array', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({ applications: [] });

    await notifyProjectUpdate({
      projectId: 'project-uuid',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not insert when applications is null', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({ applications: null });

    await notifyProjectUpdate({
      projectId: 'project-uuid',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('creates notification rows with title, body, update title and deal link', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }],
    });

    await notifyProjectUpdate({
      projectId: 'project-uuid',
      projectName: 'Проект Север',
      updateTitle: 'Открыт новый филиал',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith([
      {
        user_id: 'investor-1',
        title: 'Новое обновление от проекта',
        body: 'Проект «Проект Север» опубликовал новое обновление: «Открыт новый филиал».',
        link: '/deals/project-uuid',
      },
    ]);
  });

  it('inserts one row per unique investor and deduplicates investor_id', async () => {
    const { notifyProjectUpdate, mockInsert } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }, { investor_id: 'investor-1' }, { investor_id: 'investor-2' }],
    });

    await notifyProjectUpdate({
      projectId: 'project-uuid',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.user_id)).toEqual(['investor-1', 'investor-2']);
  });

  it('dispatches email once per inserted notification', async () => {
    const { notifyProjectUpdate } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }, { investor_id: 'investor-2' }],
      inserted: [
        { id: 'notif-1', user_id: 'investor-1' },
        { id: 'notif-2', user_id: 'investor-2' },
      ],
    });

    await notifyProjectUpdate({
      projectId: 'project-uuid',
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

  it('does not throw when notification insert throws', async () => {
    const { notifyProjectUpdate } = await loadNotifyProjectUpdateTest({
      applications: [{ investor_id: 'investor-1' }],
      insertThrows: true,
    });

    await expect(
      notifyProjectUpdate({
        projectId: 'project-uuid',
        projectName: 'Проект',
        updateTitle: 'Апдейт',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('queries applications by project_id and excludes withdrawn and rejected statuses', async () => {
    const { notifyProjectUpdate, applicationsQuery } = await loadNotifyProjectUpdateTest();

    await notifyProjectUpdate({
      projectId: 'project-uuid',
      projectName: 'Проект',
      updateTitle: 'Апдейт',
      baseUrl: 'https://invest.test',
    });

    expect(applicationsQuery.eq).toHaveBeenCalledWith('project_id', 'project-uuid');
    expect(applicationsQuery.not).toHaveBeenCalledWith('status', 'in', '("withdrawn","rejected")');
  });
});

describe('T79 POST /api/project/updates', () => {
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

  it('calls notifyProjectUpdate after successful POST with projectId and updateTitle', async () => {
    const { POST, mockNotifyProjectUpdate } = await loadProjectUpdatesRouteTest();

    const response = await POST(makePostRequest({ title: 'Новый квартальный отчёт', body: 'Текст обновления' }));

    expect(response.status).toBe(201);
    expect(mockNotifyProjectUpdate).toHaveBeenCalledWith({
      projectId: 'project-uuid',
      projectName: 'Проект T79',
      updateTitle: 'Новый квартальный отчёт',
      baseUrl: 'https://invest.test',
    });
  });

  it('does not call notifyProjectUpdate when validation returns 400', async () => {
    const { POST, mockNotifyProjectUpdate } = await loadProjectUpdatesRouteTest();

    const response = await POST(makePostRequest({ title: '', body: 'Текст обновления' }));

    expect(response.status).toBe(400);
    expect(mockNotifyProjectUpdate).not.toHaveBeenCalled();
  });

  it('does not call notifyProjectUpdate when request is unauthorized', async () => {
    const { POST, mockNotifyProjectUpdate } = await loadProjectUpdatesRouteTest({ userId: null });

    const response = await POST(makePostRequest({ title: 'Новый квартальный отчёт', body: 'Текст обновления' }));

    expect(response.status).toBe(401);
    expect(mockNotifyProjectUpdate).not.toHaveBeenCalled();
  });
});
