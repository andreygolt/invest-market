# T121 — Тесты для admin analytics, funnel и investors-activity API

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~227 (t1–t80, t113–t120)
**Размер задачи:** M
**Зависимости:** T120 (паттерн двойного supabase-клиента: createClient для auth+profile, createAdminClient для данных)

---

## Зачем это нужно

Три аналитических маршрута администратора не покрыты тестами — они формируют ядро аналитической панели:

1. **Analytics API** — временные ряды по 5 метрикам (регистрации, проекты, просмотры, заявки, портфель):
   - `GET /api/admin/analytics?period=7d|30d|90d` — бакеты по дням (7d/30d) или неделям (90d)

2. **Funnel API** — воронка по каждому одобренному проекту: просмотры → избранное → заявки → портфель:
   - `GET /api/admin/funnel` — список строк с conversion_rate

3. **Investors Activity API** — сводка активности каждого инвестора: просмотры, избранное, заявки, портфель, дата последней активности:
   - `GET /api/admin/investors-activity`

Все три маршрута используют одинаковый паттерн аутентификации:
- `createClient()` (server) — для `auth.getUser()` и проверки роли через `supabase.from('profiles')`
- `createAdminClient()` — для запросов к данным (с `Promise.all` для параллельных запросов)

Без тестов нельзя гарантировать корректность: логики разбивки по временным бакетам, подсчёта уникальных просмотрщиков, расчёта conversion_rate, агрегации last_active_at.

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/analytics/route.ts` — GET

**GET** `/api/admin/analytics`
- Требует аутентификации → 401
- Требует роли `admin | superadmin` → 403
- Query param `period`: `'7d' | '30d' | '90d'`, по умолчанию `'30d'`
- При `period !== '90d'`: бакеты по дням → `buckets.length === days`
- При `period === '90d'`: бакеты по неделям → `buckets.length === Math.ceil(90/7) === 13`
- Каждый бакет содержит: `{ label, date_from, registrations, project_submissions, deal_room_views, applications, portfolio_entries }`
- `totals` — сумма каждой метрики по всем бакетам
- Если любой из 5 запросов к adminClient возвращает ошибку → 500
- Запросы в adminClient: `profiles.created_at`, `projects.created_at`, `deal_room_views.viewed_at`, `investor_applications.created_at`, `investor_portfolio.created_at` — все с `.select(col).gte(col, fromIso)`

### `app/api/admin/funnel/route.ts` — GET

**GET** `/api/admin/funnel`
- Требует аутентификации → 401
- Требует роли `admin | superadmin | moderator` → 403 для `investor`, `project`, `manager`
- Сначала получает одобренные проекты: `admin.from('projects').select('id, name, category').eq('status', 'approved').order('created_at', { ascending: false })`
- Если проектов нет → возвращает `{ rows: [] }`
- Если ошибка запроса проектов → 500
- Для существующих проектов параллельно запрашивает 4 таблицы через `.select().in('project_id', projectIds)`
- Если любой из 4 запросов ошибка → 500
- Каждая строка: `{ project_id, project_name, category, views_count, unique_viewers, favorites_count, applications_count, portfolio_count, conversion_rate }`
- `unique_viewers` = уникальные `investor_id` среди просмотров проекта
- `conversion_rate` = `Math.round((applications_count / unique_viewers) * 1000) / 10` (процент), 0 если unique_viewers=0
- Строки сортируются по `views_count` убывающе

### `app/api/admin/investors-activity/route.ts` — GET

**GET** `/api/admin/investors-activity`
- Требует аутентификации → 401
- Требует роли `admin | superadmin` → 403 (moderator НЕ в списке)
- Сначала получает всех инвесторов: `admin.from('profiles').select('id, full_name, email').eq('role', 'investor').order('created_at', { ascending: false })`
- Если инвесторов нет → `{ rows: [] }`
- Если ошибка → 500
- Для существующих инвесторов параллельно запрашивает 4 таблицы через `.select(...).in('investor_id', investorIds)`
- Каждая строка: `{ investor_id, investor_name, email, views_count, favorites_count, applications_count, portfolio_count, last_active_at }`
- `last_active_at` = максимальный timestamp из всех активностей инвестора (или `null` если нет активностей)
- Строки сортируются по `views_count` убывающе

---

## Создать `__tests__/t121.test.ts`

```typescript
// __tests__/t121.test.ts

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

