# T119 — Тесты для API заявок инвестора

**Дата:** 2026-06-29
**Текущее кол-во тестов:** ~179 (t1–t80, t113–t118)
**Размер задачи:** M
**Зависимости:** T118 (паттерны моков), T112 (маршруты уже созданы)

---

## Зачем это нужно

Заявки — центральный бизнес-процесс платформы: инвестор находит проект в каталоге и отправляет заявку, которую затем обрабатывает менеджер. Четыре маршрута этого флоу (GET список, POST создание, GET одиночная, DELETE отзыв) реализованы в T112, но не покрыты тестами.

Без тестов невозможно гарантировать, что: проверка дубликата заявки работает, статусные переходы при отзыве корректны, нотификации вызываются без краша, и response-схема соответствует типу `ApplicationDetail`. T119 закрывает этот пробел, добавив ~19 тестов для всех четырёх маршрутов.

---

## Что НЕ делаем в этом этапе

- Не трогаем `app/api/investor/applications/route.ts` — только тестируем
- Не трогаем `app/api/investor/applications/[id]/route.ts` — только тестируем
- Не пишем тесты для admin/applications или manager/applications (это отдельная задача)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/investor/applications/route.ts` — GET + POST

**GET** `/api/investor/applications?investor_id=xxx`
- Обязателен `investor_id` → 400 если отсутствует
- Запрашивает таблицу `applications` с join `projects(name)`
- Фильтрует по `investor_id`, сортирует по `created_at DESC`
- Возвращает `{ applications: ApplicationDetail[] }`

**POST** `/api/investor/applications`
Body: `{ investor_id, project_id, amount?, message }`
- 400 если нет `investor_id`, `project_id`, или пустой `message`
- Проверяет, что проект существует и имеет `status = 'approved'` → 404 если нет
- Проверяет дубликат: активная заявка (`status IN ('pending','reviewing')`) → 409
- INSERT в `applications`, затем fire-and-forget нотификации:
  - `supabase.from('notifications').insert(...)` для owner проекта
  - `notifyManagersNewApplication(...)` из `@/lib/notifications/notify-managers-new-application`
  - `notifyManagers(...)` из `@/lib/notifications/notify-managers`
- Возвращает `ApplicationDetail` со статусом 201

### `app/api/investor/applications/[id]/route.ts` — GET + DELETE

**GET** `/api/investor/applications/[id]?investor_id=xxx`
- 400 если нет `investor_id`
- Ищет заявку по `id` + `investor_id` → 404 если не найдена
- Возвращает `ApplicationDetail`

**DELETE** `/api/investor/applications/[id]?investor_id=xxx`
- 400 если нет `investor_id`
- Ищет запись по `id` → 404 если не найдена
- Проверяет `app.investor_id === investor_id` → 403 если нет
- Проверяет `app.status === 'pending'` → 400 если другой статус
- UPDATE `status = 'withdrawn'`
- Вызывает `notifyApplicationWithdrawn(...)` из `@/lib/notifications/notify-application-withdrawn`
- Возвращает `{ ok: true }`

---

## Создать `__tests__/t119.test.ts`

```typescript
// __tests__/t119.test.ts

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

function makeDeleteRequest(id: string, investorId?: string) {
  const url = investorId
    ? `http://localhost/api/investor/applications/${id}?investor_id=${investorId}`
    : `http://localhost/api/investor/applications/${id}`;
  return new Request(url, { method: 'DELETE' }) as import('next/server').NextRequest;
}

function makeGetByIdRequest(id: string, investorId?: string) {
  const url = investorId
    ? `http://localhost/api/investor/applications/${id}?investor_id=${investorId}`
    : `http://localhost/api/investor/applications/${id}`;
  return new Request(url) as import('next/server').NextRequest;
}

// ─── GET /api/investor/applications ─────────────────────────────────────────

