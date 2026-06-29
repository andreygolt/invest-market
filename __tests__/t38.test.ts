import { NextRequest } from 'next/server';

import { POST as projectUpdatesPost } from '@/app/api/project/updates/route';
import { createNotification } from '@/lib/notifications/create';
import { notifyProjectInvestors } from '@/lib/notifications/notify-project-investors';
import type { NotificationType, ProjectUpdate } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

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

jest.mock('@/lib/ai/updates', () => ({
  generateUpdateSummary: jest.fn().mockResolvedValue(undefined),
}));

type InvestorRow = {
  investor_id: string;
  status?: string;
};

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

const mockRowsByTable: Record<string, InvestorRow[]> = {
  applications: [],
  investor_portfolio: [],
  investor_favorites: [],
};

const appStatusIn = jest.fn();

function makeInvestorQuery(table: string) {
  let statuses: string[] | null = null;
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    in: jest.fn((column: string, values: string[]) => {
      if (table === 'applications' && column === 'status') {
        statuses = values;
        appStatusIn(column, values);
      }
      return query;
    }),
    then: (
      resolve: (value: QueryResult<InvestorRow[]>) => unknown,
      reject: (reason?: unknown) => unknown
    ) => {
      const rows = mockRowsByTable[table] ?? [];
      const filteredRows = statuses
        ? rows.filter((row) => row.status === undefined || statuses?.includes(row.status))
        : rows;

      return Promise.resolve({ data: filteredRows, error: null }).then(resolve, reject);
    },
  };

  return query;
}

function makeServerQuery(result: QueryResult<unknown>) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: jest.fn(async () => result),
    insert: jest.fn(() => query),
    single: jest.fn(async () => result),
  };

  return query;
}

const sampleUpdate: ProjectUpdate = {
  id: 'update-1',
  project_id: 'project-1',
  title: 'Новый релиз',
  body: 'Запустили новую версию продукта.',
  ai_summary: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
};

describe('T38 project update notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRowsByTable.applications = [];
    mockRowsByTable.investor_portfolio = [];
    mockRowsByTable.investor_favorites = [];
    mockAdminFrom.mockImplementation((table: string) => makeInvestorQuery(table));
  });

  it('notifyProjectInvestors calls createNotification for each investor_id from applications', async () => {
    mockRowsByTable.applications = [{ investor_id: 'investor-1', status: 'pending' }];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'investor-1' })
    );
  });

  it('notifyProjectInvestors calls createNotification for each investor_id from investor_portfolio', async () => {
    mockRowsByTable.investor_portfolio = [{ investor_id: 'investor-2' }];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'investor-2' })
    );
  });

  it('notifyProjectInvestors calls createNotification for each investor_id from investor_favorites', async () => {
    mockRowsByTable.investor_favorites = [{ investor_id: 'investor-3' }];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'investor-3' })
    );
  });

  it('notifyProjectInvestors deduplicates investors across sources', async () => {
    mockRowsByTable.applications = [{ investor_id: 'investor-1', status: 'approved' }];
    mockRowsByTable.investor_portfolio = [{ investor_id: 'investor-1' }];
    mockRowsByTable.investor_favorites = [{ investor_id: 'investor-1' }];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it('notifyProjectInvestors does not call createNotification without interested investors', async () => {
    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).not.toHaveBeenCalled();
  });

  it('notifyProjectInvestors creates project_update notification payload', async () => {
    mockRowsByTable.applications = [{ investor_id: 'investor-1', status: 'pending' }];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(createNotification).toHaveBeenCalledWith({
      user_id: 'investor-1',
      type: 'project_update',
      title: 'Обновление: Проект',
      body: 'Новый релиз',
      link: '/deals/project-1',
    });
  });

  it('notifyProjectInvestors excludes rejected and cancelled applications', async () => {
    mockRowsByTable.applications = [
      { investor_id: 'investor-1', status: 'rejected' },
      { investor_id: 'investor-2', status: 'cancelled' },
      { investor_id: 'investor-3', status: 'pending' },
    ];

    await notifyProjectInvestors('project-1', 'Проект', 'Новый релиз');

    expect(appStatusIn).toHaveBeenCalledWith('status', ['pending', 'approved']);
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'investor-3' })
    );
  });

  it('POST /api/project/updates returns 201 with valid data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        return makeServerQuery({ data: { id: 'project-1', name: 'Проект' }, error: null });
      }
      if (table === 'project_updates') return makeServerQuery({ data: sampleUpdate, error: null });
      return makeServerQuery({ data: null, error: null });
    });

    const response = await projectUpdatesPost(
      new NextRequest('http://localhost/api/project/updates', {
        method: 'POST',
        body: JSON.stringify({ title: sampleUpdate.title, body: sampleUpdate.body }),
      })
    );
    const body = (await response.json()) as ProjectUpdate;

    expect(response.status).toBe(201);
    expect(body.id).toBe('update-1');
  });

  it('POST /api/project/updates returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await projectUpdatesPost(
      new NextRequest('http://localhost/api/project/updates', {
        method: 'POST',
        body: JSON.stringify({ title: 'Title', body: 'Body' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('POST /api/project/updates returns 400 when title is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await projectUpdatesPost(
      new NextRequest('http://localhost/api/project/updates', {
        method: 'POST',
        body: JSON.stringify({ title: '', body: 'Body' }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('NotificationType includes project_update', () => {
    const type: NotificationType = 'project_update';
    // @ts-expect-error invalid notification type must stay rejected
    const invalidType: NotificationType = 'invalid_notification_type';

    expect(type).toBe('project_update');
    expect(invalidType).toBe('invalid_notification_type');
  });

  it('notifyProjectInvestors does not throw if adminSupabase returns an error', async () => {
    mockAdminFrom.mockImplementation(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          in: jest.fn(async () => ({
            data: null,
            error: { message: 'select failed' },
          })),
        })),
      })),
    }));

    await expect(
      notifyProjectInvestors('project-1', 'Проект', 'Новый релиз')
    ).resolves.toBeUndefined();
  });
});
