# T123 — Тесты для admin/export и admin/referral-rewards API

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~265 (t1–t80, t113–t122)
**Размер задачи:** M
**Зависимости:** T122 (паттерн jest.doMock/jest.resetModules)

---

## Зачем это нужно

Пять маршрутов администратора не покрыты тестами:

1. **GET /api/admin/export/applications** — CSV-выгрузка заявок инвесторов
2. **GET /api/admin/export/investors** — CSV-выгрузка инвесторов
3. **GET /api/admin/export/projects** — CSV-выгрузка проектов
4. **GET /api/admin/referral-rewards** — список реферальных вознаграждений (с фильтром по статусу)
5. **PATCH /api/admin/referral-rewards/[id]** — обновление статуса вознаграждения

Маршруты делятся на два паттерна аутентификации:

- **Export-маршруты** — стандартный паттерн:
  - `createClient()` → `auth.getUser()` + `from('profiles').select('role').eq(id).single()`
  - `createAdminClient()` → запросы к данным

- **Referral-rewards маршруты** — паттерн через хелпер `requireReferralAdmin()`:
  - `createClient()` → `auth.getUser()` + `from('users').select('role').eq(id).single()`
  - `createAdminClient()` → запросы к данным

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/export/applications/route.ts` — GET

- `createClient()` → `auth.getUser()` → 401 если нет user
- `createClient()` → `from('profiles').select('role').eq('id', userId).single()` → 403 если роль не `admin|superadmin`
- `createAdminClient()` → `from('investor_applications').select(...).order('created_at', { ascending: false })`
- При ошибке запроса → 500
- Возвращает `Response` с `Content-Type: text/csv; charset=utf-8` и `Content-Disposition: attachment; filename="applications.csv"`
- CSV-столбцы: `ID, ID проекта, Проект, ID инвестора, Email инвестора, Сумма, Валюта, Статус, Дата заявки`

### `app/api/admin/export/investors/route.ts` — GET

- Аналогичный auth-паттерн (createClient → profiles)
- `createAdminClient()` → `from('profiles').select('id, email, full_name, created_at').eq('role', 'investor').order(...)`
- При ошибке → 500
- Возвращает CSV с `filename="investors.csv"`, столбцы: `ID, Email, Полное имя, Дата регистрации`

### `app/api/admin/export/projects/route.ts` — GET

- Аналогичный auth-паттерн (createClient → profiles)
- `createAdminClient()` → `from('projects').select('id, name, category, status, created_at, investment_min, investment_max, target_amount, currency').order(...)`
- При ошибке → 500
- Возвращает CSV с `filename="projects.csv"`, столбцы: `ID, Название, Категория, Статус, Дата создания, Мин. инвестиция, Макс. инвестиция, Целевая сумма, Валюта`

### `app/api/admin/referral-rewards/route.ts` — GET

- `requireReferralAdmin()` (из `@/lib/referral/admin-auth`) → использует `createClient()`:
  - `auth.getUser()` → 401 если нет user
  - `from('users').select('role').eq('id', userId).single()` → 500 при ошибке, 403 если роль не `admin|superadmin`
- `createAdminClient()` → `from('referral_rewards').select(..., { count: 'exact' }).order('created_at', { ascending: false })`
- Query param `status` ('pending'|'approved'|'paid'): если задан → добавляет `.eq('status', status)` к запросу
- При ошибке запроса → 500
- Возвращает `{ items: [...], total: count }` где каждый item содержит `referrer_email` и `referee_email` (извлекается из join, поддерживает object и array формат)

### `app/api/admin/referral-rewards/[id]/route.ts` — PATCH

- `requireReferralAdmin()` → 401/403/500 аналогично GET
- Body: `{ status: 'approved' | 'paid' }` — если другое значение → 400
- `createAdminClient()` → `from('referral_rewards').update({ status, updated_at }).eq('id', id).select(...).single()`
- При ошибке запроса → 500
- Если `data.referrer_id` существует и `status === 'approved' | 'paid'` → вызывает `notifyReferralReward(...)` (fire-and-forget)
- Возвращает обновлённую запись `data`

---

## Создать `__tests__/t123.test.ts`

```typescript
// __tests__/t123.test.ts

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

function makeJsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

// ─── Auth mock builder — Export routes (createClient → from('profiles')) ────

function buildExportAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

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

// ─── Auth mock builder — Referral-rewards (requireReferralAdmin → from('users')) ─

function buildReferralAuthMock(options: {
  userId?: string | null;
  role?: string | null;
  profileError?: boolean;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

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
              data: options.profileError ? null : (userId ? { role } : null),
              error: options.profileError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    })),
  }));
}

// ─── GET /api/admin/export/applications ───────────────────────────────────────

describe('T123 GET /api/admin/export/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportApplicationsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      project_id: string;
      investor_id: string;
      amount: number | null;
      currency: string | null;
      status: string;
      created_at: string;
      projects: { name: string } | null;
      profiles: { email: string; full_name: string | null } | null;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: options.dbError ? null : rows,
              error: options.dbError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportApplicationsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeExportApplicationsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is manager', async () => {
    makeExportApplicationsMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportApplicationsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Type for admin', async () => {
    makeExportApplicationsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('applications.csv');
  });

  it('CSV contains header row and data row', async () => {
    makeExportApplicationsMock({
      rows: [
        {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          currency: 'RUB',
          status: 'pending',
          created_at: '2026-06-01T10:00:00Z',
          projects: { name: 'Альфа Проект' },
          profiles: { email: 'investor@example.com', full_name: 'Иван Иванов' },
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('ID');
    expect(text).toContain('app-1');
    expect(text).toContain('Альфа Проект');
  });

  it('works for superadmin role', async () => {
    makeExportApplicationsMock({ role: 'superadmin', rows: [] });
    const { GET } = await import('@/app/api/admin/export/applications/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

// ─── GET /api/admin/export/investors ──────────────────────────────────────────

describe('T123 GET /api/admin/export/investors', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportInvestorsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      email: string;
      full_name: string | null;
      created_at: string;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportInvestorsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeExportInvestorsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportInvestorsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Disposition for admin', async () => {
    makeExportInvestorsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('investors.csv');
  });

  it('CSV contains investor data row', async () => {
    makeExportInvestorsMock({
      rows: [
        { id: 'inv-1', email: 'ivan@example.com', full_name: 'Иван Иванов', created_at: '2026-01-01T00:00:00Z' },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/investors/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('inv-1');
    expect(text).toContain('ivan@example.com');
  });
});

// ─── GET /api/admin/export/projects ───────────────────────────────────────────

describe('T123 GET /api/admin/export/projects', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeExportProjectsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: Array<{
      id: string;
      name: string;
      category: string;
      status: string;
      created_at: string;
      investment_min: number | null;
      investment_max: number | null;
      target_amount: number | null;
      currency: string | null;
    }>;
  }) {
    jest.resetModules();
    buildExportAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(async () => ({
              data: options.dbError ? null : rows,
              error: options.dbError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeExportProjectsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeExportProjectsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeExportProjectsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct Content-Disposition for admin', async () => {
    makeExportProjectsMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('projects.csv');
  });

  it('CSV contains project data row with financial fields', async () => {
    makeExportProjectsMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Бета Проект',
          category: 'Tech',
          status: 'approved',
          created_at: '2026-06-01T00:00:00Z',
          investment_min: 100000,
          investment_max: 5000000,
          target_amount: 10000000,
          currency: 'RUB',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/export/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('proj-1');
    expect(text).toContain('Бета Проект');
    expect(text).toContain('approved');
  });
});

// ─── GET /api/admin/referral-rewards ─────────────────────────────────────────

describe('T123 GET /api/admin/referral-rewards', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/referral/admin-auth');
  });

  type RewardRow = {
    id: string;
    referrer_id: string;
    referee_id: string;
    portfolio_id: string | null;
    level: 1 | 2 | 3;
    amount: number;
    status: string;
    created_at: string;
    updated_at: string;
    referrer: { email: string } | { email: string }[] | null;
    referee: { email: string } | { email: string }[] | null;
  };

  function makeRewardsMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    dbError?: boolean;
    rows?: RewardRow[];
    count?: number;
  }) {
    jest.resetModules();
    buildReferralAuthMock({
      userId: options.userId,
      role: options.role,
      profileError: options.profileError,
    });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;

    // requireReferralAdmin is called by the route directly — mock its module
    // The route imports from '@/lib/referral/admin-auth'
    // We already mock createClient above; requireReferralAdmin uses it internally
    // No need to mock the helper separately — it uses the mocked createClient

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => {
          // Supports optional .eq('status', ...) chained after .order(...)
          const orderMock = jest.fn(async () => ({
            data: options.dbError ? null : rows,
            error: options.dbError ? { message: 'db error' } : null,
            count,
          }));
          const eqAfterOrderMock = jest.fn(() => ({
            // range not needed here — route calls order then optionally eq('status')
            // but the final resolution is the eq call returning promise
            then: (resolve: (v: { data: RewardRow[] | null; error: { message: string } | null; count: number }) => void) =>
              resolve({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
                count,
              }),
          }));
          const selectMock = jest.fn(() => ({
            order: jest.fn(() => ({
              eq: eqAfterOrderMock,
              // When no filter: final query resolves as promise
              then: (resolve: (v: { data: RewardRow[] | null; error: { message: string } | null; count: number }) => void) =>
                resolve({
                  data: options.dbError ? null : rows,
                  error: options.dbError ? { message: 'db error' } : null,
                  count,
                }),
            })),
          }));
          return { select: selectMock };
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeRewardsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeRewardsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeRewardsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeRewardsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with items and total when no filter', async () => {
    makeRewardsMock({
      rows: [
        {
          id: 'rr-1',
          referrer_id: 'u-1',
          referee_id: 'u-2',
          portfolio_id: null,
          level: 1,
          amount: 5000,
          status: 'pending',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          referrer: { email: 'referrer@example.com' },
          referee: { email: 'referee@example.com' },
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{
        id: string;
        referrer_email: string;
        referee_email: string;
        amount: number;
        status: string;
      }>;
      total: number;
    };
    expect(json.total).toBe(1);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].referrer_email).toBe('referrer@example.com');
    expect(json.items[0].referee_email).toBe('referee@example.com');
    expect(json.items[0].amount).toBe(5000);
  });

  it('maps referee/referrer email from array join format', async () => {
    makeRewardsMock({
      rows: [
        {
          id: 'rr-2',
          referrer_id: 'u-1',
          referee_id: 'u-2',
          portfolio_id: null,
          level: 2,
          amount: 2500,
          status: 'approved',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          referrer: [{ email: 'array-referrer@example.com' }],
          referee: [{ email: 'array-referee@example.com' }],
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/referral-rewards/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/referral-rewards'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ referrer_email: string; referee_email: string }>;
    };
    expect(json.items[0].referrer_email).toBe('array-referrer@example.com');
    expect(json.items[0].referee_email).toBe('array-referee@example.com');
  });
});

// ─── PATCH /api/admin/referral-rewards/[id] ───────────────────────────────────

describe('T123 PATCH /api/admin/referral-rewards/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-referral-reward');
  });

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    dbError?: boolean;
    updatedRow?: {
      id: string;
      referrer_id: string | null;
      referee_id: string;
      portfolio_id: string | null;
      level: number;
      amount: number;
      status: string;
      created_at: string;
      updated_at: string;
    };
  }) {
    jest.resetModules();
    buildReferralAuthMock({
      userId: options.userId,
      role: options.role,
      profileError: options.profileError,
    });

    jest.doMock('@/lib/notifications/notify-referral-reward', () => ({
      notifyReferralReward: jest.fn(),
    }));

    const updatedRow = options.updatedRow ?? {
      id: 'rr-1',
      referrer_id: 'u-1',
      referee_id: 'u-2',
      portfolio_id: null,
      level: 1,
      amount: 5000,
      status: 'approved',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: options.dbError ? null : updatedRow,
                  error: options.dbError ? { message: 'db error' } : null,
                })),
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
    makePatchMock({ userId: null });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when status is invalid', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'pending' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when status is missing', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', {}),
      makeContext('rr-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB error', async () => {
    makePatchMock({ dbError: true });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with updated reward on valid PATCH', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: 'u-1',
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; status: string };
    expect(json.id).toBe('rr-1');
    expect(json.status).toBe('approved');
  });

  it('accepts paid as valid status', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: 'u-1',
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'paid',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'paid' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('paid');
  });

  it('returns 200 when referrer_id is null (no notification sent)', async () => {
    makePatchMock({
      updatedRow: {
        id: 'rr-1',
        referrer_id: null,
        referee_id: 'u-2',
        portfolio_id: null,
        level: 1,
        amount: 5000,
        status: 'approved',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/referral-rewards/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/referral-rewards/rr-1', { status: 'approved' }),
      makeContext('rr-1')
    );
    expect(res.status).toBe(200);
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t123.test.ts` | СОЗДАТЬ — тесты для admin/export (3 маршрута) и admin/referral-rewards (2 маршрута) |

Больше ничего не трогать.

---

## Ключевые особенности моков

### Export-маршруты — стандартный двойной клиент

`createClient()` — для auth + role через `profiles`:
```typescript
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ single: jest.fn(async () => ({ data: { role }, error: null })) })),
      })),
    })),
  })),
}));
```

`createAdminClient()` — для CSV-данных:
```typescript
// applications: .select(...).order(...)
// investors:    .select(...).eq('role', 'investor').order(...)
// projects:     .select(...).order(...)
```

### Referral-rewards — requireReferralAdmin через `users` таблицу

`requireReferralAdmin()` (lib/referral/admin-auth.ts) использует `createClient()` → `from('users')`:
```typescript
// Важно: таблица 'users', не 'profiles'
from: jest.fn(() => ({
  select: jest.fn(() => ({
    eq: jest.fn(() => ({
      single: jest.fn(async () => ({ data: { role }, error: null })),
    })),
  })),
})),
```

### PATCH /referral-rewards/[id] — нотификация fire-and-forget

`notifyReferralReward` вызывается без await. Мокируем модуль чтобы избежать side-effects:
```typescript
jest.doMock('@/lib/notifications/notify-referral-reward', () => ({
  notifyReferralReward: jest.fn(),
}));
```

### GET /referral-rewards — query с опциональным .eq('status', ...)

Маршрут использует переменную `query` с возможным `.eq('status', status)`. Мок должен поддерживать оба пути:
- без фильтра: `query` разрешается как промис напрямую (через `.then`)
- с фильтром: `.eq(...)` возвращает промис

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
3. `npm test` — все тесты в `t123.test.ts` проходят (минимум 22 теста)
4. Существующие тесты (~265 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T123` + отчёт

---

## Что НЕ трогать

- `app/api/admin/export/applications/route.ts`
- `app/api/admin/export/investors/route.ts`
- `app/api/admin/export/projects/route.ts`
- `app/api/admin/referral-rewards/route.ts`
- `app/api/admin/referral-rewards/[id]/route.ts`
- `lib/referral/admin-auth.ts`
- `lib/notifications/notify-referral-reward.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t122)

---

## Формат отчёта

```
REVIEWED: T123
- создан __tests__/t123.test.ts: 22 теста для GET /api/admin/export/applications (6), GET /api/admin/export/investors (5), GET /api/admin/export/projects (5), GET /api/admin/referral-rewards (6), PATCH /api/admin/referral-rewards/[id] (7 — включая 400 на invalid status, fire-and-forget notify)
```