// ─── shared auth mock builder ─────────────────────────────────────────────────
// Все три маршрута используют одинаковый паттерн:
//   createClient() → auth.getUser() + from('profiles').select('role').eq(id).single()
//   createAdminClient() → данные

function buildServerClientMock(options: {
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

// ─── GET /api/admin/analytics ─────────────────────────────────────────────────

describe('T121 GET /api/admin/analytics', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  // Все 5 запросов в adminClient используют .select(col).gte(col, from)
  // Возвращают массив объектов с датой
  function makeAnalyticsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    regDates?: string[];       // ISO dates for profiles.created_at
    viewDates?: string[];      // ISO dates for deal_room_views.viewed_at
    appDates?: string[];       // ISO dates for investor_applications.created_at
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const regDates = options.regDates ?? [];
    const viewDates = options.viewDates ?? [];
    const appDates = options.appDates ?? [];

    function makeGteMock(
      rows: Array<Record<string, string>>,
      error: { message: string } | null = null
    ) {
      return {
        select: jest.fn(() => ({
          gte: jest.fn(async () => ({
            data: error ? null : rows,
            error,
          })),
        })),
      };
    }

    const dbError = options.dbError ? { message: 'db error' } : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (options.dbError && table === 'profiles') {
            return makeGteMock([], dbError);
          }
          switch (table) {
            case 'profiles':
              return makeGteMock(regDates.map((d) => ({ created_at: d })));
            case 'projects':
              return makeGteMock([]);
            case 'deal_room_views':
              return makeGteMock(viewDates.map((d) => ({ viewed_at: d })));
            case 'investor_applications':
              return makeGteMock(appDates.map((d) => ({ created_at: d })));
            case 'investor_portfolio':
              return makeGteMock([]);
            default:
              return makeGteMock([]);
          }
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeAnalyticsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeAnalyticsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeAnalyticsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with 7 day buckets for period=7d', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=7d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      period: string;
      buckets: unknown[];
      totals: Record<string, number>;
    };
    expect(json.period).toBe('7d');
    expect(json.buckets).toHaveLength(7);
  });

  it('returns 200 with 30 day buckets for period=30d (default)', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { period: string; buckets: unknown[] };
    expect(json.period).toBe('30d');
    expect(json.buckets).toHaveLength(30);
  });

  it('returns 200 with 13 weekly buckets for period=90d', async () => {
    makeAnalyticsMock({});
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=90d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { period: string; buckets: unknown[] };
    expect(json.period).toBe('90d');
    // Math.ceil(90/7) = 13
    expect(json.buckets).toHaveLength(13);
  });

  it('totals.registrations equals sum of registrations across buckets', async () => {
    // Pass a date from "today" that falls within the 7d window
    const todayIso = new Date().toISOString().slice(0, 10);
    makeAnalyticsMock({ regDates: [todayIso + 'T10:00:00Z'] });
    const { GET } = await import('@/app/api/admin/analytics/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/analytics?period=7d'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      buckets: Array<{ registrations: number }>;
      totals: { registrations: number };
    };
    const sumFromBuckets = json.buckets.reduce((acc, b) => acc + b.registrations, 0);
    expect(json.totals.registrations).toBe(sumFromBuckets);
    expect(json.totals.registrations).toBe(1);
  });
});

// ─── GET /api/admin/funnel ────────────────────────────────────────────────────

