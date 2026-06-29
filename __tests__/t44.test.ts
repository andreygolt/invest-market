import { NextRequest } from 'next/server';

import { POST as postInvestorApplication } from '@/app/api/investor/applications/route';
import { createNotification } from '@/lib/notifications/create';
import { notifyManagers } from '@/lib/notifications/notify-managers';
import type { ApplicationDetail, NotificationType } from '@/types';

const mockFrom = jest.fn();

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
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

type ManagerRow = {
  id: string;
};

type ManagerNotificationPayload = {
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
const mockManagersSelect = jest.fn();
const mockManagersIn = jest.fn();

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

function makeManagersQuery(managers: ManagerRow[] | null, error: QueryError | null = null) {
  const query = {
    select: mockManagersSelect.mockImplementation(() => query),
    in: mockManagersIn.mockResolvedValue({ data: managers, error } satisfies QueryResult<
      ManagerRow[] | null
    >),
  };

  return query;
}

function setupRoute(options: {
  project?: ProjectRow | null;
  existing?: ExistingApplication | null;
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
    error: null,
  } satisfies QueryResult<null>);

  mockFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeProjectQuery();
    if (table === 'applications') return makeApplicationsQuery();
    if (table === 'notifications') return makeNotificationsQuery();
    if (table === 'profiles') return makeManagersQuery([{ id: 'manager-1' }]);
    return {};
  });
}

function setupManagers(managers: ManagerRow[] | null, error: QueryError | null = null) {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'profiles') return makeManagersQuery(managers, error);
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

function firstManagerNotification() {
  return jest.mocked(createNotification).mock.calls[0]?.[0] as
    | ManagerNotificationPayload
    | undefined;
}

describe('T44 manager notifications for investor applications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupManagers([
      { id: 'manager-1' },
      { id: 'admin-1' },
      { id: 'superadmin-1' },
    ]);
  });

  it('notifyManagers calls createNotification for each manager and administrator', async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(createNotification).toHaveBeenCalledTimes(3);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'manager-1' })
    );
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'admin-1' }));
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'superadmin-1' })
    );
  });

  it('notifyManagers requests profiles with manager, admin and superadmin roles', async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(mockFrom).toHaveBeenCalledWith('profiles');
    expect(mockManagersSelect).toHaveBeenCalledWith('id');
    expect(mockManagersIn).toHaveBeenCalledWith('role', ['manager', 'admin', 'superadmin']);
  });

  it("notifyManagers creates notification type 'new_application_manager'", async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(firstManagerNotification()?.type).toBe('new_application_manager');
  });

  it("notifyManagers creates notification title 'Новая заявка инвестора'", async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(firstManagerNotification()?.title).toBe('Новая заявка инвестора');
  });

  it('notifyManagers notification link contains applicationId', async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(firstManagerNotification()?.link).toBe('/manager/applications/app-1');
  });

  it('notifyManagers notification body contains projectName', async () => {
    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(firstManagerNotification()?.body).toContain('Проект Альфа');
  });

  it('notifyManagers does not call createNotification without managers', async () => {
    setupManagers([]);

    await notifyManagers('proj-1', 'Проект Альфа', 'app-1');

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifyManagers does not reject when one createNotification call fails', async () => {
    jest.mocked(createNotification).mockRejectedValueOnce(new Error('db error'));

    await expect(notifyManagers('proj-1', 'Проект Альфа', 'app-1')).resolves.toBeUndefined();
    expect(createNotification).toHaveBeenCalledTimes(3);
  });

  it('notifyManagers does not throw if adminSupabase returns an error', async () => {
    setupManagers(null, { message: 'select failed' });

    await expect(notifyManagers('proj-1', 'Проект Альфа', 'app-1')).resolves.toBeUndefined();
  });

  it('POST /api/investor/applications returns 201 and creates application', async () => {
    setupRoute();

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

  it('POST /api/investor/applications calls notifyManagers after successful creation', async () => {
    setupRoute();

    const { response } = await requestApplication({
      investor_id: 'investor-1',
      project_id: 'proj-1',
      message: 'Хочу инвестировать',
    });
    await Promise.resolve();

    expect(response.status).toBe(201);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'new_application_manager',
        link: '/manager/applications/app-1',
      })
    );
  });

  it("NotificationType includes 'new_application_manager'", () => {
    const type: NotificationType = 'new_application_manager';
    // @ts-expect-error invalid notification type must stay rejected
    const invalidType: NotificationType = 'invalid_notification_type';

    expect(type).toBe('new_application_manager');
    expect(invalidType).toBe('invalid_notification_type');
  });
});
