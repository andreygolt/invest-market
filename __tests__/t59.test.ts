import * as React from 'react';

import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';
import { NotificationBell } from '@/components/notifications/notification-bell';

const mockRemoveChannel = jest.fn();
const mockSubscription = { unsubscribe: jest.fn() };
const mockSubscribe = jest.fn(() => mockSubscription);
const mockSelect = jest.fn();
const mockClientFrom = jest.fn(() => ({ select: mockSelect }));
const mockCreateBrowserClient = jest.fn();
let mockInsertCallback: (() => void) | null = null;
let mockCleanup: (() => void) | void;

const mockOn = jest.fn(
  (
    _event: string,
    filter: { event?: string },
    cb: (() => void) | (() => Promise<void>)
  ) => {
    if (filter?.event === 'INSERT') {
      mockInsertCallback = cb as () => void;
    }

    return { on: mockOn, subscribe: mockSubscribe };
  }
);
const mockChannel = jest.fn(() => ({ on: mockOn, subscribe: mockSubscribe }));

const mockCreateServerClient = jest.fn();
const mockUseState = React.useState as jest.Mock;

jest.mock('react', () => {
  const actual = jest.requireActual<typeof React>('react');
  return {
    ...actual,
    useEffect: jest.fn((effect: () => (() => void) | void) => {
      mockCleanup = effect();
    }),
    useState: jest.fn(),
  };
});

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    className,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
  }) => React.createElement('a', { className, href }, children),
}));

jest.mock('@/lib/supabase/client', () => ({
  createClient: () => mockCreateBrowserClient(),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateServerClient(),
}));

type SupabaseQuery = {
  eq: jest.Mock<SupabaseQuery, [string, string | boolean]>;
};

function makeCountQuery(count: number | null, error: { message: string } | null = null) {
  const query = {
    count,
    error,
    eq: jest.fn(() => query),
  };
  return query;
}

function makeSupabaseServer(user: { id: string } | null, query = makeCountQuery(0)) {
  return {
    auth: {
      getUser: jest.fn(async () => ({ data: { user } })),
    },
    from: jest.fn(() => ({
      select: jest.fn(() => query),
    })),
  };
}

function setupBrowserClient() {
  const updateCountQuery: SupabaseQuery & { count: number; error: null } = {
    count: 0,
    error: null,
    eq: jest.fn(() => updateCountQuery),
  };
  mockSelect.mockReturnValue(updateCountQuery);
  mockCreateBrowserClient.mockReturnValue({
    channel: mockChannel,
    from: mockClientFrom,
    removeChannel: mockRemoveChannel,
  });
}

function renderComponent(initialUnread: number) {
  const setUnread = jest.fn();
  mockUseState.mockReturnValue([initialUnread, setUnread]);
  return NotificationBell({ initialUnread, userId: 'user-1' });
}

function resolveElement(node: React.ReactNode): React.ReactNode {
  if (!React.isValidElement(node)) return node;

  if (typeof node.type === 'function') {
    return resolveElement(
      node.type(node.props as { children?: React.ReactNode }) as React.ReactNode
    );
  }

  const props = node.props as { children?: React.ReactNode };
  return {
    ...node,
    props: {
      ...props,
      children: React.Children.map(props.children, resolveElement),
    },
  } as React.ReactElement;
}

function textContent(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (!React.isValidElement(node)) return '';

  const props = node.props as { children?: React.ReactNode };
  return textContent(props.children);
}

describe('T59 getUnreadCount', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 0 without user', async () => {
    mockCreateServerClient.mockResolvedValue(makeSupabaseServer(null));

    await expect(getUnreadCount()).resolves.toBe(0);
  });

  it('returns 0 on DB error', async () => {
    mockCreateServerClient.mockResolvedValue(
      makeSupabaseServer({ id: 'user-1' }, makeCountQuery(null, { message: 'db error' }))
    );

    await expect(getUnreadCount()).resolves.toBe(0);
  });

  it('returns unread count for authenticated user', async () => {
    const query = makeCountQuery(7);
    const supabase = makeSupabaseServer({ id: 'user-1' }, query);
    mockCreateServerClient.mockResolvedValue(supabase);

    await expect(getUnreadCount()).resolves.toBe(7);
    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.eq).toHaveBeenCalledWith('is_read', false);
  });
});

describe('T59 getCurrentUserId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null without session', async () => {
    mockCreateServerClient.mockResolvedValue(makeSupabaseServer(null));

    await expect(getCurrentUserId()).resolves.toBeNull();
  });

  it('returns user id with session', async () => {
    mockCreateServerClient.mockResolvedValue(makeSupabaseServer({ id: 'user-1' }));

    await expect(getCurrentUserId()).resolves.toBe('user-1');
  });
});

describe('T59 NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInsertCallback = null;
    mockCleanup = undefined;
    setupBrowserClient();
  });

  it('renders without badge for initialUnread=0', () => {
    const element = resolveElement(renderComponent(0));

    expect(textContent(element)).not.toContain('0');
  });

  it('renders badge for initialUnread=3', () => {
    const element = resolveElement(renderComponent(3));

    expect(textContent(element)).toContain('3');
  });

  it('renders 99+ for initialUnread=100', () => {
    const element = resolveElement(renderComponent(100));

    expect(textContent(element)).toContain('99+');
  });

  it('renders 99+ for initialUnread=999', () => {
    const element = resolveElement(renderComponent(999));

    expect(textContent(element)).toContain('99+');
  });

  it('subscribes to Supabase Realtime on mount', () => {
    renderComponent(0);

    expect(mockChannel).toHaveBeenCalledWith('notifications:user-1');
    expect(mockOn).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: 'user_id=eq.user-1',
      }),
      expect.any(Function)
    );
    expect(mockSubscribe).toHaveBeenCalled();
  });

  it('removes Supabase Realtime channel on unmount', () => {
    renderComponent(0);
    expect(typeof mockCleanup).toBe('function');

    (mockCleanup as () => void)();

    expect(mockRemoveChannel).toHaveBeenCalledWith(mockSubscription);
  });

  it('increments unread counter by 1 on INSERT event', () => {
    let unread = 3;
    mockUseState.mockReturnValue([
      unread,
      (value: React.SetStateAction<number>) => {
        unread = typeof value === 'function' ? value(unread) : value;
      },
    ]);

    NotificationBell({ initialUnread: 3, userId: 'user-1' });
    mockInsertCallback?.();

    expect(unread).toBe(4);
  });
});