describe('T119 GET /api/investor/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-managers');
    jest.dontMock('@/lib/notifications/notify-managers-new-application');
  });

  async function loadGetRoute(options?: {
    data?: unknown[];
    dbError?: boolean;
  }) {
    jest.resetModules();

    const rows = options?.data ?? [];

    const orderMock = jest.fn(async () => ({
      data: rows,
      error: options?.dbError ? { message: 'db error' } : null,
    }));
    const eqInvestorMock = jest.fn(() => ({ order: orderMock }));
    const selectMock = jest.fn(() => ({ eq: eqInvestorMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({ select: selectMock })),
      })),
    }));

    jest.doMock('@/lib/notifications/notify-managers', () => ({
      notifyManagers: jest.fn(async () => {}),
    }));
    jest.doMock('@/lib/notifications/notify-managers-new-application', () => ({
      notifyManagersNewApplication: jest.fn(async () => {}),
    }));

    const { GET } = await import('@/app/api/investor/applications/route');
    return GET;
  }

  it('returns 400 when investor_id is missing', async () => {
    const GET = await loadGetRoute();
    const res = await GET(makeGetRequest('http://localhost/api/investor/applications'));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBeTruthy();
  });

  it('returns 200 with empty applications array', async () => {
    const GET = await loadGetRoute({ data: [] });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { applications: unknown[] };
    expect(Array.isArray(json.applications)).toBe(true);
    expect(json.applications.length).toBe(0);
  });

  it('returns 200 with mapped applications including project_name', async () => {
    const rows = [
      {
        id: 'app-1',
        project_id: 'proj-1',
        amount: 500000,
        status: 'pending',
        message: 'Хочу инвестировать',
        rejection_reason: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        projects: { name: 'Tech Fund' },
      },
    ];
    const GET = await loadGetRoute({ data: rows });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = await res.json() as {
      applications: {
        id: string;
        project_name: string;
        amount: number | null;
        status: string;
      }[];
    };
    expect(json.applications.length).toBe(1);
    expect(json.applications[0].id).toBe('app-1');
    expect(json.applications[0].project_name).toBe('Tech Fund');
    expect(json.applications[0].amount).toBe(500000);
    expect(json.applications[0].status).toBe('pending');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ dbError: true });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/applications?investor_id=user-1')
    );
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/investor/applications ─────────────────────────────────────────

