# T125 — Тесты для admin/invites, admin/stats и admin/search API

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~312 (t1–t80, t113–t124)
**Размер задачи:** M
**Зависимости:** T124 (паттерн jest.doMock/jest.resetModules, table-switching mocks)

---

## Зачем это нужно

Пять маршрутов администратора не покрыты тестами:

1. **GET /api/admin/invites** — список инвайтов с пагинацией
2. **POST /api/admin/invites** — создание инвайта (валидация роли + expiresInDays, audit log fire-and-forget)
3. **DELETE /api/admin/invites/[id]** — удаление инвайта (запрет удаления использованного)
4. **GET /api/admin/stats** — статистика дашборда (projects, users, applications, portfolio, invites, recent_activity)
5. **GET /api/admin/search** — глобальный поиск (projects, investors, applications)

Маршруты делятся на два паттерна аутентификации:

- **admin/invites + admin/stats** — `createClient()` → `auth.getUser()` + `from('users').select('role').eq(id).single()`
- **admin/search** — `createClient()` → `auth.getUser()` + `from('profiles').select('role').eq(id).single()`

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/invites/route.ts` — GET + POST

**Auth-паттерн (`requireAdmin`):**
- `createClient()` → `auth.getUser()` → 401 если нет user
- `supabase.from('users').select('role').eq('id', userId).single()` → 500 при ошибке, 403 если роль не `admin|superadmin`

**GET** `/api/admin/invites`:
- Query params: `page` (default 1), `limit` (default 50, max 100)
- `getAdminClient(supabase)` → пробует `createAdminClient()`, при ошибке — fallback на supabase
- `admin.from('invites').select(…, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)`
- 500 при ошибке DB
- Возвращает `{ invites: Invite[], total: number }`

**POST** `/api/admin/invites`:
- Body: `{ role: 'investor'|'project'|'moderator'|'manager', expiresInDays?: number, email?: string }`
- Валидация: `role` обязателен и должен быть одним из 4 допустимых → 400
- `expiresInDays`: если передан — должен быть целым числом > 0 → 400; если `null`/`undefined` — expires_at = null (без срока)
- `getAdminClient(supabase)` → `from('invites').insert(payload).select(…).single()`
- 500 при ошибке DB
- `writeAuditLog(…)` — fire-and-forget (без await)
- Возвращает `{ ...invite, code, url }` со статусом 201

### `app/api/admin/invites/[id]/route.ts` — DELETE

**Auth-паттерн:** то же `requireAdmin` через `createClient()` + `from('users')`

**DELETE** `/api/admin/invites/[id]`:
- Все операции через `supabase` (от `createClient()`), не через adminClient
- `supabase.from('invites').select('used_by').eq('id', id).single()` → 500 при ошибке
- Если `data.used_by` не null → 400 `"invite already used"`
- `supabase.from('invites').delete().eq('id', id)` → 500 при ошибке
- Успех: 204 No Content

### `app/api/admin/stats/route.ts` — GET

**Auth-паттерн:** `createClient()` → `auth.getUser()` + `from('users').select('role').eq(id).single()`

**GET** `/api/admin/stats`:
- Роли: только `admin | superadmin` → 403
- Вызывает `getAdminStats(supabase)` из `@/lib/admin/stats` — можно замокать весь модуль
- При исключении из `getAdminStats` → 500
- Возвращает объект `AdminStats` (projects, users, applications, portfolio, invites, recent_activity)

### `app/api/admin/search/route.ts` — GET

**Auth-паттерн:** `createClient()` → `auth.getUser()` + `from('profiles').select('role').eq(id).single()` (**profiles**, не users!)

**GET** `/api/admin/search`:
- Роли: только `admin | superadmin` → 403
- Query param `q`: если `q.length < 2` → возвращает `{ query, projects: [], investors: [], applications: [] }` со статусом 200
- `createAdminClient()` → 3 параллельных запроса:
  - `from('projects').select(…).or(…).limit(10)`
  - `from('profiles').select(…).eq('role','investor').or(…).limit(10)`
  - `from('investor_applications').select(…).ilike(…).limit(10)`
- При любой ошибке → 500
- Возвращает `GlobalSearchResponse { query, projects, investors, applications }`

---

## Создать `__tests__/t125.test.ts`

```typescript
// __tests__/t125.test.ts

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

