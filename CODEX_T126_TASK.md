# T126 — Тесты для admin/applications и admin/settings API

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~340 (t1–t80, t113–t125)
**Размер задачи:** M
**Зависимости:** T125 (паттерн jest.doMock/jest.resetModules, table-switching mocks)

---

## Зачем это нужно

Пять маршрутов администратора не покрыты тестами:

1. **GET /api/admin/applications** — список всех заявок инвесторов с фильтрами (status, project_id), доступ для superadmin/admin/moderator/manager
2. **GET /api/admin/applications/[id]** — карточка одной заявки (404 если не найдена)
3. **PATCH /api/admin/applications/[id]** — смена статуса заявки по автомату состояний (pending → approved/rejected/cancelled), fire-and-forget: audit log, createNotification, notifyOwnerApplicationStatus
4. **GET /api/admin/settings** — настройки платформы (только admin/superadmin через `profiles`)
5. **PUT /api/admin/settings** — обновление настроек (только superadmin; валидация ключей и числовых значений)

Маршруты используют два разных паттерна аутентификации:

- **admin/applications** → `requireApplicationsAdmin()` из `route.ts` → `createClient()` + `from('users')`, разрешённые роли: superadmin/admin/moderator/manager
- **admin/settings** → `getActorProfile()` → `createClient()` + `from('profiles')`, разрешённые роли для GET: admin/superadmin; для PUT: только superadmin

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/applications/route.ts` — GET + `requireApplicationsAdmin`

**`requireApplicationsAdmin()`** — shared helper для группы applications:
- `createClient()` → `auth.getUser()` → 401 если нет user
- `createClient()` → `from('users').select('role').eq('id', userId).single()` → 500 при ошибке, 403 если роль не в `[superadmin, admin, moderator, manager]`

**GET** `/api/admin/applications`:
- Query params: `status` ('pending'|'approved'|'rejected'|'cancelled'), `project_id`
- `createAdminClient()` → динамический query: `.from('applications').select(...).order('created_at', {ascending:false})`
- Если `status` валиден → добавляет `.eq('status', status)`
- Если `project_id` задан → добавляет `.eq('project_id', project_id)`
- 500 при ошибке DB
- Возвращает `{ applications: AdminApplicationItem[] }` (с маппингом `project_name` из join и `investor_email` из join)

### `app/api/admin/applications/[id]/route.ts` — GET + PATCH

Оба метода импортируют `requireApplicationsAdmin` из `'../route'`.

**GET** `/api/admin/applications/[id]`:
- `createAdminClient()` → `.from('applications').select(...).eq('id', id).maybeSingle()`
- 500 при ошибке DB
- 404 если `data === null`
- 200 с `{ application }`

**PATCH** `/api/admin/applications/[id]`:
- Body: `{ status: string, rejection_reason?: string }`
- Если `status` не валидный → 400 `"invalid status"`
- `createAdminClient()` → `.from('applications').select('id, status, investor_id, project_id').eq('id', id).maybeSingle()`
- 404 если заявка не найдена
- Проверка автомата состояний: `VALID_TRANSITIONS = { pending: [approved, rejected, cancelled], approved: [], rejected: [], cancelled: [] }` → 400 если переход запрещён
- `createAdminClient()` → `.from('applications').update({status, updated_at, rejection_reason}).eq('id', id)` → 500 при ошибке
- Если `status === 'approved' | 'rejected'` → fire-and-forget:
  - `writeAuditLog(...)` (void)
  - `createNotification(...)` (void)
  - `createAdminClient()` → `.from('projects').select('name').eq('id', project_id).maybeSingle()`
  - `notifyOwnerApplicationStatus(...)` (void)
- Возвращает `{ ok: true, status: newStatus }`

### `app/api/admin/settings/route.ts` — GET + PUT

**`getActorProfile()`** — auth helper:
- `createClient()` → `auth.getUser()` → null если нет user
- `createClient()` → `from('profiles').select('role').eq('id', userId).single()`

**GET** `/api/admin/settings`:
- Проверяет `actor` → 401 если null
- Проверяет роль: только `admin | superadmin` → 403
- `createAdminClient()` → `from('platform_settings').select('key, value, updated_at, updated_by')` (без цепочки — прямой await)
- 500 при ошибке
- Возвращает `{ settings: Record<PlatformSettingKey, string> }` (собирается из массива `[{key, value}]`)

**PUT** `/api/admin/settings`:
- Проверяет `actor` → 401
- Проверяет роль: только `superadmin` → 403
- Парсит JSON body → 400 при invalid JSON
- Если `updates.length === 0` → 400 `"No settings provided"`
- Валидация ключей: только из `VALID_KEYS` (6 ключей) → 400 `Unknown setting key: {key}`
- Валидация числовых ключей (`success_fee_default`, `min_investment_amount`, `max_investment_amount`, `catalog_page_size`): должны быть >= 0 → 400
- `createAdminClient()` → `.from('platform_settings').upsert(rows, { onConflict: 'key' })` → 500 при ошибке
- Возвращает `{ ok: true }`

---

## Создать `__tests__/t126.test.ts`

```typescript
// __tests__/t126.test.ts

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

function makeJsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

// ─── Auth mock — admin/applications: requireApplicationsAdmin → from('users') ─
// Разрешённые роли: superadmin, admin, moderator, manager

function buildApplicationsAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId, email: `${userId}@example.com` } : null },
        })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: userId ? { role } : null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  }));
}

// ─── Auth mock — admin/settings: getActorProfile → from('profiles') ──────────
// GET разрешён: admin/superadmin; PUT разрешён: только superadmin

function buildSettingsAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'superadmin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId } : null },
        })),
      },
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            single: jest.fn(async () => ({
              data: userId ? { role } : null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  }));
}

// ─── GET /api/admin/applications ─────────────────────────────────────────────

describe('T126 GET /api/admin/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type AppRow = {
    id: string;
    project_id: string;
    investor_id: string;
    amount: number | null;
    instrument: string | null;
    status: string;
    message: string | null;
    rejection_reason: string | null;
    created_at: string;
    projects: { name: string } | null;
    users: { full_name: string | null; email: string } | null;
  };

  function makeGetApplicationsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: AppRow[];
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const dbError = options.dbError ? { message: 'db error' } : null;

    // Dynamic chain: .order(...).eq?(...).eq?(...)  — resolves via .then()
    const chain: { eq: jest.Mock; then: Function } = {
      eq: jest.fn(() => chain),
      then: (
        resolve: (v: { data: AppRow[] | null; error: typeof dbError }) => void
      ) => resolve({ data: dbError ? null : rows, error: dbError }),
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => chain),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetApplicationsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetApplicationsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is project', async () => {
    makeGetApplicationsMock({ role: 'project' });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetApplicationsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with applications list and mapped fields', async () => {
    makeGetApplicationsMock({
      rows: [
        {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          instrument: 'equity',
          status: 'pending',
          message: null,
          rejection_reason: null,
          created_at: '2026-06-01T00:00:00Z',
          projects: { name: 'Тест Проект' },
          users: { full_name: 'Иван Иванов', email: 'ivan@example.com' },
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      applications: Array<{
        id: string;
        project_name: string | null;
        investor_email: string | null;
        status: string;
      }>;
    };
    expect(json.applications).toHaveLength(1);
    expect(json.applications[0].project_name).toBe('Тест Проект');
    expect(json.applications[0].investor_email).toBe('ivan@example.com');
    expect(json.applications[0].status).toBe('pending');
  });

  it('returns 200 for moderator role', async () => {
    makeGetApplicationsMock({ role: 'moderator', rows: [] });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for manager role', async () => {
    makeGetApplicationsMock({ role: 'manager', rows: [] });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/admin/applications/[id] ────────────────────────────────────────

describe('T126 GET /api/admin/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeGetAppByIdMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    notFound?: boolean;
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    const appData = options.notFound
      ? null
      : {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          instrument: 'equity',
          status: 'pending',
          message: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          projects: { id: 'proj-1', name: 'Тест Проект' },
          users: { email: 'ivan@example.com', full_name: 'Иван' },
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: options.dbError ? null : appData,
                error: options.dbError ? { message: 'db error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetAppByIdMock({ userId: null });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetAppByIdMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetAppByIdMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 404 when application not found', async () => {
    makeGetAppByIdMock({ notFound: true });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/missing-1'),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with application data', async () => {
    makeGetAppByIdMock({});
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { application: { id: string; status: string } };
    expect(json.application.id).toBe('app-1');
    expect(json.application.status).toBe('pending');
  });
});

// ─── PATCH /api/admin/applications/[id] ──────────────────────────────────────

describe('T126 PATCH /api/admin/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-owner-application-status');
  });

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    currentStatus?: string;
    notFound?: boolean;
    updateError?: boolean;
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-owner-application-status', () => ({
      notifyOwnerApplicationStatus: jest.fn(),
    }));

    const currentStatus = options.currentStatus ?? 'pending';
    const appData = options.notFound
      ? null
      : { id: 'app-1', status: currentStatus, investor_id: 'inv-1', project_id: 'proj-1' };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: appData,
                    error: null,
                  })),
                })),
              })),
              update: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.updateError ? { message: 'update error' } : null,
                })),
              })),
            };
          }
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: { name: 'Тест Проект' },
                    error: null,
                  })),
                })),
              })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makePatchMock({ userId: null });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'approved' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'approved' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when status is invalid', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'invalid_status' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    makePatchMock({ notFound: true });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/missing-1', 'PATCH', { status: 'approved' }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when transition is forbidden (approved → rejected)', async () => {
    makePatchMock({ currentStatus: 'approved' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'rejected' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when transition is forbidden (rejected → approved)', async () => {
    makePatchMock({ currentStatus: 'rejected' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'approved' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makePatchMock({ updateError: true });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'approved' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 on pending → approved', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'approved' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });

  it('returns 200 on pending → rejected with rejection_reason', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'rejected',
        rejection_reason: 'Не соответствует требованиям',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });

  it('returns 200 on pending → cancelled', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', { status: 'cancelled' }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('cancelled');
  });
});

