# T114 — Тесты для API уведомлений

## Цель

Три API-маршрута уведомлений созданы в предыдущих задачах, но тестов не имеют:

- `GET /api/notifications` — список уведомлений с пагинацией и фильтром `unread_only`
- `POST /api/notifications/read-all` — отметить все уведомления прочитанными
- `PATCH /api/notifications/[id]` — отметить одно уведомление прочитанным

Нужно создать `__tests__/t114.test.ts` с тестами для всех трёх маршрутов.

---

## Контекст

Файлы маршрутов (не трогать — только тестируем):

- `app/api/notifications/route.ts` — GET
- `app/api/notifications/read-all/route.ts` — POST
- `app/api/notifications/[id]/route.ts` — PATCH

Все три используют `createClient` из `@/lib/supabase/server`.
GET дополнительно читает `?unread_only=true`, `?page=`, `?per_page=`.

---

## Создать `__tests__/t114.test.ts`

```typescript
// __tests__/t114.test.ts

// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/notifications');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString()) as import('next/server').NextRequest;
}

function makePatchRequest(id: string) {
  return new Request(`http://localhost/api/notifications/${id}`, {
    method: 'PATCH',
  }) as unknown as Request;
}

// ─── Mock factory ────────────────────────────────────────────────────────────

/**
 * Builds a minimal Supabase client mock.
 * `notificationsData`  — rows returned by the main notifications query
 * `findData`           — row returned by .maybeSingle() in PATCH [id]
 * `updateError`        — optional error for .update()
 * `selectError`        — optional error for the main GET query
 * `authed`             — whether auth.getUser returns a user (default true)
 */