// Auth mock: createClient → auth.getUser + from('users') для requireAdmin
// Используется: admin/invites, admin/invites/[id], admin/stats
function buildUsersAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId, email: 'admin@example.com' } : null },
        })),
      },
      from: jest.fn((table: string) => {
        if (table === 'users') {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: userId ? { role } : null,
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

// Auth mock: createClient → auth.getUser + from('profiles') для admin/search
function buildProfilesAuthMock(options: {
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

// ─── GET /api/admin/invites ───────────────────────────────────────────────────

describe('T125 GET /api/admin/invites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type InviteRow = {
    id: string;
    code: string;
    role: string;
    email: string | null;
    used_by: string | null;
    used_at: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
    note: string | null;
  };

  function makeGetInvitesMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: InviteRow[];
    count?: number;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
                count,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetInvitesMock({ userId: null });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetInvitesMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeGetInvitesMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetInvitesMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with invites list and total', async () => {
    makeGetInvitesMock({
      rows: [
        {
          id: 'inv-1',
          code: 'abc123def456gh78',
          role: 'investor',
          email: null,
          used_by: null,
          used_at: null,
          created_by: 'admin-1',
          created_at: '2026-06-01T00:00:00Z',
          expires_at: null,
          note: null,
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { invites: InviteRow[]; total: number };
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0].role).toBe('investor');
    expect(json.total).toBe(1);
  });
});

// ─── POST /api/admin/invites ──────────────────────────────────────────────────

describe('T125 POST /api/admin/invites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
  });

  type InviteCreated = {
    id: string;
    code: string;
    role: string;
    email: string | null;
    used_by: string | null;
    used_at: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
    note: string | null;
    url: string;
  };

  function makePostInviteMock(options: {
    userId?: string | null;
    role?: string | null;
    insertError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/audit/log', () => ({
      writeAuditLog: jest.fn(),
    }));

    const createdInvite = {
      id: 'new-inv-1',
      code: 'testcode1234abcd',
      role: 'investor',
      email: null,
      used_by: null,
      used_at: null,
      created_by: 'admin-1',
      created_at: '2026-06-30T10:00:00Z',
      expires_at: null,
      note: null,
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.insertError ? null : createdInvite,
                error: options.insertError ? { message: 'insert error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePostInviteMock({ userId: null });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is manager', async () => {
    makePostInviteMock({ role: 'manager' });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body has no role', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {})
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid (e.g. admin)', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'admin' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiresInDays is negative', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: -5,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiresInDays is not an integer', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: 1.5,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB insert error', async () => {
    makePostInviteMock({ insertError: true });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(500);
  });

  it('returns 201 with invite data and url on success', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: 7,
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as InviteCreated;
    expect(json.code).toBeTruthy();
    expect(json.url).toContain(json.code);
    expect(json.role).toBe('investor');
  });
});

// ─── DELETE /api/admin/invites/[id] ──────────────────────────────────────────

describe('T125 DELETE /api/admin/invites/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeDeleteInviteMock(options: {
    userId?: string | null;
    role?: string | null;
    selectError?: boolean;
    alreadyUsed?: boolean;
    deleteError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'admin-1' : options.userId;
    const role = options.role === undefined ? 'admin' : options.role;

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: userId ? { role } : null,
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'invites') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.selectError
                      ? null
                      : { used_by: options.alreadyUsed ? 'some-user-id' : null },
                    error: options.selectError ? { message: 'db error' } : null,
                  })),
                })),
              })),
              delete: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.deleteError ? { message: 'delete error' } : null,
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
    makeDeleteInviteMock({ userId: null });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeDeleteInviteMock({ role: 'moderator' });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 when invite select fails', async () => {
    makeDeleteInviteMock({ selectError: true });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 when invite is already used', async () => {
    makeDeleteInviteMock({ alreadyUsed: true });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('used');
  });

  it('returns 204 on successful deletion', async () => {
    makeDeleteInviteMock({});
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(204);
  });
});

// ─── GET /api/admin/stats ─────────────────────────────────────────────────────

describe('T125 GET /api/admin/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/admin/stats');
  });

  const mockStats = {
    projects: { draft: 1, submitted: 2, approved: 3, rejected: 0, total: 6 },
    users: { investor: 5, project: 2, admin: 1, moderator: 1, manager: 0, total: 9 },
    applications: { pending: 3, approved: 2, rejected: 1, total: 6 },
    portfolio: { total_records: 4 },
    invites: { total: 10, used: 5, unused: 5 },
    recent_activity: [],
  };

  function makeStatsMock(options: {
    userId?: string | null;
    role?: string | null;
    statsError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/admin/stats', () => ({
      getAdminStats: jest.fn(async () => {
        if (options.statsError) throw new Error('stats error');
        return mockStats;
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeStatsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 when getAdminStats throws', async () => {
    makeStatsMock({ statsError: true });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with stats shape', async () => {
    makeStatsMock({});
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as typeof mockStats;
    expect(json.projects.total).toBe(6);
    expect(json.users.investor).toBe(5);
    expect(json.invites.unused).toBe(5);
    expect(Array.isArray(json.recent_activity)).toBe(true);
  });
});

// ─── GET /api/admin/search ────────────────────────────────────────────────────

