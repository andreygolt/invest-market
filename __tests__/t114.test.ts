// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/notifications');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return new Request(url.toString()) as import('next/server').NextRequest;
}

function makePatchRequest(id: string) {
  return new Request(`http://localhost/api/notifications/${id}`, {
    method: 'PATCH',
  });
}

// ─── Mock factory ────────────────────────────────────────────────────────────

type MockOptions = {
  authed?: boolean;
  notificationsData?: unknown[];
  findData?: { id: string } | null;
  updateError?: boolean;
  selectError?: boolean;
  updatedRows?: { id: string }[];
};

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

type CountResult = {
  count: number;
  error: null;
};

function makeThenable<T>(result: T) {
  return {
    then: jest.fn((resolve: (value: T) => void) => {
      resolve(result);
    }),
  };
}

/**
 * Builds a minimal Supabase client mock.
 * `notificationsData` — rows returned by the main notifications query
 * `findData`          — row returned by .maybeSingle() in PATCH [id]
 * `updateError`       — optional error for .update()
 * `selectError`       — optional error for the main GET query
 * `authed`            — whether auth.getUser returns a user (default true)
 */
function makeSupabaseMock(options?: MockOptions) {
  const authed = options?.authed ?? true;
  const notificationsData = options?.notificationsData ?? [];
  const findData = options?.findData !== undefined ? options.findData : { id: 'notif-1' };
  const updatedRows = options?.updatedRows ?? [{ id: 'notif-1' }];

  const selectResult: QueryResult<unknown[]> = {
    data: notificationsData,
    error: options?.selectError ? { message: 'db error' } : null,
  };
  const countResult: CountResult = { count: notificationsData.length, error: null };
  const updateResult: QueryResult<{ id: string }[]> = {
    data: updatedRows,
    error: options?.updateError ? { message: 'update error' } : null,
  };
  const patchUpdateResult = {
    error: options?.updateError ? { message: 'update error' } : null,
  };

  const rangeMock = jest.fn(async () => selectResult);
  const limitMock = jest.fn(async () => selectResult);
  const orderMock2 = jest.fn(() => ({ range: rangeMock, limit: limitMock }));
  const orderMock1 = jest.fn(() => ({ order: orderMock2 }));
  const listEqMock = jest.fn(() => ({ order: orderMock1, eq: listEqMock }));

  const countEqMock = jest.fn(() => ({
    eq: countEqMock,
    then: makeThenable(countResult).then,
  }));

  const updateSelectMock = jest.fn(async () => updateResult);
  const updateEqMock2 = jest.fn(() => ({
    select: updateSelectMock,
    then: makeThenable(patchUpdateResult).then,
  }));
  const updateEqMock1 = jest.fn(() => ({ eq: updateEqMock2 }));
  const updateMock = jest.fn(() => ({ eq: updateEqMock1 }));

  const maybeSingleMock = jest.fn(async () => ({
    data: findData,
    error: findData === null ? { message: 'not found' } : null,
  }));
  const findEqMock2 = jest.fn(() => ({ maybeSingle: maybeSingleMock }));
  const findEqMock1 = jest.fn(() => ({ eq: findEqMock2 }));

  const mockFrom = jest.fn((table: string) => {
    if (table !== 'notifications') return {};

    return {
      select: jest.fn((columns: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) return { eq: countEqMock };
        if (columns === 'id') return { eq: findEqMock1 };
        return { eq: listEqMock };
      }),
      update: updateMock,
    };
  });

  return {
    auth: {
      getUser: jest.fn(async () => ({
        data: { user: authed ? { id: 'user-1' } : null },
      })),
    },
    from: mockFrom,
  };
}

// ─── GET /api/notifications ─────────────────────────────────────────────────

describe('T114 GET /api/notifications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadGetRoute(options?: MockOptions) {
    jest.resetModules();
    const mockClient = makeSupabaseMock(options);
    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => mockClient),
    }));
    const { GET } = await import('@/app/api/notifications/route');
    return GET;
  }

  it('returns 401 when not authenticated', async () => {
    const GET = await loadGetRoute({ authed: false });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('returns 200 with notifications array on success', async () => {
    const GET = await loadGetRoute({
      notificationsData: [
        {
          id: 'n1',
          user_id: 'user-1',
          type: 'info',
          title: 'Test',
          body: 'Body',
          link: null,
          is_read: false,
          created_at: new Date().toISOString(),
        },
      ],
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = (await res.json()) as { notifications: unknown[] };
    expect(Array.isArray(json.notifications)).toBe(true);
  });

  it('returns pagination fields', async () => {
    const GET = await loadGetRoute({ notificationsData: [] });
    const res = await GET(makeGetRequest({ page: '2', per_page: '10' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { page: number; per_page: number; total_pages: number };
    expect(typeof json.page).toBe('number');
    expect(typeof json.per_page).toBe('number');
    expect(typeof json.total_pages).toBe('number');
  });

  it('returns unread_count field', async () => {
    const GET = await loadGetRoute({ notificationsData: [] });
    const res = await GET(makeGetRequest());
    const json = (await res.json()) as { unread_count: number };
    expect(typeof json.unread_count).toBe('number');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ selectError: true });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/notifications/read-all ───────────────────────────────────────

describe('T114 POST /api/notifications/read-all', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadReadAllRoute(options?: MockOptions) {
    jest.resetModules();
    const mockClient = makeSupabaseMock(options);
    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => mockClient),
    }));
    const { POST } = await import('@/app/api/notifications/read-all/route');
    return POST;
  }

  it('returns 401 when not authenticated', async () => {
    const POST = await loadReadAllRoute({ authed: false });
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it('returns ok:true with updated count on success', async () => {
    const POST = await loadReadAllRoute({ updatedRows: [{ id: 'n1' }, { id: 'n2' }] });
    const res = await POST();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; updated: number };
    expect(json.ok).toBe(true);
    expect(typeof json.updated).toBe('number');
  });

  it('returns 500 on database error', async () => {
    const POST = await loadReadAllRoute({ updateError: true });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/notifications/[id] ──────────────────────────────────────────

describe('T114 PATCH /api/notifications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadPatchRoute(options?: MockOptions) {
    jest.resetModules();
    const mockClient = makeSupabaseMock(options);
    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => mockClient),
    }));
    const { PATCH } = await import('@/app/api/notifications/[id]/route');
    return PATCH;
  }

  const params = Promise.resolve({ id: 'notif-1' });

  it('returns 401 when not authenticated', async () => {
    const PATCH = await loadPatchRoute({ authed: false });
    const res = await PATCH(makePatchRequest('notif-1'), { params });
    expect(res.status).toBe(401);
  });

  it('returns 404 when notification not found', async () => {
    const PATCH = await loadPatchRoute({ findData: null });
    const res = await PATCH(makePatchRequest('notif-1'), { params });
    expect(res.status).toBe(404);
  });

  it('returns ok:true on success', async () => {
    const PATCH = await loadPatchRoute({ findData: { id: 'notif-1' } });
    const res = await PATCH(makePatchRequest('notif-1'), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
