# T124 — Тесты для admin/users и admin/activate-user API

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~287 (t1–t80, t113–t123)
**Размер задачи:** M
**Зависимости:** T123 (паттерн jest.doMock/jest.resetModules)

---

## Зачем это нужно

Пять маршрутов управления пользователями не покрыты тестами:

1. **GET /api/admin/users** — список пользователей с пагинацией, поиском, фильтром по роли
2. **GET /api/admin/users/[id]** — карточка одного пользователя
3. **POST /api/admin/users/[id]** — подтверждение email через Supabase Auth Admin API
4. **PATCH /api/admin/users/[id]** — изменение роли / статуса is_active с защитой от самоизменения
5. **POST /api/admin/activate-user** — создание профиля пользователя после invite-регистрации

Эти маршруты содержат нетривиальную бизнес-логику:
- `requireUsersAdmin()` (shared helper из `route.ts`) — auth через `users`, не `profiles`
- Запрет изменения собственного аккаунта (400)
- Запрет назначения роли `superadmin` не-суперадмином (403)
- Валидация body: поле `role` должно быть одним из 6 допустимых значений, `is_active` — строго boolean
- `POST /activate-user` использует другой auth-паттерн: `createClient` только для auth, `createAdminClient` для profile-check + insert

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/users/route.ts` — GET + `requireUsersAdmin`

**`requireUsersAdmin()`** — общий auth-хелпер для всей группы:
- `createClient()` → `auth.getUser()` → 401 если нет user
- `createClient()` → `from('users').select('role').eq('id', userId).single()` → 500 при ошибке, 403 если роль не `admin|superadmin`
- Возвращает `{ user, role }` при успехе

**GET** `/api/admin/users`:
- Вызывает `requireUsersAdmin()` → 401/403/500
- Query params: `page` (default 1), `limit` (default 20, max 100), `search`, `role`
- `createAdminClient()` → динамический query:
  ```
  from('users').select('id, email, role, full_name, is_active, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    [.or(`email.ilike.%term%,full_name.ilike.%term%`)]  // если search
    [.eq('role', role)]                                   // если role корректный
    .range(from, to)
  ```
- 500 при ошибке DB
- Возвращает `{ users: UserProfile[], total: number }`

### `app/api/admin/users/[id]/route.ts` — GET, POST, PATCH

Все три метода вызывают `requireUsersAdmin()` (импорт из `../route`).

**GET** `/api/admin/users/[id]`:
- `createAdminClient()` → `from('users').select(...).eq('id', id).single()`
- 500 при ошибке, иначе возвращает `UserProfile`

**POST** `/api/admin/users/[id]` — подтверждение email:
- `createAdminClient()` → `supabase.auth.admin.updateUserById(id, { email_confirm: true })`
- 500 при ошибке, иначе `{ ok: true }`

**PATCH** `/api/admin/users/[id]` — обновление роли/статуса:
- Если `id === auth.user.id` → 400 `"Cannot update own account"`
- Валидация body `{ role?, is_active? }`:
  - `role` — должен быть одним из `['superadmin','admin','moderator','manager','investor','project']`
  - `is_active` — строго boolean
  - Пустой объект `{}` допустим (без изменений)
  - Невалидное значение → 400
- Если `update.role === 'superadmin'` и `auth.role !== 'superadmin'` → 403
- `createAdminClient()` → `from('users').update(update).eq('id', id).select(...).single()`
- 500 при ошибке DB
- Вызывает `notifyUserAccountChange(...)` (fire-and-forget, без await)
- Возвращает обновлённый `UserProfile`

### `app/api/admin/activate-user/route.ts` — POST

Auth-паттерн отличается от `requireUsersAdmin`:
- `createClient()` → `auth.getUser()` → 401 если нет user
- `createAdminClient()` → `from('users').select('role').eq('id', userId).single()` → 500/403
- Body: `{ userId: string, email: string, fullName: string, role: UserRole }` — все поля обязательны, role валидируется → 400 если невалидно
- `createAdminClient()` → `from('users').insert({ id, email, full_name, role })` → 500 при ошибке
- Возвращает `{ ok: true }`

---

## Создать `__tests__/t124.test.ts`

```typescript
// __tests__/t124.test.ts

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

// ─── Auth mock builder (GET /users, GET/POST/PATCH /users/[id]) ───────────────
// requireUsersAdmin: createClient → auth.getUser + from('users').select('role').eq().single()

function buildUsersAuthMock(options: {
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

// ─── GET /api/admin/users ─────────────────────────────────────────────────────

describe('T124 GET /api/admin/users', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type UserRow = {
    id: string;
    email: string;
    role: string;
    full_name: string | null;
    is_active: boolean;
    created_at: string;
  };

  function makeUsersMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: UserRow[];
    count?: number;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;

    // Dynamic query chain: .order(…) → chainMock (supports .or, .eq, .range)
    const chainMock: {
      or: jest.Mock;
      eq: jest.Mock;
      range: jest.Mock;
    } = {
      or: jest.fn(() => chainMock),
      eq: jest.fn(() => chainMock),
      range: jest.fn(async () => ({
        data: options.dbError ? null : rows,
        error: options.dbError ? { message: 'db error' } : null,
        count,
      })),
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => chainMock),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeUsersMock({ userId: null });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeUsersMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeUsersMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeUsersMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with users and total', async () => {
    makeUsersMock({
      rows: [
        {
          id: 'u-1',
          email: 'admin@example.com',
          role: 'admin',
          full_name: 'Admin User',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { users: UserRow[]; total: number };
    expect(json.users).toHaveLength(1);
    expect(json.users[0].email).toBe('admin@example.com');
    expect(json.total).toBe(1);
  });

  it('returns 200 with correct total from count (pagination)', async () => {
    makeUsersMock({
      rows: [
        {
          id: 'u-1',
          email: 'a@b.com',
          role: 'investor',
          full_name: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      count: 50,
    });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users?page=1&limit=1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(50);
  });
});

// ─── GET /api/admin/users/[id] ────────────────────────────────────────────────

describe('T124 GET /api/admin/users/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeGetUserMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    userData?: { id: string; email: string; role: string; full_name: string | null; is_active: boolean; created_at: string } | null;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const userData = options.userData ?? {
      id: 'target-1',
      email: 'target@example.com',
      role: 'investor',
      full_name: 'Target User',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.dbError ? null : userData,
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
    makeGetUserMock({ userId: null });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is manager', async () => {
    makeGetUserMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetUserMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with user data', async () => {
    makeGetUserMock({});
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; email: string };
    expect(json.id).toBe('target-1');
    expect(json.email).toBe('target@example.com');
  });
});

// ─── POST /api/admin/users/[id] (confirm email) ───────────────────────────────

describe('T124 POST /api/admin/users/[id] (confirm email)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeConfirmMock(options: {
    userId?: string | null;
    role?: string | null;
    confirmError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        auth: {
          admin: {
            updateUserById: jest.fn(async () => ({
              data: null,
              error: options.confirmError ? { message: 'confirm error' } : null,
            })),
          },
        },
        // GET /users/[id] requireUsersAdmin also calls from('users') internally via requireUsersAdmin
        // but POST doesn't need it — keepping from as no-op is safe
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({ data: { role: 'admin' }, error: null })),
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
    makeConfirmMock({ userId: null });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeConfirmMock({ role: 'investor' });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on Auth Admin error', async () => {
    makeConfirmMock({ confirmError: true });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on success', async () => {
    makeConfirmMock({});
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

// ─── PATCH /api/admin/users/[id] ─────────────────────────────────────────────

describe('T124 PATCH /api/admin/users/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-user-account-change');
  });

  type UpdatedUser = {
    id: string;
    email: string;
    role: string;
    full_name: string | null;
    is_active: boolean;
    created_at: string;
  };

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    updatedUser?: UpdatedUser;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/notifications/notify-user-account-change', () => ({
      notifyUserAccountChange: jest.fn(),
    }));

    const updatedUser = options.updatedUser ?? {
      id: 'target-1',
      email: 'target@example.com',
      role: 'moderator',
      full_name: 'Target User',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: options.dbError ? null : updatedUser,
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
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when trying to update own account', async () => {
    // userId = 'admin-1', target id also = 'admin-1'
    makePatchMock({ userId: 'admin-1', role: 'admin' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/admin-1', 'PATCH', { role: 'moderator' }),
      makeContext('admin-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('own account');
  });

  it('returns 400 when body is invalid (unknown role)', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'hacker' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when is_active is not boolean', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { is_active: 'yes' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-superadmin tries to assign superadmin role', async () => {
    makePatchMock({ role: 'admin' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'superadmin' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 when superadmin assigns superadmin role', async () => {
    makePatchMock({
      role: 'superadmin',
      updatedUser: {
        id: 'target-1',
        email: 'target@example.com',
        role: 'superadmin',
        full_name: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'superadmin' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { role: string };
    expect(json.role).toBe('superadmin');
  });

  it('returns 500 on DB error', async () => {
    makePatchMock({ dbError: true });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with updated user on valid PATCH (role change)', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; role: string };
    expect(json.id).toBe('target-1');
    expect(json.role).toBe('moderator');
  });

  it('returns 200 with updated user on valid PATCH (is_active change)', async () => {
    makePatchMock({
      updatedUser: {
        id: 'target-1',
        email: 'target@example.com',
        role: 'investor',
        full_name: null,
        is_active: false,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { is_active: false }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { is_active: boolean };
    expect(json.is_active).toBe(false);
  });
});

// ─── POST /api/admin/activate-user ───────────────────────────────────────────

describe('T124 POST /api/admin/activate-user', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  // activate-user: createClient → auth only; createAdminClient → profile check + insert
  function makeActivateMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    insertError?: boolean;
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
      })),
    }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.profileError ? null : (userId ? { role } : null),
                error: options.profileError ? { message: 'db error' } : null,
              })),
            })),
          })),
          insert: jest.fn(async () => ({
            data: null,
            error: options.insertError ? { message: 'insert error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeActivateMock({ userId: null });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'investor',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeActivateMock({ role: 'investor' });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'investor',
      })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is missing required fields', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        // missing email, fullName, role
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'unknown_role',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on insert DB error', async () => {
    makeActivateMock({ insertError: true });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test User',
        role: 'investor',
      })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on success', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'ivan@example.com',
        fullName: 'Иван Иванов',
        role: 'investor',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('accepts all valid roles (project role)', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-2',
        email: 'project@example.com',
        fullName: 'ООО Проект',
        role: 'project',
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
| `__tests__/t124.test.ts` | СОЗДАТЬ — тесты для admin/users и admin/activate-user |

Больше ничего не трогать.

---

## Ключевые особенности моков

### requireUsersAdmin — таблица `users`, не `profiles`

Все методы `GET/POST/PATCH /api/admin/users/[id]` и `GET /api/admin/users` используют `requireUsersAdmin()` из `app/api/admin/users/route.ts`. Этот хелпер обращается к таблице **`users`** (а не `profiles`), что отличает его от большинства других admin-маршрутов:

```typescript
// createClient для auth + profile check:
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

### GET /users — динамическая цепочка запроса

Query строится динамически с `.or()` и `.eq()`. Мок `chainMock` должен возвращать сам себя:

```typescript
const chainMock = {
  or: jest.fn(() => chainMock),
  eq: jest.fn(() => chainMock),
  range: jest.fn(async () => ({ data: rows, error: null, count })),
};
// from('users').select(...).order(...) → chainMock
```

### POST /users/[id] — auth.admin.updateUserById

`createAdminClient()` должен иметь `auth.admin.updateUserById`:

```typescript
createAdminClient: jest.fn(() => ({
  auth: {
    admin: {
      updateUserById: jest.fn(async () => ({ data: null, error: null })),
    },
  },
  from: jest.fn(() => /* не используется в POST */ ({})),
})),
```

### PATCH /users/[id] — нотификация fire-and-forget

```typescript
jest.doMock('@/lib/notifications/notify-user-account-change', () => ({
  notifyUserAccountChange: jest.fn(),
}));
```

### POST /activate-user — другой auth-паттерн

`createClient()` используется **только** для `auth.getUser()` (без `from`).
`createAdminClient()` используется для **двух** операций: profile-check + insert:

```typescript
// createClient — только auth:
jest.doMock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: userId } } })) },
  })),
}));

// createAdminClient — profile check + insert (оба через from('users')):
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn(async () => ({ data: { role }, error: null })) })) })),
      insert: jest.fn(async () => ({ data: null, error: null })),
    })),
  })),
}));
```

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
3. `npm test` — все тесты в `t124.test.ts` проходят (минимум 25 тестов)
4. Существующие тесты (~287 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T124` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/admin/users/route.ts`
- `app/api/admin/users/[id]/route.ts`
- `app/api/admin/activate-user/route.ts`
- `lib/notifications/notify-user-account-change.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t123)

---

## Формат отчёта

```
REVIEWED: T124
- создан __tests__/t124.test.ts: 26 тестов для GET /api/admin/users (6), GET /api/admin/users/[id] (4), POST /api/admin/users/[id] confirm email (4), PATCH /api/admin/users/[id] (9 — включая self-update 400, non-superadmin assigns superadmin 403, fire-and-forget notify), POST /api/admin/activate-user (7 — включая все 6 допустимых ролей, invalid role 400)
```