function makeSupabaseMock(options?: {
  authed?: boolean;
  notificationsData?: unknown[];
  findData?: { id: string } | null;
  updateError?: boolean;
  selectError?: boolean;
  updatedRows?: { id: string }[];
}) {
  const authed = options?.authed ?? true;
  const notificationsData = options?.notificationsData ?? [];
  const findData = options?.findData !== undefined ? options.findData : { id: 'notif-1' };
  const updatedRows = options?.updatedRows ?? [{ id: 'notif-1' }];

  // Chain for GET /api/notifications main query
  const rangeMock = jest.fn(async () => ({
    data: notificationsData,
    error: options?.selectError ? { message: 'db error' } : null,
  }));
  const limitMock = jest.fn(async () => ({
    data: notificationsData,
    error: options?.selectError ? { message: 'db error' } : null,
  }));
  const orderMock2 = jest.fn(() => ({ range: rangeMock, limit: limitMock }));
  const orderMock1 = jest.fn(() => ({ order: orderMock2 }));
  const eqMock = jest.fn(() => ({ order: orderMock1, eq: eqMock }));
  const selectMock = jest.fn(() => ({ eq: eqMock }));

  // Chain for count queries
  const countHeadMock = jest.fn(async () => ({ count: notificationsData.length, error: null }));
  const countEqMock = jest.fn(() => ({ eq: countEqMock, then: countHeadMock }));
  // Supabase select with head:true returns a thenable
  const countSelectMock = jest.fn(() => ({ eq: countEqMock }));

  // Chain for POST /api/notifications/read-all — update
  const updateSelectMock = jest.fn(async () => ({
    data: updatedRows,
    error: options?.updateError ? { message: 'update error' } : null,
  }));
  const updateEqMock2 = jest.fn(() => ({ select: updateSelectMock }));
  const updateEqMock1 = jest.fn(() => ({ eq: updateEqMock2 }));
  const updateMock = jest.fn(() => ({ eq: updateEqMock1 }));

  // Chain for PATCH /api/notifications/[id] — find then update
  const maybeSingleMock = jest.fn(async () => ({
    data: findData,
    error: findData === null ? { message: 'not found' } : null,
  }));
  const findEqMock2 = jest.fn(() => ({ maybeSingle: maybeSingleMock }));
  const findEqMock1 = jest.fn(() => ({ eq: findEqMock2 }));
  const findSelectMock = jest.fn(() => ({ eq: findEqMock1 }));

  // PATCH update chain (after find succeeds)
  const patchUpdateResolveMock = jest.fn(async () => ({
    error: options?.updateError ? { message: 'update error' } : null,
  }));
  const patchUpdateEqMock2 = jest.fn(() => ({ then: patchUpdateResolveMock }));
  const patchUpdateEqMock1 = jest.fn(() => ({ eq: patchUpdateEqMock2 }));
  const patchUpdateMock = jest.fn(() => ({ eq: patchUpdateEqMock1 }));

  let updateCallCount = 0;

  const mockFrom = jest.fn((table: string) => {
    if (table === 'notifications') {
      return {
        select: jest.fn((cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) return { eq: countEqMock };
          if (cols === 'id') return { eq: findEqMock1 };
          return { eq: eqMock };
        }),
        update: jest.fn(() => {
          updateCallCount += 1;
          // first update call = read-all or PATCH [id] first update
          // distinguish by context — use updateCallCount
          if (updateCallCount === 1) return { eq: updateEqMock1 };
          return { eq: patchUpdateEqMock1 };
        }),
      };
    }
    return {};
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

// ─── GET /api/notifications ──────────────────────────────────────────────────

describe('T114 GET /api/notifications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadGetRoute(options?: Parameters<typeof makeSupabaseMock>[0]) {
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
        { id: 'n1', user_id: 'user-1', type: 'info', title: 'Test', body: 'Body', link: null, is_read: false, created_at: new Date().toISOString() },
      ],
    });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json() as { notifications: unknown[] };
    expect(Array.isArray(json.notifications)).toBe(true);
  });

  it('returns pagination fields', async () => {
    const GET = await loadGetRoute({ notificationsData: [] });
    const res = await GET(makeGetRequest({ page: '2', per_page: '10' }));
    expect(res.status).toBe(200);
    const json = await res.json() as { page: number; per_page: number; total_pages: number };
    expect(typeof json.page).toBe('number');
    expect(typeof json.per_page).toBe('number');
    expect(typeof json.total_pages).toBe('number');
  });

  it('returns unread_count field', async () => {
    const GET = await loadGetRoute({ notificationsData: [] });
    const res = await GET(makeGetRequest());
    const json = await res.json() as { unread_count: number };
    expect(typeof json.unread_count).toBe('number');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ selectError: true });
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/notifications/read-all ────────────────────────────────────────

describe('T114 POST /api/notifications/read-all', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadReadAllRoute(options?: Parameters<typeof makeSupabaseMock>[0]) {
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
    const json = await res.json() as { ok: boolean; updated: number };
    expect(json.ok).toBe(true);
    expect(typeof json.updated).toBe('number');
  });

  it('returns 500 on database error', async () => {
    const POST = await loadReadAllRoute({ updateError: true });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/notifications/[id] ───────────────────────────────────────────

describe('T114 PATCH /api/notifications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadPatchRoute(options?: Parameters<typeof makeSupabaseMock>[0]) {
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
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
```

---

## Ограничения

- НЕ трогать `app/api/notifications/route.ts` — только тестируем
- НЕ трогать `app/api/notifications/read-all/route.ts` — только тестируем
- НЕ трогать `app/api/notifications/[id]/route.ts` — только тестируем
- НЕ трогать `types/index.ts`, `middleware.ts`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t114.test.ts` | СОЗДАТЬ — тесты для трёх маршрутов уведомлений |

---

## Команды проверки

```bash
cd invest_market
npm run build
npm run lint
npm test
```

---

## Критерии готовности

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — новые тесты проходят (минимум 11 тестов в t114)
4. Существующие тесты (~97 тестов) не сломаны
5. Записать в progress.md: `DONE: T114` + что создано

---

## Формат отчёта

```
DONE: T114
- создан __tests__/t114.test.ts: 11 тестов для GET /api/notifications, POST /api/notifications/read-all, PATCH /api/notifications/[id]
```
