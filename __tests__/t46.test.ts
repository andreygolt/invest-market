import { NextRequest } from 'next/server';

import { POST as POST_SUBMIT_PROJECT } from '@/app/api/project/submit/route';
import { createNotification } from '@/lib/notifications/create';
import { notifyModerators } from '@/lib/notifications/notify-moderators';
import type { NotificationType, ProjectStatus } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockCreateNotification = jest.mocked(createNotification);

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

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}));

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T;
  error: QueryError | null;
};

type ModeratorRow = {
  id: string;
};

type ProjectSubmitRow = {
  id: string;
  status: ProjectStatus;
  name: string | null;
};

type ModeratorNotificationPayload = {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
};

const defaultModerators: ModeratorRow[] = [
  { id: 'moderator-1' },
  { id: 'admin-1' },
  { id: 'superadmin-1' },
];

const mockModeratorsSelect = jest.fn();
const mockModeratorsIn = jest.fn();

function makeModeratorsQuery(moderators: ModeratorRow[] | null, error: QueryError | null = null) {
  const query = {
    select: mockModeratorsSelect.mockImplementation(() => query),
    in: mockModeratorsIn.mockResolvedValue({
      data: moderators,
      error,
    } satisfies QueryResult<ModeratorRow[] | null>),
  };

  return query;
}

function setupModerators(moderators: ModeratorRow[] | null, error: QueryError | null = null) {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return makeModeratorsQuery(moderators, error);
    return {};
  });
}

function makeSubmitProjectQuery(project: ProjectSubmitRow | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async (): Promise<QueryResult<ProjectSubmitRow | null>> => ({
          data: project,
          error: null,
        })),
      })),
    })),
  };
}

function makeQuestionnaireQuery(sections: string[]) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async (): Promise<QueryResult<Array<{ section: string }>>> => ({
        data: sections.map((section) => ({ section })),
        error: null,
      })),
    })),
  };
}

function makeAdminUpdateQuery(updateSpy: jest.Mock) {
  return {
    update: updateSpy.mockImplementation(() => ({
      eq: jest.fn(async (): Promise<QueryResult<null>> => ({ data: null, error: null })),
    })),
  };
}

function makeAdminInsertQuery(insertSpy: jest.Mock) {
  return {
    insert: insertSpy.mockImplementation(async (): Promise<QueryResult<null>> => ({
      data: null,
      error: null,
    })),
  };
}

function setupSubmitRoute(project: ProjectSubmitRow = {
  id: 'project-1',
  status: 'draft',
  name: 'Тестовый проект',
}) {
  const updateSpy = jest.fn();
  const insertSpy = jest.fn();

  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockServerFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeSubmitProjectQuery(project);
    if (table === 'project_questionnaire') return makeQuestionnaireQuery(['s1']);
    return {};
  });
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeAdminUpdateQuery(updateSpy);
    if (table === 'project_status_log') return makeAdminInsertQuery(insertSpy);
    if (table === 'profiles') return makeModeratorsQuery([{ id: 'moderator-1' }]);
    return {};
  });

  return { updateSpy, insertSpy };
}

function firstModeratorNotification() {
  return mockCreateNotification.mock.calls[0]?.[0] as ModeratorNotificationPayload | undefined;
}

describe('T46 moderator notifications for project submission', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockCreateNotification.mockReset();
    mockCreateNotification.mockResolvedValue(undefined);
    mockModeratorsSelect.mockReset();
    mockModeratorsIn.mockReset();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
    setupModerators(defaultModerators);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('notifyModerators calls createNotification for each moderator and administrator', async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'moderator-1' }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'admin-1' }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'superadmin-1' }));
  });

  it('notifyModerators requests profiles with moderator, admin and superadmin roles', async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(mockAdminFrom).toHaveBeenCalledWith('profiles');
    expect(mockModeratorsSelect).toHaveBeenCalledWith('id');
    expect(mockModeratorsIn).toHaveBeenCalledWith('role', ['moderator', 'admin', 'superadmin']);
  });

  it("notifyModerators creates notification type 'new_project_submission'", async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(firstModeratorNotification()?.type).toBe('new_project_submission');
  });

  it("notifyModerators creates notification title 'Новый проект на модерацию'", async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(firstModeratorNotification()?.title).toBe('Новый проект на модерацию');
  });

  it('notifyModerators notification link contains projectId', async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(firstModeratorNotification()?.link).toBe('/moderation/project-1');
  });

  it('notifyModerators notification body contains projectName', async () => {
    await notifyModerators('project-1', 'Тестовый проект');

    expect(firstModeratorNotification()?.body).toContain('Тестовый проект');
  });

  it('notifyModerators does not call createNotification without moderators', async () => {
    setupModerators([]);

    await notifyModerators('project-1', 'Тестовый проект');

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifyModerators does not reject when one createNotification call fails', async () => {
    mockCreateNotification.mockRejectedValueOnce(new Error('db error'));

    await expect(notifyModerators('project-1', 'Тестовый проект')).resolves.toBeUndefined();
    expect(createNotification).toHaveBeenCalledTimes(3);
  });

  it('notifyModerators does not throw if adminSupabase returns an error', async () => {
    setupModerators(null, { message: 'select failed' });

    await expect(notifyModerators('project-1', 'Тестовый проект')).resolves.toBeUndefined();
  });

  it('POST /api/project/submit returns 200 and submits project', async () => {
    const { updateSpy } = setupSubmitRoute();

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('submitted');
    expect(updateSpy).toHaveBeenCalledWith({ status: 'submitted' });
  });

  it('POST /api/project/submit notifies moderators after successful status update', async () => {
    const { updateSpy, insertSpy } = setupSubmitRoute();

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(updateSpy).toHaveBeenCalled();
    expect(insertSpy).toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'new_project_submission',
        body: expect.stringContaining('Тестовый проект'),
        link: '/moderation/project-1',
      })
    );
  });

  it("NotificationType includes 'new_project_submission'", () => {
    const type: NotificationType = 'new_project_submission';
    // @ts-expect-error invalid notification type must stay rejected
    const invalidType: NotificationType = 'invalid_notification_type';

    expect(type).toBe('new_project_submission');
    expect(invalidType).toBe('invalid_notification_type');
  });
});