describe('T119 POST /api/investor/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-managers');
    jest.dontMock('@/lib/notifications/notify-managers-new-application');
    jest.dontMock('@/lib/notifications/notify-application-withdrawn');
  });

  const VALID_BODY = {
    investor_id: 'investor-1',
    project_id: 'proj-1',
    amount: 500000,
    message: 'Хочу участвовать',
  };

  async function loadPostRoute(options?: {
    projectFound?: boolean;
    duplicateFound?: boolean;
    insertError?: boolean;
    insertedData?: Record<string, unknown>;
  }) {
    jest.resetModules();

    const projectFound = options?.projectFound ?? true;
    const duplicateFound = options?.duplicateFound ?? false;

    const insertedApp = options?.insertedData ?? {
      id: 'app-new',
      project_id: 'proj-1',
      amount: 500000,
      status: 'pending',
      message: 'Хочу участвовать',
      created_at: '2026-06-29T10:00:00Z',
      updated_at: '2026-06-29T10:00:00Z',
    };

    // projects mock
    const projectMaybeSingle = jest.fn(async () => ({
      data: projectFound
        ? { id: 'proj-1', name: 'Tech Fund', status: 'approved', owner_id: 'owner-1' }
        : null,
      error: null,
    }));
    const projectEqStatus = jest.fn(() => ({ maybeSingle: projectMaybeSingle }));
    const projectEqId = jest.fn(() => ({ eq: projectEqStatus }));
    const projectSelect = jest.fn(() => ({ eq: projectEqId }));

    // duplicate check mock
    const dupMaybeSingle = jest.fn(async () => ({
      data: duplicateFound ? { id: 'app-old', status: 'pending' } : null,
      error: null,
    }));
    const dupIn = jest.fn(() => ({ maybeSingle: dupMaybeSingle }));
    const dupEqProject = jest.fn(() => ({ in: dupIn }));
    const dupEqInvestor = jest.fn(() => ({ eq: dupEqProject }));
    const dupSelect = jest.fn(() => ({ eq: dupEqInvestor }));

    // insert mock
    const insertSingle = jest.fn(async () => ({
      data: options?.insertError ? null : insertedApp,
      error: options?.insertError ? { message: 'insert error' } : null,
    }));
    const insertSelectMock = jest.fn(() => ({ single: insertSingle }));
    const insertMock = jest.fn(() => ({ select: insertSelectMock }));

    // notifications insert mock (fire-and-forget)
    const notifInsertMock = jest.fn(async () => ({ error: null }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return { select: projectSelect };
          if (table === 'applications') return { select: dupSelect, insert: insertMock };
          if (table === 'notifications') return { insert: notifInsertMock };
          return {};
        }),
      })),
    }));

    jest.doMock('@/lib/notifications/notify-managers', () => ({
      notifyManagers: jest.fn(async () => {}),
    }));
    jest.doMock('@/lib/notifications/notify-managers-new-application', () => ({
      notifyManagersNewApplication: jest.fn(async () => {}),
    }));

    const { POST } = await import('@/app/api/investor/applications/route');
    return POST;
  }

  it('returns 400 when investor_id is missing', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest({ project_id: 'proj-1', message: 'Хочу' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when project_id is missing', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest({ investor_id: 'user-1', message: 'Хочу' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when message is missing or empty', async () => {
    const POST = await loadPostRoute();
    const res = await POST(
      makePostRequest({ investor_id: 'user-1', project_id: 'proj-1', message: '   ' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when project not found or not approved', async () => {
    const POST = await loadPostRoute({ projectFound: false });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 409 when duplicate active application exists', async () => {
    const POST = await loadPostRoute({ duplicateFound: true });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('returns 500 on insert error', async () => {
    const POST = await loadPostRoute({ insertError: true });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('returns 201 with ApplicationDetail on success', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json() as {
      id: string;
      project_id: string;
      project_name: string;
      amount: number;
      status: string;
      message: string;
    };
    expect(json.id).toBe('app-new');
    expect(json.project_id).toBe('proj-1');
    expect(json.project_name).toBe('Tech Fund');
    expect(json.amount).toBe(500000);
    expect(json.status).toBe('pending');
    expect(json.message).toBe('Хочу участвовать');
  });
});

// ─── GET /api/investor/applications/[id] ─────────────────────────────────────

describe('T119 GET /api/investor/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-application-withdrawn');
  });

  const params = Promise.resolve({ id: 'app-1' });

  async function loadGetByIdRoute(options?: {
    data?: Record<string, unknown> | null;
    dbError?: boolean;
  }) {
    jest.resetModules();

    const row =
      options?.data !== undefined
        ? options.data
        : {
            id: 'app-1',
            project_id: 'proj-1',
            amount: 500000,
            status: 'pending',
            message: 'Хочу',
            rejection_reason: null,
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z',
            projects: { name: 'Tech Fund' },
          };

    const maybeSingle = jest.fn(async () => ({
      data: row,
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

    jest.doMock('@/lib/notifications/notify-application-withdrawn', () => ({
      notifyApplicationWithdrawn: jest.fn(async () => {}),
    }));

    const { GET } = await import('@/app/api/investor/applications/[id]/route');
    return GET;
  }

  it('returns 400 when investor_id is missing', async () => {
    const GET = await loadGetByIdRoute();
    const res = await GET(makeGetByIdRequest('app-1'), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    const GET = await loadGetByIdRoute({ data: null });
    const res = await GET(makeGetByIdRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetByIdRoute({ dbError: true });
    const res = await GET(makeGetByIdRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(500);
  });

  it('returns 200 with ApplicationDetail on success', async () => {
    const GET = await loadGetByIdRoute();
    const res = await GET(makeGetByIdRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(200);
    const json = await res.json() as {
      id: string;
      project_name: string;
      status: string;
    };
    expect(json.id).toBe('app-1');
    expect(json.project_name).toBe('Tech Fund');
    expect(json.status).toBe('pending');
  });
});

// ─── DELETE /api/investor/applications/[id] ───────────────────────────────────

describe('T119 DELETE /api/investor/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-application-withdrawn');
  });

  const params = Promise.resolve({ id: 'app-1' });

  async function loadDeleteRoute(options?: {
    existingData?: {
      id: string;
      status: string;
      investor_id: string;
      project_id: string;
    } | null;
    updateError?: boolean;
  }) {
    jest.resetModules();

    const existing =
      options?.existingData !== undefined
        ? options.existingData
        : {
            id: 'app-1',
            status: 'pending',
            investor_id: 'investor-1',
            project_id: 'proj-1',
          };

    const findMaybeSingle = jest.fn(async () => ({
      data: existing,
      error: null,
    }));
    const findEq = jest.fn(() => ({ maybeSingle: findMaybeSingle }));
    const findSelect = jest.fn(() => ({ eq: findEq }));

    const updateEq = jest.fn(async () => ({
      error: options?.updateError ? { message: 'update error' } : null,
    }));
    const updateMock = jest.fn(() => ({ eq: updateEq }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: findSelect,
          update: updateMock,
        })),
      })),
    }));

    jest.doMock('@/lib/notifications/notify-application-withdrawn', () => ({
      notifyApplicationWithdrawn: jest.fn(async () => {}),
    }));

    const { DELETE } = await import('@/app/api/investor/applications/[id]/route');
    return DELETE;
  }

  it('returns 400 when investor_id query param is missing', async () => {
    const DELETE = await loadDeleteRoute();
    const res = await DELETE(makeDeleteRequest('app-1'), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    const DELETE = await loadDeleteRoute({ existingData: null });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when investor_id does not match owner', async () => {
    const DELETE = await loadDeleteRoute({
      existingData: {
        id: 'app-1',
        status: 'pending',
        investor_id: 'other-user',
        project_id: 'proj-1',
      },
    });
    const res = await DELETE(makeDeleteRequest('app-1', 'investor-1'), { params });
    expect(res.status).toBe(403);
  });

  it('returns 400 when application status is not pending', async () => {
    const DELETE = await loadDeleteRoute({
      existingData: {
        id: 'app-1',
        status: 'approved',
        investor_id: 'investor-1',
        project_id: 'proj-1',
      },
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

## Моки — важные детали

### Мок для `notifyManagers` и `notifyManagersNewApplication`

Оба модуля нужно замокать в тестах POST, чтобы не было реальных HTTP-вызовов:

```typescript
jest.doMock('@/lib/notifications/notify-managers', () => ({
  notifyManagers: jest.fn(async () => {}),
}));
jest.doMock('@/lib/notifications/notify-managers-new-application', () => ({
  notifyManagersNewApplication: jest.fn(async () => {}),
}));
```

### Мок для `notifyApplicationWithdrawn`

```typescript
jest.doMock('@/lib/notifications/notify-application-withdrawn', () => ({
  notifyApplicationWithdrawn: jest.fn(async () => {}),
}));
```

### Почему `from` возвращает разные объекты по имени таблицы

В POST-маршруте один и тот же `supabase` инстанс вызывает:
- `from('projects').select(...)` — поиск проекта
- `from('applications').select(...)` — проверка дубликата
- `from('applications').insert(...)` — вставка заявки
- `from('notifications').insert(...)` — уведомление

Мок `from` должен различать эти вызовы по имени таблицы. Используй схему из шаблона выше (switch по `table`).

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t119.test.ts` | СОЗДАТЬ — тесты для четырёх маршрутов заявок инвестора |

Больше ничего не трогать.

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
3. `npm test` — новые тесты проходят (минимум 19 тестов в t119)
4. Существующие тесты (~179 тестов) не сломаны
5. Записать в progress.md: `DONE: T119` + что создано

---

## Что НЕ трогать

- `app/api/investor/applications/route.ts`
- `app/api/investor/applications/[id]/route.ts`
- `app/(investor)/applications/` — любые страницы
- `types/index.ts`
- `middleware.ts`
- Любые существующие тесты

---

## Формат отчёта

```
DONE: T119
- создан __tests__/t119.test.ts: 19 тестов для GET /api/investor/applications, POST /api/investor/applications, GET /api/investor/applications/[id], DELETE /api/investor/applications/[id]
```