// ─── GET /api/admin/settings ──────────────────────────────────────────────────

describe('T126 GET /api/admin/settings', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type SettingRow = {
    key: string;
    value: string;
    updated_at: string;
    updated_by: string;
  };

  function makeGetSettingsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: SettingRow[];
  }) {
    jest.resetModules();
    buildSettingsAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(async () => ({
            data: options.dbError ? null : rows,
            error: options.dbError ? { message: 'db error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetSettingsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeGetSettingsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is manager', async () => {
    makeGetSettingsMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetSettingsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with settings map for admin', async () => {
    makeGetSettingsMock({
      role: 'admin',
      rows: [
        {
          key: 'platform_name',
          value: 'Invest Market',
          updated_at: '2026-01-01T00:00:00Z',
          updated_by: 'admin-1',
        },
        {
          key: 'contact_email',
          value: 'info@invest.com',
          updated_at: '2026-01-01T00:00:00Z',
          updated_by: 'admin-1',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { settings: Record<string, string> };
    expect(json.settings.platform_name).toBe('Invest Market');
    expect(json.settings.contact_email).toBe('info@invest.com');
  });

  it('returns 200 with empty settings for superadmin', async () => {
    makeGetSettingsMock({ role: 'superadmin', rows: [] });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { settings: Record<string, string> };
    expect(Object.keys(json.settings)).toHaveLength(0);
  });
});

// ─── PUT /api/admin/settings ──────────────────────────────────────────────────

describe('T126 PUT /api/admin/settings', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makePutSettingsMock(options: {
    userId?: string | null;
    role?: string | null;
    upsertError?: boolean;
  }) {
    jest.resetModules();
    buildSettingsAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          upsert: jest.fn(async () => ({
            error: options.upsertError ? { message: 'upsert error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePutSettingsMock({ userId: null });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is admin (only superadmin can write)', async () => {
    makePutSettingsMock({ role: 'admin' });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makePutSettingsMock({ role: 'moderator' });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is empty object', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {})
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('No settings');
  });

  it('returns 400 when key is unknown', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { unknown_key: 'value' })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Unknown setting key');
  });

  it('returns 400 when numeric key has negative value', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { success_fee_default: -5 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB upsert error', async () => {
    makePutSettingsMock({ upsertError: true });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'New Name' })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on valid string setting', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {
        platform_name: 'Invest Market Pro',
        contact_email: 'admin@invest.com',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 200 on valid numeric settings', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {
        min_investment_amount: 100000,
        max_investment_amount: 50000000,
        catalog_page_size: 20,
        success_fee_default: 5,
      })
    );
    expect(res.status).toBe(200);
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t126.test.ts` | СОЗДАТЬ — тесты для admin/applications (GET list, GET [id], PATCH [id]) и admin/settings (GET, PUT) |

Больше ничего не трогать.

---

## Ключевые особенности моков

### admin/applications — `requireApplicationsAdmin` через таблицу `users`

Роль проверяется через `createClient()` → `from('users')` (не profiles!). Разрешены: superadmin, admin, moderator, manager:

```typescript
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(async () => ({ data: { role }, error: null })),
        })),
      })),
    })),
  })),
}));
```

### GET /admin/applications — динамическая цепочка запроса с `.then()`

Query строится динамически через `.eq()`. Мок через thenable объект:

```typescript
const chain = {
  eq: jest.fn(() => chain),
  then: (resolve) => resolve({ data: rows, error: null }),
};
// from('applications').select(...).order(...) → chain
```

### PATCH /admin/applications/[id] — table-switching mock

Маршрут вызывает `createAdminClient().from(...)` для трёх таблиц:
- `applications` → `.select()` (получить текущий статус) + `.update()` (обновить)
- `projects` → `.select()` (получить имя проекта для нотификации)

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'applications') {
        return { select: /* maybeSingle mock */, update: /* eq mock */ };
      }
      if (table === 'projects') {
        return { select: /* maybeSingle mock для проекта */ };
      }
      return {};
    }),
  })),
}));
```