describe('T121 GET /api/admin/funnel', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeFunnelMock(options: {
    userId?: string | null;
    role?: string | null;
    projectsError?: boolean;
    secondaryError?: boolean;
    projects?: Array<{ id: string; name: string; category: string }>;
    views?: Array<{ project_id: string; investor_id: string }>;
    favorites?: Array<{ project_id: string }>;
    applications?: Array<{ project_id: string }>;
    portfolio?: Array<{ project_id: string }>;
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const projects = options.projects ?? [];
    const views = options.views ?? [];
    const favorites = options.favorites ?? [];
    const applications = options.applications ?? [];
    const portfolio = options.portfolio ?? [];

    const projectsOrderMock = jest.fn(async () => ({
      data: options.projectsError ? null : projects,
      error: options.projectsError ? { message: 'db error' } : null,
    }));
    const projectsEqMock = jest.fn(() => ({ order: projectsOrderMock }));
    const projectsSelectMock = jest.fn(() => ({ eq: projectsEqMock }));

    function makeInMock(
      data: unknown[],
      error: { message: string } | null = null
    ) {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({ data: error ? null : data, error })),
        })),
      };
    }

    const secondaryError = options.secondaryError
      ? { message: 'secondary error' }
      : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return { select: projectsSelectMock };
          if (table === 'deal_room_views')
            return makeInMock(views, secondaryError);
          if (table === 'investor_favorites') return makeInMock(favorites);
          if (table === 'investor_applications') return makeInMock(applications);
          if (table === 'investor_portfolio') return makeInMock(portfolio);
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeFunnelMock({ userId: null });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeFunnelMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 for moderator (moderator is in ALLOWED_ROLES)', async () => {
    makeFunnelMock({ role: 'moderator', projects: [] });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('returns 500 on projects DB error', async () => {
    makeFunnelMock({ projectsError: true });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns { rows: [] } when no approved projects exist', async () => {
    makeFunnelMock({ projects: [] });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: unknown[] };
    expect(json.rows).toEqual([]);
  });

  it('returns 500 on secondary DB error when projects exist', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      secondaryError: true,
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('calculates views_count, unique_viewers, favorites_count, applications_count, portfolio_count correctly', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      views: [
        { project_id: 'proj-1', investor_id: 'inv-1' },
        { project_id: 'proj-1', investor_id: 'inv-2' },
        { project_id: 'proj-1', investor_id: 'inv-1' }, // duplicate investor
      ],
      favorites: [{ project_id: 'proj-1' }],
      applications: [{ project_id: 'proj-1' }, { project_id: 'proj-1' }],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{
        project_id: string;
        views_count: number;
        unique_viewers: number;
        favorites_count: number;
        applications_count: number;
        portfolio_count: number;
        conversion_rate: number;
      }>;
    };
    expect(json.rows).toHaveLength(1);
    const row = json.rows[0];
    expect(row.project_id).toBe('proj-1');
    expect(row.views_count).toBe(3);       // total view rows
    expect(row.unique_viewers).toBe(2);    // unique investor_id
    expect(row.favorites_count).toBe(1);
    expect(row.applications_count).toBe(2);
    expect(row.portfolio_count).toBe(0);
    // conversion_rate = round(2/2 * 1000) / 10 = 100
    expect(row.conversion_rate).toBe(100);
  });

  it('conversion_rate is 0 when unique_viewers is 0', async () => {
    makeFunnelMock({
      projects: [{ id: 'proj-1', name: 'Alpha', category: 'Tech' }],
      views: [],
      applications: [{ project_id: 'proj-1' }],
    });
    const { GET } = await import('@/app/api/admin/funnel/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{ conversion_rate: number }>;
    };
    expect(json.rows[0].conversion_rate).toBe(0);
  });
});

// ─── GET /api/admin/investors-activity ───────────────────────────────────────

