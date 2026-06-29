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

type ModeratorRow = {
  id: string;
};

type MockQuery = {
  select?: jest.Mock;
  in?: jest.Mock;
  eq?: jest.Mock;
  order?: jest.Mock;
  upsert?: jest.Mock;
  update?: jest.Mock;
  insert?: jest.Mock;
  single?: jest.Mock;
  maybeSingle?: jest.Mock;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

async function loadNotifyAiAnalysisDoneTest(options?: {
  moderators?: ModeratorRow[] | null;
  inserted?: InsertedNotificationRow[] | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const profilesQuery: MockQuery = {
    select: jest.fn(() => profilesQuery),
    in: jest.fn(async () => ({
      data:
        options && 'moderators' in options
          ? options.moderators
          : [
              { id: 'moderator-1' },
              { id: 'admin-1' },
            ],
      error: null,
    })),
  };
  const selectInserted = jest.fn(async () => ({
    data:
      options && 'inserted' in options
        ? options.inserted
        : [
            { id: 'notif-1', user_id: 'moderator-1' },
            { id: 'notif-2', user_id: 'admin-1' },
          ],
    error: null,
  }));
  const notificationsQuery: MockQuery = {
    insert: jest.fn((rows: NotificationInsertRow[]) => {
      void rows;
      if (options?.insertThrows) throw new Error('insert failed');
      return { select: selectInserted };
    }),
  };
  const mockFrom = jest.fn((table: string) => {
    if (table === 'profiles') return profilesQuery;
    if (table === 'notifications') return notificationsQuery;
    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));

  const notifyModule = await import('@/lib/notifications/notify-ai-analysis-done');

  return {
    notifyAiAnalysisDone: notifyModule.notifyAiAnalysisDone,
    profilesQuery,
    mockFrom,
    mockInsert: notificationsQuery.insert as jest.Mock,
  };
}

function openAiFetchMock() {
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              red_flags: [],
              missing_data: [],
              draft_card: 'Карточка проекта',
              ai_score: 8,
              summary: 'Проект готов к рассмотрению.',
            }),
          },
        },
      ],
    }),
    text: async () => '',
  })) as unknown as typeof fetch;
}

async function loadRunAnalysisPipelineTest(options?: { upsertError?: boolean; openAiError?: boolean }) {
  jest.resetModules();

  const mockNotifyAiAnalysisDone = jest.fn().mockResolvedValue(undefined);
  const aiReportsUpdateEq = jest.fn(async () => ({ error: null }));
  const aiReportsUpdate = jest.fn(() => ({ eq: aiReportsUpdateEq }));
  const aiReportsSingle = jest.fn(async () => ({
    data: options?.upsertError ? null : { id: 'report-uuid' },
    error: options?.upsertError ? { message: 'upsert failed' } : null,
  }));
  const aiReportsSelect = jest.fn(() => ({ single: aiReportsSingle }));
  const aiReportsUpsert = jest.fn(() => ({ select: aiReportsSelect }));

  const projectsMaybeSingle = jest.fn(async () => ({ data: { name: 'Test Project' }, error: null }));
  const projectsEq = jest.fn(() => ({ maybeSingle: projectsMaybeSingle }));
  const projectsSelect = jest.fn(() => ({ eq: projectsEq }));

  const questionnaireOrder = jest.fn(async () => ({ data: [{ section: 'main', answers: { ok: true } }], error: null }));
  const questionnaireEq = jest.fn(() => ({ order: questionnaireOrder }));
  const questionnaireSelect = jest.fn(() => ({ eq: questionnaireEq }));

  const extractionsSecondEq = jest.fn(async () => ({ data: [{ extracted_text: 'Документ проекта' }], error: null }));
  const extractionsFirstEq = jest.fn(() => ({ eq: extractionsSecondEq }));
  const extractionsSelect = jest.fn(() => ({ eq: extractionsFirstEq }));

  const mockFrom = jest.fn((table: string) => {
    if (table === 'ai_reports') {
      return {
        upsert: aiReportsUpsert,
        update: aiReportsUpdate,
      };
    }
    if (table === 'projects') return { select: projectsSelect };
    if (table === 'project_questionnaire') return { select: questionnaireSelect };
    if (table === 'document_extractions') return { select: extractionsSelect };
    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));
  jest.doMock('@/lib/notifications/notify-ai-analysis-done', () => ({
    notifyAiAnalysisDone: mockNotifyAiAnalysisDone,
  }));

  process.env.OPENAI_API_KEY = 'test-key';
  process.env.NEXT_PUBLIC_APP_URL = 'https://invest.test';
  global.fetch = options?.openAiError
    ? (jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => 'OpenAI error',
      })) as unknown as typeof fetch)
    : openAiFetchMock();

  const analyzeModule = await import('@/lib/ai/analyze');

  return {
    runAnalysisPipeline: analyzeModule.runAnalysisPipeline,
    mockNotifyAiAnalysisDone,
    aiReportsUpsert,
    aiReportsUpdate,
    projectsSelect,
  };
}

