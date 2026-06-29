import { NextRequest } from 'next/server';

import { GET as GET_NOTIFICATIONS } from '@/app/api/notifications/route';
import type { NotificationRow, NotificationsResponse } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockServerFrom,
  })),
}));

type CountQuery = {
  count: number;
  error: null;
  select: jest.Mock;
  eq: jest.Mock;
};

type RangeQuery = {
  select: jest.Mock;
  eq: jest.Mock;
  order: jest.Mock;
  range: jest.Mock;
};

const notificationRows: NotificationRow[] = [
  {
    id: 'n1',
    user_id: 'user-1',
    type: 'project_approved',
    title: 'Test',
    body: 'Body',
    link: '/project',
    is_read: false,
    created_at: '2026-06-28T10:00:00Z',
  },
  {
    id: 'n2',
    user_id: 'user-1',
    type: 'project_rejected',
    title: 'Test2',
    body: 'Body2',
    link: null,
    is_read: true,
    created_at: '2026-06-28T11:00:00Z',
  },
];

function makeCountQuery(count: number): CountQuery {
  const query: CountQuery = {
    count,
    error: null,
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
  };
  return query;
}

function makeRangeQuery(rows: NotificationRow[]): RangeQuery {
  let filtered = rows;
  const query: RangeQuery = {
    select: jest.fn(() => query),
    eq: jest.fn((column: string, value: string | boolean) => {
      if (column === 'is_read') {
        filtered = filtered.filter((row) => row.is_read === value);
      }
      return query;
    }),
    order: jest.fn(() => query),
    range: jest.fn(async (from: number, to: number) => ({
      data: filtered.slice(from, to + 1),
      error: null,
    })),
  };
  return query;
}

function mockAuthenticatedRequest(options?: {
  unreadCount?: number;
  totalCount?: number;
  rows?: NotificationRow[];
}) {
  const unreadCountQuery = makeCountQuery(options?.unreadCount ?? 3);
  const totalCountQuery = makeCountQuery(options?.totalCount ?? 47);
  const rangeQuery = makeRangeQuery(options?.rows ?? notificationRows);

  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockServerFrom
    .mockReturnValueOnce(rangeQuery)
    .mockReturnValueOnce(unreadCountQuery)
    .mockReturnValueOnce(totalCountQuery)
    .mockReturnValueOnce(rangeQuery);

  return { unreadCountQuery, totalCountQuery, rangeQuery };
}

describe('T47 notifications history pagination', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
  });

  it('GET /api/notifications returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));

    expect(response.status).toBe(401);
  });

  it('GET /api/notifications returns notifications, unread_count, total_count, page, per_page, total_pages', async () => {
    mockAuthenticatedRequest();

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));
    const body = (await response.json()) as NotificationsResponse;

    expect(response.status).toBe(200);
    expect(body.notifications).toHaveLength(2);
    expect(body.unread_count).toBe(3);
    expect(body.total_count).toBe(47);
    expect(body.page).toBe(1);
    expect(body.per_page).toBe(20);
    expect(body.total_pages).toBe(3);
  });

  it('GET /api/notifications uses default page=1 and per_page=20', async () => {
    const { rangeQuery } = mockAuthenticatedRequest();

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));
    const body = (await response.json()) as NotificationsResponse;

    expect(body.page).toBe(1);
    expect(body.per_page).toBe(20);
    expect(rangeQuery.range).toHaveBeenCalledWith(0, 19);
  });

  it('GET /api/notifications page=2 uses offset=(page-1)*per_page', async () => {
    const { rangeQuery } = mockAuthenticatedRequest();

    await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications?page=2'));

    expect(rangeQuery.range).toHaveBeenCalledWith(20, 39);
  });

  it('GET /api/notifications limits per_page to 50', async () => {
    const { rangeQuery } = mockAuthenticatedRequest();

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?per_page=100')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.per_page).toBe(50);
    expect(rangeQuery.range).toHaveBeenCalledWith(0, 49);
  });

  it('GET /api/notifications unread_only=true filters unread notifications', async () => {
    const { totalCountQuery } = mockAuthenticatedRequest({ totalCount: 1 });

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?unread_only=true')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0]?.is_read).toBe(false);
    expect(totalCountQuery.eq).toHaveBeenCalledWith('is_read', false);
  });

  it('GET /api/notifications reads unread_count from a separate count query', async () => {
    mockAuthenticatedRequest({
      unreadCount: 3,
      rows: [notificationRows[0]],
    });

    const response = await GET_NOTIFICATIONS(new NextRequest('http://localhost/api/notifications'));
    const body = (await response.json()) as NotificationsResponse;

    expect(body.notifications.filter((notification) => !notification.is_read)).toHaveLength(1);
    expect(body.unread_count).toBe(3);
  });

  it('GET /api/notifications calculates total_pages as ceil(total_count / per_page)', async () => {
    mockAuthenticatedRequest({ totalCount: 21 });

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?per_page=10')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.total_pages).toBe(3);
  });

  it('GET /api/notifications per_page=5 returns max 5 elements', async () => {
    const rows = Array.from({ length: 8 }, (_, index) => ({
      ...notificationRows[index % notificationRows.length],
      id: `n-${index}`,
    }));
    const { rangeQuery } = mockAuthenticatedRequest({ rows, totalCount: 8 });

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?per_page=5')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.notifications).toHaveLength(5);
    expect(rangeQuery.range).toHaveBeenCalledWith(0, 4);
  });

  it('NotificationsResponse type contains total_count, page, per_page, total_pages', () => {
    const response: NotificationsResponse = {
      notifications: [],
      unread_count: 0,
      total_count: 0,
      page: 1,
      per_page: 20,
      total_pages: 0,
    };

    expect(response).toHaveProperty('total_count');
    expect(response).toHaveProperty('page');
    expect(response).toHaveProperty('per_page');
    expect(response).toHaveProperty('total_pages');
  });

  it('GET /api/notifications defaults invalid page to page=1', async () => {
    const { rangeQuery } = mockAuthenticatedRequest();

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?page=bad')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.page).toBe(1);
    expect(rangeQuery.range).toHaveBeenCalledWith(0, 19);
  });

  it('GET /api/notifications defaults invalid per_page to per_page=20', async () => {
    const { rangeQuery } = mockAuthenticatedRequest();

    const response = await GET_NOTIFICATIONS(
      new NextRequest('http://localhost/api/notifications?per_page=bad')
    );
    const body = (await response.json()) as NotificationsResponse;

    expect(body.per_page).toBe(20);
    expect(rangeQuery.range).toHaveBeenCalledWith(0, 19);
  });
});