describe('T121 GET /api/admin/investors-activity', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeInvestorsActivityMock(options: {
    userId?: string | null;
    role?: string | null;
    investorsError?: boolean;
    investors?: Array<{ id: string; full_name: string | null; email: string }>;
    views?: Array<{ investor_id: string; viewed_at: string }>;
    favorites?: Array<{ investor_id: string; created_at: string }>;
    applications?: Array<{ investor_id: string; created_at: string }>;
    portfolio?: Array<{ investor_id: string; created_at: string }>;
  }) {
    jest.resetModules();
    buildServerClientMock({ userId: options.userId, role: options.role });

    const investors = options.investors ?? [];
    const views = options.views ?? [];
    const favorites = options.favorites ?? [];
    const applications = options.applications ?? [];
    const portfolio = options.portfolio ?? [];

    const investorsOrderMock = jest.fn(async () => ({
      data: options.investorsError ? null : investors,
      error: options.investorsError ? { message: 'db error' } : null,
    }));
    const investorsEqMock = jest.fn(() => ({ order: investorsOrderMock }));
    const investorsSelectMock = jest.fn(() => ({ eq: investorsEqMock }));

    function makeInMock(data: unknown[]) {
      return {
        select: jest.fn(() => ({
          in: jest.fn(async () => ({ data, error: null })),
        })),
      };
    }

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'profiles') return { select: investorsSelectMock };
          if (table === 'deal_room_views') return makeInMock(views);
          if (table === 'investor_favorites') return makeInMock(favorites);
          if (table === 'investor_applications') return makeInMock(applications);
          if (table === 'investor_portfolio') return makeInMock(portfolio);
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeInvestorsActivityMock({ userId: null });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator (not in ALLOWED_ROLES)', async () => {
    makeInvestorsActivityMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is investor', async () => {
    makeInvestorsActivityMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on investors DB error', async () => {
    makeInvestorsActivityMock({ investorsError: true });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns { rows: [] } when no investors exist', async () => {
    makeInvestorsActivityMock({ investors: [] });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rows: unknown[] };
    expect(json.rows).toEqual([]);
  });

  it('aggregates counts and computes last_active_at correctly', async () => {
    makeInvestorsActivityMock({
      investors: [{ id: 'inv-1', full_name: 'Иван Иванов', email: 'ivan@example.com' }],
      views: [
        { investor_id: 'inv-1', viewed_at: '2026-06-28T10:00:00Z' },
        { investor_id: 'inv-1', viewed_at: '2026-06-29T15:00:00Z' },
      ],
      favorites: [{ investor_id: 'inv-1', created_at: '2026-06-27T08:00:00Z' }],
      applications: [{ investor_id: 'inv-1', created_at: '2026-06-25T12:00:00Z' }],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{
        investor_id: string;
        investor_name: string;
        email: string;
        views_count: number;
        favorites_count: number;
        applications_count: number;
        portfolio_count: number;
        last_active_at: string | null;
      }>;
    };
    expect(json.rows).toHaveLength(1);
    const row = json.rows[0];
    expect(row.investor_id).toBe('inv-1');
    expect(row.investor_name).toBe('Иван Иванов');
    expect(row.email).toBe('ivan@example.com');
    expect(row.views_count).toBe(2);
    expect(row.favorites_count).toBe(1);
    expect(row.applications_count).toBe(1);
    expect(row.portfolio_count).toBe(0);
    // max timestamp across all activity
    expect(row.last_active_at).toBe('2026-06-29T15:00:00Z');
  });

  it('last_active_at is null when investor has no activity', async () => {
    makeInvestorsActivityMock({
      investors: [{ id: 'inv-1', full_name: 'Без активности', email: 'idle@example.com' }],
      views: [],
      favorites: [],
      applications: [],
      portfolio: [],
    });
    const { GET } = await import('@/app/api/admin/investors-activity/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rows: Array<{ last_active_at: string | null }>;
    };
    expect(json.rows[0].last_active_at).toBeNull();
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t121.test.ts` | СОЗДАТЬ — тесты для analytics, funnel, investors-activity |

Больше ничего не трогать.

---

## Ключевые особенности моков

### Auth-паттерн (одинаковый для всех трёх маршрутов)

`createClient()` возвращает объект с двумя точками использования:
1. `supabase.auth.getUser()` — идентификация пользователя
2. `supabase.from('profiles').select('role').eq('id', userId).single()` — проверка роли

```typescript
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
          single: jest.fn(async () => ({ data: userId ? { role } : null, error: null })),
        })),
      })),
    })),
  })),
}));
```

### Analytics — параллельные gte-запросы

Все 5 таблиц в `Promise.all` используют `.select(col).gte(col, date)`:

```typescript
function makeGteMock(rows: Array<Record<string, string>>, error = null) {
  return {
    select: jest.fn(() => ({
      gte: jest.fn(async () => ({ data: error ? null : rows, error })),
    })),
  };
}
```

### Funnel — последовательные запросы

1. `projects`: `.select('id, name, category').eq('status', 'approved').order(...)` → список
2. Затем 4 таблицы: `.select(...).in('project_id', ids)` → массивы

```typescript
// projects mock
const orderMock = jest.fn(async () => ({ data: projects, error: null }));
const eqMock = jest.fn(() => ({ order: orderMock }));
const selectMock = jest.fn(() => ({ eq: eqMock }));

// secondary mocks
function makeInMock(data: unknown[]) {
  return { select: jest.fn(() => ({ in: jest.fn(async () => ({ data, error: null })) })) };
}
```

### Investors-Activity — аналогично Funnel

1. `profiles`: `.select('id, full_name, email').eq('role', 'investor').order(...)` → список
2. Затем 4 таблицы: `.select(...).in('investor_id', ids)` → массивы активности

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
3. `npm test` — все тесты в `t121.test.ts` проходят (минимум 20 тестов)
4. Существующие тесты (~227 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T121` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/admin/analytics/route.ts`
- `app/api/admin/funnel/route.ts`
- `app/api/admin/investors-activity/route.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t120)

---

## Формат отчёта

```
REVIEWED: T121
- создан __tests__/t121.test.ts: 20 тестов для GET /api/admin/analytics (7 тестов), GET /api/admin/funnel (8 тестов), GET /api/admin/investors-activity (7 тестов — включая last_active_at логику)
```
