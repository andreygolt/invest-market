# T115 — Тесты для API заявок инвестора

## Цель

Четыре маршрута заявок инвестора не имеют покрытия тестами:

- `GET /api/investor/applications` — список заявок инвестора
- `POST /api/investor/applications` — создать заявку
- `GET /api/investor/applications/[id]` — одна заявка (добавлен в T112)
- `DELETE /api/investor/applications/[id]` — отозвать заявку (pending → withdrawn)

Нужно создать `__tests__/t115.test.ts` с тестами для всех четырёх маршрутов.

---

## Контекст

Файлы маршрутов (не трогать — только тестируем):

- `app/api/investor/applications/route.ts` — GET + POST (используют `createAdminClient`)
- `app/api/investor/applications/[id]/route.ts` — GET + DELETE (используют `createAdminClient`)

Зависимости, которые надо замокать:
- `@/lib/supabase/admin` → `createAdminClient`
- `@/lib/notifications/notify-managers` → `notifyManagers` (POST)
- `@/lib/notifications/notify-managers-new-application` → `notifyManagersNewApplication` (POST)
- `@/lib/notifications/notify-application-withdrawn` → `notifyApplicationWithdrawn` (DELETE)

---

## Создать `__tests__/t115.test.ts`

```typescript
// __tests__/t115.test.ts

// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/investor/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makeDeleteRequest(id: string, investorId: string) {
  return new Request(
    `http://localhost/api/investor/applications/${id}?investor_id=${investorId}`,
    { method: 'DELETE' }
  ) as import('next/server').NextRequest;
}

// ─── Notification mocks (fire-and-forget) ────────────────────────────────────

jest.mock('@/lib/notifications/notify-managers', () => ({
  notifyManagers: jest.fn(async () => {}),
}));

jest.mock('@/lib/notifications/notify-managers-new-application', () => ({
  notifyManagersNewApplication: jest.fn(async () => {}),
}));

jest.mock('@/lib/notifications/notify-application-withdrawn', () => ({
  notifyApplicationWithdrawn: jest.fn(async () => {}),
}));

// ─── GET /api/investor/applications ─────────────────────────────────────────

