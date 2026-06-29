import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GET } from '@/app/api/project/status-log/route';
import { StatusTimeline } from '@/components/project/status-timeline';
import type { ProjectStatusLogEntry } from '@/types';

type MockUser = { id: string } | null;
type MockRole = 'admin' | 'superadmin' | 'moderator' | 'manager' | 'investor' | 'project';
type MockError = { message: string } | null;
type MockLogResult = { data: ProjectStatusLogEntry[]; error: MockError };

type MockSelectQuery<T> = {
  select: jest.Mock<MockSelectQuery<T>, [string]>;
  eq: jest.Mock<MockSelectQuery<T>, [string, string]>;
  single: jest.Mock<Promise<{ data: T | null; error: MockError }>, []>;
};

type MockLogQuery = {
  select: jest.Mock<MockLogQuery, [string]>;
  eq: jest.Mock<MockLogQuery, [string, string]>;
  order: jest.Mock<Promise<MockLogResult>, [string, { ascending: boolean }]>;
};

const mockGetUser = jest.fn();
const mockAdminFrom = jest.fn();
let mockUser: MockUser = { id: 'project-owner-1' };
let mockRole: MockRole = 'project';
let mockProject: { id: string } | null = { id: 'project-1' };
let mockStatusLog: ProjectStatusLogEntry[] = [];
let mockLogQuery: MockLogQuery;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

const mockEntry: ProjectStatusLogEntry = {
  id: 'log-1',
  project_id: 'project-1',
  old_status: null,
  new_status: 'submitted',
  changed_at: '2026-06-01T10:00:00Z',
  changed_by: 'project-owner-1',
};

const mockSecondEntry: ProjectStatusLogEntry = {
  id: 'log-2',
  project_id: 'project-1',
  old_status: 'submitted',
  new_status: 'under_review',
  changed_at: '2026-06-02T12:00:00Z',
  changed_by: 'admin-1',
};

function makeSelectQuery<T>(data: T | null): MockSelectQuery<T> {
  const query: MockSelectQuery<T> = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    single: jest.fn(async () => ({ data, error: null })),
  };
  return query;
}

function makeLogQuery(rows: ProjectStatusLogEntry[]): MockLogQuery {
  const query: MockLogQuery = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(async () => ({ data: rows, error: null })),
  };
  return query;
}

beforeEach(() => {
  mockUser = { id: 'project-owner-1' };
  mockRole = 'project';
  mockProject = { id: 'project-1' };
  mockStatusLog = [mockEntry, mockSecondEntry];
  mockLogQuery = makeLogQuery(mockStatusLog);

  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: mockUser } });

  mockAdminFrom.mockReset();
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'users') return makeSelectQuery({ role: mockRole });
    if (table === 'projects') return makeSelectQuery(mockProject);
    if (table === 'project_status_log') {
      mockLogQuery = makeLogQuery(mockStatusLog);
      return mockLogQuery;
    }
    return {};
  });
});

describe('T69 GET /api/project/status-log', () => {
  it('возвращает 401 без авторизации', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('возвращает 403 для роли investor', async () => {
    mockRole = 'investor';

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('возвращает 403 для роли admin', async () => {
    mockRole = 'admin';

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it('возвращает 200 и массив log для роли project', async () => {
    const response = await GET();
    const body = (await response.json()) as { log: ProjectStatusLogEntry[] };

    expect(response.status).toBe(200);
    expect(Array.isArray(body.log)).toBe(true);
  });

  it('возвращает пустой log если у пользователя нет проекта', async () => {
    mockProject = null;

    const response = await GET();
    const body = (await response.json()) as { log: ProjectStatusLogEntry[] };

    expect(response.status).toBe(200);
    expect(body.log).toEqual([]);
  });

  it('log содержит записи из project_status_log', async () => {
    const response = await GET();
    const body = (await response.json()) as { log: ProjectStatusLogEntry[] };

    expect(body.log[0]).toMatchObject({
      id: 'log-1',
      old_status: null,
      new_status: 'submitted',
      changed_at: '2026-06-01T10:00:00Z',
    });
  });

  it('запрашивает записи с сортировкой changed_at ascending', async () => {
    await GET();

    expect(mockLogQuery.order).toHaveBeenCalledWith('changed_at', { ascending: true });
  });
});

describe('T69 StatusTimeline', () => {
  it('рендерится с пустым log', () => {
    const html = renderTimeline([]);

    expect(html).toContain('История изменений статуса пока пуста.');
  });

  it('рендерится с одной записью и показывает new_status', () => {
    const html = renderTimeline([mockEntry]);

    expect(html).toContain('Подано на проверку');
  });

  it('показывает old_status → new_status', () => {
    const html = renderTimeline([mockSecondEntry]);

    expect(html).toContain('Подано на проверку');
    expect(html).toContain('→');
    expect(html).toContain('На проверке');
  });

  it('показывает дату changed_at', () => {
    const html = renderTimeline([mockEntry]);

    expect(html).toContain('01.06.2026');
  });

  it('показывает порядковые номера записей', () => {
    const html = renderTimeline([mockEntry, mockSecondEntry]);

    expect(html).toContain('>1</span>');
    expect(html).toContain('>2</span>');
  });

  it('не показывает стрелку если old_status = null', () => {
    const html = renderTimeline([mockEntry]);

    expect(html).not.toContain('→');
  });

  it('неизвестный статус отображается как есть', () => {
    const html = renderTimeline([{ ...mockEntry, new_status: 'custom_status' }]);

    expect(html).toContain('custom_status');
  });

  it('approved получает green CSS-класс', () => {
    const html = renderTimeline([{ ...mockEntry, new_status: 'approved' }]);

    expect(html).toContain('bg-green-100 text-green-700');
  });
});

function renderTimeline(log: ProjectStatusLogEntry[]) {
  return renderToStaticMarkup(React.createElement(StatusTimeline, { log }));
}
