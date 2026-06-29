import { NextRequest } from 'next/server';

import { POST as postInvestorApplication } from '@/app/api/investor/applications/route';
import type { ApplicationDetail, NotificationType } from '@/types';

const mockFrom = jest.fn();

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

type QueryError = {
  message: string;
};

type QueryResult<T> = {
  data: T;
  error: QueryError | null;
};

type ProjectRow = {
  id: string;
  name: string;
  status: 'approved';
  owner_id: string | null;
};

type ExistingApplication = {
  id: string;
  status: string;
};

type InsertedApplication = {
  id: string;
  project_id: string;
  amount: number | null;
  status: 'pending';
  message: string;
  created_at: string;
  updated_at: string;
};

type NotificationPayload = {
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
};

const defaultProject: ProjectRow = {
  id: 'proj-1',
  name: 'Проект Альфа',
  status: 'approved',
  owner_id: 'owner-1',
};

const insertedApplication: InsertedApplication = {
  id: 'app-1',
  project_id: 'proj-1',
  amount: null,
  status: 'pending',
  message: 'Хочу инвестировать',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const mockProjectMaybeSingle = jest.fn();
const mockExistingMaybeSingle = jest.fn();
const mockApplicationInsert = jest.fn();
const mockApplicationSingle = jest.fn();
const mockNotificationInsert = jest.fn();

function makeProjectQuery() {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: mockProjectMaybeSingle,
  };

  return query;
}

function makeApplicationsQuery() {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    maybeSingle: mockExistingMaybeSingle,
    insert: mockApplicationInsert.mockImplementation(() => query),
    single: mockApplicationSingle,
  };

  return query;
}

function makeNotificationsQuery() {
  return {
    insert: mockNotificationInsert,
  };
}

function setupSupabase(options: {
  project?: ProjectRow | null;
  existing?: ExistingApplication | null;
  notificationError?: QueryError | null;
} = {}) {
  mockProjectMaybeSingle.mockResolvedValue({
    data: options.project === undefined ? defaultProject : options.project,
    error: null,
  } satisfies QueryResult<ProjectRow | null>);
  mockExistingMaybeSingle.mockResolvedValue({
    data: options.existing ?? null,
    error: null,
  } satisfies QueryResult<ExistingApplication | null>);
  mockApplicationInsert.mockImplementation(() => makeApplicationsQuery());
  mockApplicationSingle.mockResolvedValue({
    data: insertedApplication,
    error: null,
  } satisfies QueryResult<InsertedApplication>);
  mockNotificationInsert.mockResolvedValue({
    data: null,
    error: options.notificationError ?? null,
  } satisfies QueryResult<null>);

  mockFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeProjectQuery();
    if (table === 'applications') return makeApplicationsQuery();
    if (table === 'notifications') return makeNotificationsQuery();
    return {};
  });
}

async function requestApplication(body: Record<string, unknown>) {
  const response = await postInvestorApplication(
    new NextRequest('http://localhost/api/investor/applications', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
  const responseBody = (await response.json()) as ApplicationDetail | { error: string };

  return { response, body: responseBody };
}

function notificationPayload() {
  return mockNotificationInsert.mock.calls[0]?.[0] as NotificationPayload | undefined;
}

describe('T42 investor application owner notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupSupabase();
  });

  it('POST /api/investor/applications returns 201 and creates application', async () => {
    const { response, body } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(response.status).toBe(201);
    expect((body as ApplicationDetail).id).toBe('app-1');
    expect(mockApplicationInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        investor_id: 'investor-1',
        project_id: 'proj-1',
        status: 'pending',
        message: 'Хочу инвестировать',
      })
    );
  });

  it("POST /api/investor/applications calls insert in 'notifications' on success", async () => {
    await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(mockFrom).toHaveBeenCalledWith('notifications');
    expect(mockNotificationInsert).toHaveBeenCalledTimes(1);
  });

  it("POST /api/investor/applications creates notification type 'new_application'", async () => {
    await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(notificationPayload()?.type).toBe('new_application');
  });

  it('POST /api/investor/applications notification user_id equals project.owner_id', async () => {
    await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(notificationPayload()?.user_id).toBe('owner-1');
  });

  it("POST /api/investor/applications notification title is 'Новая заявка от инвестора'", async () => {
    await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(notificationPayload()?.title).toBe('Новая заявка от инвестора');
  });

  it("POST /api/investor/applications notification link is '/project'", async () => {
    await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(notificationPayload()?.link).toBe('/project');
  });

  it('POST /api/investor/applications does not create notification without owner_id', async () => {
    setupSupabase({ project: { ...defaultProject, owner_id: null } });

    const { response } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(response.status).toBe(201);
    expect(mockNotificationInsert).not.toHaveBeenCalled();
  });

  it('POST /api/investor/applications notification insert error does not change 201 response', async () => {
    setupSupabase({ notificationError: { message: 'notification failed' } });

    const { response, body } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(response.status).toBe(201);
    expect((body as ApplicationDetail).id).toBe('app-1');
  });

  it('POST /api/investor/applications returns 400 without required fields', async () => {
    const { response } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: ' ',
    });

    expect(response.status).toBe(400);
  });

  it('POST /api/investor/applications returns 404 when project is missing or not approved', async () => {
    setupSupabase({ project: null });

    const { response } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(response.status).toBe(404);
  });

  it('POST /api/investor/applications returns 409 when active application already exists', async () => {
    setupSupabase({ existing: { id: 'app-existing', status: 'pending' } });

    const { response } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });

    expect(response.status).toBe(409);
  });

  it("NotificationType includes 'new_application'", () => {
    const type: NotificationType = 'new_application';
    // @ts-expect-error invalid notification type must stay rejected
    const invalidType: NotificationType = 'invalid_notification_type';

    expect(type).toBe('new_application');
    expect(invalidType).toBe('invalid_notification_type');
  });
});