describe('T115 GET /api/investor/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadGetRoute(options?: {
    data?: unknown[];
    error?: boolean;
  }) {
    jest.resetModules();

    const orderMock = jest.fn(async () => ({
      data: options?.data ?? [],
      error: options?.error ? { message: 'db error' } : null,
    }));
    const eqMock = jest.fn(() => ({ order: orderMock }));
    const selectMock = jest.fn(() => ({ eq: eqMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({ select: selectMock })),
      })),
    }));

    const { GET } = await import('@/app/api/investor/applications/route');
    return GET;
  }

  it('returns 400 when investor_id is missing', async () => {
    const GET = await loadGetRoute();
    const res = await GET(makeGetRequest('http://localhost/api/investor/applications'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty array', async () => {
    const GET = await loadGetRoute({ data: [] });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { applications: unknown[] };
    expect(Array.isArray(json.applications)).toBe(true);
    expect(json.applications.length).toBe(0);
  });

  it('returns 200 with mapped applications', async () => {
    const row = {
      id: 'app-1',
      project_id: 'proj-1',
      amount: 500000,
      status: 'pending',
      message: 'Интересный проект',
      rejection_reason: null,
      created_at: '2026-06-29T10:00:00Z',
      updated_at: '2026-06-29T10:00:00Z',
      projects: { name: 'Test Project' },
    };
    const GET = await loadGetRoute({ data: [row] });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { applications: { project_name: string }[] };
    expect(json.applications[0].project_name).toBe('Test Project');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ error: true });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/investor/applications ─────────────────────────────────────────

describe('T115 POST /api/investor/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  const VALID_BODY = {
    investor_id: 'investor-1',
    project_id: 'proj-1',
    message: 'Хочу инвестировать в ваш проект',
    amount: 1000000,
  };

  async function loadPostRoute(options?: {
    projectFound?: boolean;
    duplicateFound?: boolean;
    insertError?: boolean;
    insertedId?: string;
  }) {
    jest.resetModules();

    const projectFound = options?.projectFound ?? true;
    const duplicateFound = options?.duplicateFound ?? false;
    const insertedId = options?.insertedId ?? 'app-new';

    // project lookup mock
    const projectMaybeSingle = jest.fn(async () => ({
      data: projectFound
        ? { id: 'proj-1', name: 'Test Project', status: 'approved', owner_id: 'owner-1' }
        : null,
      error: null,
    }));
    const projectEqStatus = jest.fn(() => ({ maybeSingle: projectMaybeSingle }));
    const projectEqId = jest.fn(() => ({ eq: projectEqStatus }));
    const projectSelect = jest.fn(() => ({ eq: projectEqId }));

    // duplicate check mock
    const dupMaybeSingle = jest.fn(async () => ({
      data: duplicateFound ? { id: 'app-existing', status: 'pending' } : null,
      error: null,
    }));
    const dupIn = jest.fn(() => ({ maybeSingle: dupMaybeSingle }));
    const dupEqProject = jest.fn(() => ({ in: dupIn }));
    const dupEqInvestor = jest.fn(() => ({ eq: dupEqProject }));
    const dupSelect = jest.fn(() => ({ eq: dupEqInvestor }));

    // insert mock
    const insertSingle = jest.fn(async () => ({
      data: options?.insertError
        ? null
        : {
            id: insertedId,
            project_id: 'proj-1',
            amount: 1000000,
            status: 'pending',
            message: VALID_BODY.message,
            created_at: '2026-06-29T10:00:00Z',
            updated_at: '2026-06-29T10:00:00Z',
          },
      error: options?.insertError ? { message: 'insert error' } : null,
    }));
    const insertSelectMock = jest.fn(() => ({ single: insertSingle }));
    const insertMock = jest.fn(() => ({ select: insertSelectMock }));

    // notifications insert (fire-and-forget, always succeeds)
    const notifInsert = jest.fn(async () => ({ error: null }));

    let projectCallCount = 0;
    let appCallCount = 0;

    const mockFrom = jest.fn((table: string) => {
      if (table === 'projects') {
        projectCallCount += 1;
        return { select: projectSelect };
      }
      if (table === 'applications') {
        appCallCount += 1;
        if (appCallCount === 1) return { select: dupSelect };
        return { insert: insertMock };
      }
      if (table === 'notifications') {
        return { insert: notifInsert };
      }
      return {};
    });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({ from: mockFrom })),
    }));

    const { POST } = await import('@/app/api/investor/applications/route');
    return { POST, mockFrom };
  }

  it('returns 400 when investor_id is missing', async () => {
    const { POST } = await loadPostRoute();
    const res = await POST(makePostRequest({ project_id: 'p1', message: 'hello' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing', async () => {
    const { POST } = await loadPostRoute();
    const res = await POST(makePostRequest({ investor_id: 'u1', project_id: 'p1' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    const { POST } = await loadPostRoute({ projectFound: false });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 409 when duplicate active application exists', async () => {
    const { POST } = await loadPostRoute({ duplicateFound: true });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('returns 500 on insert error', async () => {
    const { POST } = await loadPostRoute({ insertError: true });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('returns 201 with ApplicationDetail on success', async () => {
    const { POST } = await loadPostRoute({ insertedId: 'app-new-123' });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json() as { id: string; status: string };
    expect(json.id).toBe('app-new-123');
    expect(json.status).toBe('pending');
  });
});

// ─── GET /api/investor/applications/[id] ─────────────────────────────────────

describe('T115 GET /api/investor/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadGetIdRoute(options?: {
    data?: Record<string, unknown> | null;
    dbError?: boolean;
  }) {
    jest.resetModules();

    const found = options?.data !== undefined ? options.data : {
      id: 'app-1',
      project_id: 'proj-1',
      amount: 500000,
      status: 'pending',
      message: 'Интерес',
      rejection_reason: null,
      created_at: '2026-06-29T10:00:00Z',
      updated_at: '2026-06-29T10:00:00Z',
      projects: { name: 'My Project' },
    };

    const maybeSingle = jest.fn(async () => ({
      data: found,
      error: options?.dbError ? { message: 'db error' } : null,
    }));
    const eqInvestor = jest.fn(() => ({ maybeSingle }));
    const eqId = jest.fn(() => ({ eq: eqInvestor }));
    const selectMock = jest.fn(() => ({ eq: eqId }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({ select: selectMock })),
      })),
    }));

    const { GET } = await import('@/app/api/investor/applications/[id]/route');
    return GET;
  }

  const params = Promise.resolve({ id: 'app-1' });

  it('returns 400 when investor_id is missing', async () => {
    const GET = await loadGetIdRoute();
    const req = makeGetRequest('http://localhost/api/investor/applications/app-1');
    const res = await GET(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    const GET = await loadGetIdRoute({ data: null });
    const req = makeGetRequest(
      'http://localhost/api/investor/applications/app-1?investor_id=user-1'
    );
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetIdRoute({ dbError: true });
    const req = makeGetRequest(
      'http://localhost/api/investor/applications/app-1?investor_id=user-1'
    );
    const res = await GET(req, { params });
    expect(res.status).toBe(500);
  });

  it('returns 200 with ApplicationDetail on success', async () => {
    const GET = await loadGetIdRoute();
    const req = makeGetRequest(
      'http://localhost/api/investor/applications/app-1?investor_id=user-1'
    );
    const res = await GET(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { id: string; project_name: string };
    expect(json.id).toBe('app-1');
    expect(json.project_name).toBe('My Project');
  });
});

// ─── DELETE /api/investor/applications/[id] ───────────────────────────────────

describe('T115 DELETE /api/investor/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadDeleteRoute(options?: {
    appData?: {
      id: string;
      status: string;
      investor_id: string;
      project_id: string;
    } | null;
    updateError?: boolean;
  }) {
    jest.resetModules();

    const appData =
      options?.appData !== undefined
        ? options.appData
        : {
            id: 'app-1',
            status: 'pending',
            investor_id: 'investor-1',
            project_id: 'proj-1',
          };

    // find app chain
    const findMaybeSingle = jest.fn(async () => ({
      data: appData,
      error: null,
    }));
    const findEq = jest.fn(() => ({ maybeSingle: findMaybeSingle }));
    const findSelect = jest.fn(() => ({ eq: findEq }));

    // update chain
    const updateEq = jest.fn(async () => ({
      error: options?.updateError ? { message: 'update error' } : null,
    }));
    const updateMock = jest.fn(() => ({ eq: updateEq }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: findSelect,
              update: updateMock,
            };
          }
          return {};
        }),
      })),
    }));

    const { DELETE } = await import('@/app/api/investor/applications/[id]/route');
    return DELETE;
  }

  const params = Promise.resolve({ id: 'app-1' });

  it('returns 400 when investor_id is missing', async () => {
    const DELETE = await loadDeleteRoute();
    const req = makeDeleteRequest('app-1', '');
    // Rebuild request without investor_id
    const reqNoId = new Request(
      'http://localhost/api/investor/applications/app-1',
      { method: 'DELETE' }
    ) as import('next/server').NextRequest;
    const res = await DELETE(reqNoId, { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    const DELETE = await loadDeleteRoute({ appData: null });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when investor_id does not match', async () => {
    const DELETE = await loadDeleteRoute({
      appData: { id: 'app-1', status: 'pending', investor_id: 'other-user', project_id: 'proj-1' },
    });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(403);
  });

  it('returns 400 when status is not pending', async () => {
    const DELETE = await loadDeleteRoute({
      appData: { id: 'app-1', status: 'approved', investor_id: 'investor-1', project_id: 'proj-1' },
    });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(400);
  });

  it('returns 500 on update error', async () => {
    const DELETE = await loadDeleteRoute({ updateError: true });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(500);
  });

  it('returns ok:true on success', async () => {
    const DELETE = await loadDeleteRoute();
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
```

---

## Ограничения

- НЕ трогать `app/api/investor/applications/route.ts` — только тестируем
- НЕ трогать `app/api/investor/applications/[id]/route.ts` — только тестируем
- НЕ трогать `types/index.ts`, `middleware.ts`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t115.test.ts` | СОЗДАТЬ — тесты для четырёх маршрутов заявок инвестора |

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
3. `npm test` — новые тесты проходят (минимум 18 тестов в t115)
4. Существующие тесты (~108 тестов) не сломаны
5. Записать в progress.md: `DONE: T115` + что создано

---

## Формат отчёта

```
DONE: T115
- создан __tests__/t115.test.ts: 18 тестов для GET /api/investor/applications, POST /api/investor/applications, GET /api/investor/applications/[id], DELETE /api/investor/applications/[id]
```
