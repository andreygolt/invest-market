# T122 — Тесты для referral API (code, stats, list)

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~247 (t1–t80, t113–t121)
**Размер задачи:** M
**Зависимости:** T121 (паттерн mocks с jest.doMock/jest.resetModules)

---

## Зачем это нужно

Три пользовательских маршрута реферальной системы не покрыты тестами:

1. **GET /api/referral/code** — возвращает реферальный код пользователя (или создаёт новый)
2. **GET /api/referral/stats** — агрегированная статистика рефералов и вознаграждений
3. **GET /api/referral/list** — список рефералов с пагинацией и фильтрацией по уровню

Все три маршрута:
- Используют только `createClient()` (без `createAdminClient`)
- Требуют аутентификации, но НЕ проверяют роль (доступны любому авторизованному пользователю)
- Обращаются к таблицам `referral_codes`, `referral_links`, `referral_rewards`

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/referral/code/route.ts` — GET

- Требует аутентификации → 401
- Ищет существующий код: `supabase.from('referral_codes').select('code').eq('user_id', userId).maybeSingle()`
- Если ошибка запроса → 500
- Если код найден → возвращает `{ code, invite_link: '/invite/{code}' }`
- Если кода нет → вызывает `insertReferralCode` (до 3 попыток вставки):
  - `supabase.from('referral_codes').insert({ user_id, code }).select('code').single()`
  - Если все 3 попытки неудачны → выбрасывает ошибку → 500
  - Если вставка успешна → возвращает `{ code, invite_link: '/invite/{code}' }`

### `app/api/referral/stats/route.ts` — GET

- Требует аутентификации → 401
- Последовательно запрашивает:
  1. `referral_codes` → `.select('code').eq('user_id', userId).maybeSingle()` → 500 при ошибке
  2. `referral_links` → `.select('level').eq('referrer_id', userId)` → 500 при ошибке
  3. `referral_rewards` → `.select('amount,status').eq('referrer_id', userId)` → 500 при ошибке
- Возвращает `ReferralStats`:
  ```typescript
  {
    code: string | null,
    total_referrals: number,
    level1_count: number,
    level2_count: number,
    level3_count: number,
    rewards_pending: number,
    rewards_approved: number,
    rewards_paid: number,
  }
  ```
- `total_referrals` = общее количество записей в `referral_links`
- `level{N}_count` = количество записей с `level === N`
- `rewards_pending/approved/paid` = суммы `amount` по статусу (Number(amount ?? 0))

### `app/api/referral/list/route.ts` — GET

- Требует аутентификации → 401
- Query params: `level` (1|2|3|'all', default 'all'), `limit` (default 20, max 100), `offset` (default 0)
- Запрос: `supabase.from('referral_links').select('referee_id, level, created_at, users!referral_links_referee_id_fkey(email)', { count: 'exact' }).eq('referrer_id', userId).order(...).range(offset, offset+limit-1)`
- Если `level` === '1'|'2'|'3' → добавляет `.eq('level', Number(level))`
- 500 при ошибке запроса
- Каждая запись содержит `masked_email`: `first_char***@domain` (только первый символ до @)
- Возвращает `{ items, total }` где `total` = count из запроса

---

## Создать `__tests__/t122.test.ts`

```typescript
// __tests__/t122.test.ts

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

// ─── Shared mock builder ──────────────────────────────────────────────────────
// Все три маршрута используют только createClient (без adminClient)
// auth.getUser() → user или null
// from(table) → цепочки запросов, специфичные для каждого маршрута

// ─── GET /api/referral/code ───────────────────────────────────────────────────