describe('T80 notifyAiAnalysisDone', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('does not insert when moderators is an empty array', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({ moderators: [] });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not insert when moderators is null', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({ moderators: null });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('uses the required notification title', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект Север',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows[0].title).toBe('AI-анализ проекта завершён');
  });

  it('puts the project name into the notification body', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект Север',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows[0].body).toContain('Проект Север');
  });

  it('uses the moderation project link', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект Север',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows[0].link).toBe('/moderation/project-uuid');
  });

  it('inserts one row per moderator', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }, { id: 'admin-1' }, { id: 'superadmin-1' }],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows).toHaveLength(3);
  });

  it('dispatches email once per inserted notification', async () => {
    const { notifyAiAnalysisDone } = await loadNotifyAiAnalysisDoneTest({
      inserted: [
        { id: 'notif-1', user_id: 'moderator-1' },
        { id: 'notif-2', user_id: 'admin-1' },
      ],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when notification insert throws', async () => {
    const { notifyAiAnalysisDone } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }],
      insertThrows: true,
    });

    await expect(
      notifyAiAnalysisDone({
        projectId: 'project-uuid',
        projectName: 'Проект',
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('queries profiles with moderator, admin and superadmin roles', async () => {
    const { notifyAiAnalysisDone, profilesQuery } = await loadNotifyAiAnalysisDoneTest();

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    expect(profilesQuery.select).toHaveBeenCalledWith('id');
    expect(profilesQuery.in).toHaveBeenCalledWith('role', ['moderator', 'admin', 'superadmin']);
  });

  it('inserts multiple rows for multiple moderators', async () => {
    const { notifyAiAnalysisDone, mockInsert } = await loadNotifyAiAnalysisDoneTest({
      moderators: [{ id: 'moderator-1' }, { id: 'admin-1' }],
    });

    await notifyAiAnalysisDone({
      projectId: 'project-uuid',
      projectName: 'Проект',
      baseUrl: 'https://invest.test',
    });

    const [rows] = mockInsert.mock.calls[0] as [NotificationInsertRow[]];
    expect(rows.map((row) => row.user_id)).toEqual(['moderator-1', 'admin-1']);
  });
});

describe('T80 runAnalysisPipeline integration', () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-ai-analysis-done');
  });

  it('calls notifyAiAnalysisDone after successful analysis', async () => {
    const { runAnalysisPipeline, mockNotifyAiAnalysisDone } = await loadRunAnalysisPipelineTest();

    await runAnalysisPipeline('project-uuid');

    expect(mockNotifyAiAnalysisDone).toHaveBeenCalledTimes(1);
  });

  it('passes the correct projectId to notifyAiAnalysisDone', async () => {
    const { runAnalysisPipeline, mockNotifyAiAnalysisDone } = await loadRunAnalysisPipelineTest();

    await runAnalysisPipeline('project-uuid');

    expect(mockNotifyAiAnalysisDone).toHaveBeenCalledWith({
      projectId: 'project-uuid',
      projectName: 'Test Project',
      baseUrl: 'https://invest.test',
    });
  });

  it('does not call notifyAiAnalysisDone when analysis fails and status becomes error', async () => {
    const { runAnalysisPipeline, mockNotifyAiAnalysisDone, aiReportsUpdate } = await loadRunAnalysisPipelineTest({
      openAiError: true,
    });

    await runAnalysisPipeline('project-uuid');

    expect(aiReportsUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
    expect(mockNotifyAiAnalysisDone).not.toHaveBeenCalled();
  });

  it('does not call notifyAiAnalysisDone when upsert fails and no ai_report exists', async () => {
    const { runAnalysisPipeline, mockNotifyAiAnalysisDone, projectsSelect } = await loadRunAnalysisPipelineTest({
      upsertError: true,
    });

    await runAnalysisPipeline('project-uuid');

    expect(projectsSelect).not.toHaveBeenCalled();
    expect(mockNotifyAiAnalysisDone).not.toHaveBeenCalled();
  });
});