describe('T125 GET /api/admin/search', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  // admin/search использует from('profiles') для проверки роли (не 'users')
  function makeSearchMock(options: {
    userId?: string | null;
    role?: string | null;
    searchError?: boolean;
    projects?: Array<{ id: string; name: string; category: string; status: string }>;
    investors?: Array<{ id: string; full_name: string | null; email: string; created_at: string }>;
    applications?: Array<{
      id: string;
      project_id: string;
      investor_id: string;
      amount: number | null;
      status: string;
      projects: { name: string } | null;
      profiles: { email: string } | null;
    }>;
  }) {
    jest.resetModules();
    buildProfilesAuthMock({ userId: options.userId, role: options.role });

    const projData = options.projects ?? [];
    const invData = options.investors ?? [];
    const appData = options.applications ?? [];
    const searchError = options.searchError ? { message: 'search error' } : null;

    function makeOrLimitMock(data: unknown[]) {
      return {
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
          })),
          eq: jest.fn(() => ({
            or: jest.fn(() => ({
              limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
            })),
          })),
          ilike: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
          })),
        })),
      };
    }

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return makeOrLimitMock(projData);
          if (table === 'profiles') return makeOrLimitMock(invData);
          if (table === 'investor_applications') return makeOrLimitMock(appData);
          return makeOrLimitMock([]);
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeSearchMock({ userId: null });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeSearchMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(403);
  });

  it('returns 200 with empty results when q is less than 2 chars', async () => {
    makeSearchMock({});
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=a'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      query: string;
      projects: unknown[];
      investors: unknown[];
      applications: unknown[];
    };
    expect(json.projects).toEqual([]);
    expect(json.investors).toEqual([]);
    expect(json.applications).toEqual([]);
  });

  it('returns 200 with empty results when q is absent', async () => {
    makeSearchMock({});
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: unknown[] };
    expect(json.projects).toEqual([]);
  });

  it('returns 500 on search DB error', async () => {
    makeSearchMock({ searchError: true });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with search results', async () => {
    makeSearchMock({
      projects: [{ id: 'p-1', name: 'TestCorp', category: 'Tech', status: 'approved' }],
      investors: [],
      applications: [],
    });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=TestCorp'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      query: string;
      projects: Array<{ id: string; name: string }>;
      investors: unknown[];
      applications: unknown[];
    };
    expect(json.query).toBe('TestCorp');
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].name).toBe('TestCorp');
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t125.test.ts` | СОЗДАТЬ — тесты для admin/invites (GET+POST), admin/invites/[id] (DELETE), admin/stats (GET), admin/search (GET) |

Больше ничего не трогать.

---

## Ключевые особенности моков

### Два разных auth-паттерна

**admin/invites + admin/stats** используют `from('users')`:
```typescript
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn((table: string) => {
      if (table === 'users') {
        return { select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(async () => ({ data: { role }, error: null })) })) })) };
      }
      return {};
    }),
  })),
}));
```

**admin/search** использует `from('profiles')`:
```typescript
// Простой mock без switch по таблицам — все from() возвращают одно и то же
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(async () => ({ data: { role }, error: null })) })) })),
    })),
  })),
}));
```

### DELETE /invites/[id] — createClient для данных (не adminClient)

Весь маршрут использует `supabase` от `createClient()`. Mock должен переключаться по таблице:
- `from('users')` → проверка роли (requireAdmin)
- `from('invites')` → select (проверка used_by) и delete

### GET /admin/stats — мокируем модуль целиком

Вместо сложного мока для `getAdminStats` (17 параллельных запросов) — мокируем модуль:
```typescript
jest.doMock('@/lib/admin/stats', () => ({
  getAdminStats: jest.fn(async () => mockStats),
}));
```

### POST /admin/invites — audit log fire-and-forget

```typescript
jest.doMock('@/lib/audit/log', () => ({
  writeAuditLog: jest.fn(),
}));
```

### admin/search — параллельные .or().limit() запросы

Три таблицы используют разные цепочки:
- `projects`: `.select(…).or(…).limit(…)`
- `profiles` (investors): `.select(…).eq('role','investor').or(…).limit(…)`
- `investor_applications`: `.select(…).ilike(…).limit(…)`

Мок должен поддерживать все три цепочки.

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
3. `npm test` — все тесты в `t125.test.ts` проходят (минимум 25 тестов)
4. Существующие тесты (~312 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T125` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/admin/invites/route.ts`
- `app/api/admin/invites/[id]/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/admin/search/route.ts`
- `lib/admin/stats.ts`
- `lib/audit/log.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t124)

---

## Формат отчёта

```
REVIEWED: T125
- создан __tests__/t125.test.ts: 26 тестов для GET /api/admin/invites (5), POST /api/admin/invites (8 — включая валидацию role/expiresInDays, audit log mock, статус 201), DELETE /api/admin/invites/[id] (5 — включая table-switching mock, защита от удаления использованного), GET /api/admin/stats (4 — мок целого модуля @/lib/admin/stats), GET /api/admin/search (6 — profiles auth, пустой ответ при q<2, параллельные запросы)
```