describe('T122 GET /api/referral/code', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/referral/code');
  });

  function makeCodeMock(options: {
    userId?: string | null;
    existingCode?: string | null;   // null = не найден, string = найден
    codeError?: boolean;            // ошибка при чтении кода
    insertError?: boolean;          // ошибка при вставке нового кода
    insertedCode?: string;          // код, возвращённый при вставке
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;

    jest.doMock('@/lib/referral/code', () => ({
      generateReferralCode: jest.fn(() => options.insertedCode ?? 'ABCD-1234'),
    }));

    const maybeSingleMock = jest.fn(async () => ({
      data: options.existingCode ? { code: options.existingCode } : null,
      error: options.codeError ? { message: 'db error' } : null,
    }));

    const insertSingleMock = jest.fn(async () => ({
      data: options.insertError ? null : { code: options.insertedCode ?? 'ABCD-1234' },
      error: options.insertError ? { message: 'conflict' } : null,
    }));

    const insertSelectMock = jest.fn(() => ({ single: insertSingleMock }));
    const insertMock = jest.fn(() => ({ select: insertSelectMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_codes') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({ maybeSingle: maybeSingleMock })),
              })),
              insert: insertMock,
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeCodeMock({ userId: null });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on referral_codes read error', async () => {
    makeCodeMock({ codeError: true });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns existing code when found', async () => {
    makeCodeMock({ existingCode: 'XYZW-5678' });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { code: string; invite_link: string };
    expect(json.code).toBe('XYZW-5678');
    expect(json.invite_link).toBe('/invite/XYZW-5678');
  });

  it('creates new code when none exists', async () => {
    makeCodeMock({ existingCode: null, insertedCode: 'NEWC-0001' });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { code: string; invite_link: string };
    expect(json.code).toBe('NEWC-0001');
    expect(json.invite_link).toBe('/invite/NEWC-0001');
  });

  it('returns 500 when all insert attempts fail', async () => {
    makeCodeMock({ existingCode: null, insertError: true });
    const { GET } = await import('@/app/api/referral/code/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ─── GET /api/referral/stats ──────────────────────────────────────────────────

describe('T122 GET /api/referral/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeStatsMock(options: {
    userId?: string | null;
    codeRow?: { code: string } | null;
    codeError?: boolean;
    linksError?: boolean;
    rewardsError?: boolean;
    links?: Array<{ level: 1 | 2 | 3 }>;
    rewards?: Array<{ amount: number | null; status: string }>;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;

    const codeRow = options.codeRow === undefined ? null : options.codeRow;
    const links = options.links ?? [];
    const rewards = options.rewards ?? [];

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_codes') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: codeRow,
                    error: options.codeError ? { message: 'db error' } : null,
                  })),
                })),
              })),
            };
          }
          if (table === 'referral_links') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: options.linksError ? null : links,
                  error: options.linksError ? { message: 'db error' } : null,
                })),
              })),
            };
          }
          if (table === 'referral_rewards') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: options.rewardsError ? null : rewards,
                  error: options.rewardsError ? { message: 'db error' } : null,
                })),
              })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatsMock({ userId: null });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on referral_codes error', async () => {
    makeStatsMock({ codeError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 500 on referral_links error', async () => {
    makeStatsMock({ linksError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 500 on referral_rewards error', async () => {
    makeStatsMock({ rewardsError: true });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns zero stats when no referrals and no code', async () => {
    makeStatsMock({ codeRow: null, links: [], rewards: [] });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      code: string | null;
      total_referrals: number;
      level1_count: number;
      level2_count: number;
      level3_count: number;
      rewards_pending: number;
      rewards_approved: number;
      rewards_paid: number;
    };
    expect(json.code).toBeNull();
    expect(json.total_referrals).toBe(0);
    expect(json.level1_count).toBe(0);
    expect(json.level2_count).toBe(0);
    expect(json.level3_count).toBe(0);
    expect(json.rewards_pending).toBe(0);
    expect(json.rewards_approved).toBe(0);
    expect(json.rewards_paid).toBe(0);
  });

  it('counts referrals by level correctly', async () => {
    makeStatsMock({
      codeRow: { code: 'ABCD-1234' },
      links: [
        { level: 1 },
        { level: 1 },
        { level: 2 },
        { level: 3 },
        { level: 3 },
        { level: 3 },
      ],
      rewards: [],
    });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      code: string | null;
      total_referrals: number;
      level1_count: number;
      level2_count: number;
      level3_count: number;
    };
    expect(json.code).toBe('ABCD-1234');
    expect(json.total_referrals).toBe(6);
    expect(json.level1_count).toBe(2);
    expect(json.level2_count).toBe(1);
    expect(json.level3_count).toBe(3);
  });

  it('sums reward amounts by status correctly', async () => {
    makeStatsMock({
      links: [],
      rewards: [
        { amount: 1000, status: 'pending' },
        { amount: 500, status: 'pending' },
        { amount: 2000, status: 'approved' },
        { amount: 750, status: 'paid' },
        { amount: null, status: 'pending' }, // null amount = 0
      ],
    });
    const { GET } = await import('@/app/api/referral/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      rewards_pending: number;
      rewards_approved: number;
      rewards_paid: number;
    };
    expect(json.rewards_pending).toBe(1500);
    expect(json.rewards_approved).toBe(2000);
    expect(json.rewards_paid).toBe(750);
  });
});

// ─── GET /api/referral/list ───────────────────────────────────────────────────