### PATCH /admin/applications/[id] — fire-and-forget зависимости

Три модуля вызываются без await (void):

```typescript
jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
jest.doMock('@/lib/notifications/notify-owner-application-status', () => ({
  notifyOwnerApplicationStatus: jest.fn(),
}));
```

### admin/settings — `from('profiles')` (не `users`!)

`getActorProfile()` обращается к таблице `profiles`, что отличает его от большинства admin-маршрутов:

```typescript
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(async () => ({ data: { role }, error: null })),
        })),
      })),
    })),
  })),
}));
```

### GET /admin/settings — прямой `.select()` без дополнительной цепочки

В отличие от большинства маршрутов, `platform_settings` запрашивается без `.order()` или `.eq()`:

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(async () => ({ data: rows, error: null })),
    })),
  })),
}));
```

### PUT /admin/settings — `.upsert()` вместо `.insert()` или `.update()`

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      upsert: jest.fn(async () => ({ error: null })),
    })),
  })),
}));
```

---

## Автомат состояний заявок (для PATCH тестов)

```
VALID_TRANSITIONS = {
  pending:   [approved, rejected, cancelled],
  approved:  [],   // ← нельзя изменить
  rejected:  [],   // ← нельзя изменить
  cancelled: [],   // ← нельзя изменить
}
```

Тесты проверяют:
- `pending → approved` → 200
- `pending → rejected` (с rejection_reason) → 200
- `pending → cancelled` → 200
- `approved → rejected` → 400
- `rejected → approved` → 400

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
3. `npm test` — все тесты в `t126.test.ts` проходят (минимум 30 тестов)
4. Существующие тесты (~340 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T126` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/admin/applications/route.ts`
- `app/api/admin/applications/[id]/route.ts`
- `app/api/admin/settings/route.ts`
- `lib/audit/log.ts`
- `lib/notifications/create.ts`
- `lib/notifications/notify-owner-application-status.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t125)

---

## Формат отчёта

```
REVIEWED: T126
- создан __tests__/t126.test.ts: 34 теста для GET /api/admin/applications (7 — включая 403 для investor/project, маппинг project_name/investor_email, доступ для moderator/manager), GET /api/admin/applications/[id] (5 — включая 404 при maybeSingle null), PATCH /api/admin/applications/[id] (10 — автомат состояний, table-switching mock, fire-and-forget audit+notify), GET /api/admin/settings (6 — profiles auth, 403 для moderator/manager, маппинг key→value), PUT /api/admin/settings (8 — только superadmin, валидация ключей и числовых значений)
```