describe('T122 GET /api/referral/list', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type LinkRow = {
    referee_id: string;
    level: 1 | 2 | 3;
    created_at: string;
    users: { email: string } | null;
  };

  function makeListMock(options: {
    userId?: string | null;
    dbError?: boolean;
    rows?: LinkRow[];
    count?: number;
    // captures the eq(level) call to simulate filtering
    captureEqLevel?: (level: number) => void;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'referral_links') {
            const chainBase = {
              eq: jest.fn((_col: string, _val: unknown) => {
                if (_col === 'level' && options.captureEqLevel) {
                  options.captureEqLevel(_val as number);
                }
                return chainEnd;
              }),
              order: jest.fn(() => chainEnd),
              range: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
                count,
              })),
            };
            // chainEnd also has eq for level filter
            const chainEnd: typeof chainBase = {
              eq: jest.fn((_col: string, _val: unknown) => {
                if (_col === 'level' && options.captureEqLevel) {
                  options.captureEqLevel(_val as number);
                }
                return chainEnd;
              }),
              order: jest.fn(() => chainEnd),
              range: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
                count,
              })),
            };
            return {
              select: jest.fn(() => chainBase),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeListMock({ userId: null });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(401);
  });

  it('returns 500 on DB error', async () => {
    makeListMock({ dbError: true });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(500);
  });

  it('returns empty list when no referrals', async () => {
    makeListMock({ rows: [], count: 0 });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: unknown[]; total: number };
    expect(json.items).toEqual([]);
    expect(json.total).toBe(0);
  });

  it('masks email correctly (first char + *** + @domain)', async () => {
    makeListMock({
      rows: [
        {
          referee_id: 'ref-1',
          level: 1,
          created_at: '2026-06-01T00:00:00Z',
          users: { email: 'ivan@example.com' },
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ referee_id: string; masked_email: string; level: number; joined_at: string }>;
      total: number;
    };
    expect(json.items).toHaveLength(1);
    expect(json.items[0].masked_email).toBe('i***@example.com');
    expect(json.items[0].referee_id).toBe('ref-1');
    expect(json.items[0].level).toBe(1);
    expect(json.total).toBe(1);
  });

  it('returns correct total from count', async () => {
    makeListMock({
      rows: [
        { referee_id: 'r1', level: 2, created_at: '2026-06-01T00:00:00Z', users: { email: 'a@b.com' } },
      ],
      count: 42, // total in DB, not just current page
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(42);
  });

  it('masks email when users join is an array', async () => {
    makeListMock({
      rows: [
        {
          referee_id: 'ref-2',
          level: 3,
          created_at: '2026-06-02T00:00:00Z',
          users: [{ email: 'peter@mail.ru' }] as unknown as { email: string },
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/referral/list/route');
    const res = await GET(makeGetRequest('http://localhost/api/referral/list'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      items: Array<{ masked_email: string }>;
    };
    expect(json.items[0].masked_email).toBe('p***@mail.ru');
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t122.test.ts` | СОЗДАТЬ — тесты для referral/code, referral/stats, referral/list |

Больше ничего не трогать.

---

## Ключевые особенности моков

### referral/code — maybeSingle + insert chain

```typescript
// Чтение существующего кода:
supabase.from('referral_codes')
  .select('code')
  .eq('user_id', userId)
  .maybeSingle()   // → { data: { code } | null, error }

// Создание нового кода (insertReferralCode):
supabase.from('referral_codes')
  .insert({ user_id, code })
  .select('code')
  .single()        // → { data: { code }, error }
```

Мок `from('referral_codes')` должен возвращать объект с полями `select` (для чтения) и `insert` (для создания).

### referral/stats — три последовательных запроса

```typescript
// Все три через один createClient():
supabase.from('referral_codes').select('code').eq('user_id', id).maybeSingle()
supabase.from('referral_links').select('level').eq('referrer_id', id)   // → { data, error }
supabase.from('referral_rewards').select('amount,status').eq('referrer_id', id) // → { data, error }
```

Второй и третий запросы: `.select(...).eq(...)` возвращает промис напрямую (без `.single()` или `.maybeSingle()`).

### referral/list — цепочка с count

```typescript
supabase.from('referral_links')
  .select('referee_id, level, created_at, users!...(email)', { count: 'exact' })
  .eq('referrer_id', userId)
  .order('created_at', { ascending: false })
  .range(offset, offset + safeLimit - 1)
  // опционально: .eq('level', N) если level фильтр задан
```

Итоговый `.range(...)` возвращает `{ data, error, count }`.

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
3. `npm test` — все тесты в `t122.test.ts` проходят (минимум 18 тестов)
4. Существующие тесты (~247 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T122` + отчёт

---

## Что НЕ трогать

- `app/api/referral/code/route.ts`
- `app/api/referral/stats/route.ts`
- `app/api/referral/list/route.ts`
- `lib/referral/code.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t121)

---

## Формат отчёта

```
REVIEWED: T122
- создан __tests__/t122.test.ts: 18 тестов для GET /api/referral/code (5 тестов), GET /api/referral/stats (7 тестов), GET /api/referral/list (6 тестов — включая маскировку email и total из count)
```
