# T116 — Тесты для API профиля пользователя

## Цель

Три API-маршрута профиля существуют, но тестов не имеют:

- `GET /api/profile` — получить профиль текущего пользователя
- `PATCH /api/profile` — обновить `full_name`
- `GET /api/profile/notification-preferences` — получить настройки уведомлений
- `PATCH /api/profile/notification-preferences` — обновить настройки уведомлений
- `POST /api/profile/password` — сменить пароль

Нужно создать `__tests__/t116.test.ts` с тестами для всех пяти хэндлеров.

---

## Контекст

Файлы маршрутов (не трогать — только тестируем):

- `app/api/profile/route.ts` — GET + PATCH, использует `createClient` из `@/lib/supabase/server`
- `app/api/profile/notification-preferences/route.ts` — GET + PATCH, использует `createClient` (auth) + `createAdminClient` (данные)
- `app/api/profile/password/route.ts` — POST, использует `createClient`, вызывает `supabase.auth.updateUser`

---

## Создать `__tests__/t116.test.ts`

```typescript
// __tests__/t116.test.ts

// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(path: string = '/api/profile') {
  return new Request(`http://localhost${path}`) as import('next/server').NextRequest;
}

function makePatchRequest(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makePostRequest(path: string, body: Record<string, unknown>) {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

// ─── GET /api/profile ────────────────────────────────────────────────────────

describe('T116 GET /api/profile', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadGetRoute(options?: {
    authed?: boolean;
    profileData?: Record<string, unknown> | null;
    dbError?: boolean;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const profileData = options?.profileData !== undefined
      ? options.profileData
      : { id: 'user-1', role: 'investor', full_name: 'Иван Петров', is_active: true, created_at: '2026-01-01T00:00:00Z' };

    const singleMock = jest.fn(async () => ({
      data: profileData,
      error: options?.dbError ? { message: 'db error' } : null,
    }));
    const eqMock = jest.fn(() => ({ single: singleMock }));
    const selectMock = jest.fn(() => ({ eq: eqMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1', email: 'ivan@example.com' } : null },
          })),
        },
        from: jest.fn(() => ({ select: selectMock })),
      })),
    }));

    const { GET } = await import('@/app/api/profile/route');
    return GET;
  }

  it('returns 401 when not authenticated', async () => {
    const GET = await loadGetRoute({ authed: false });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ dbError: true });
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns profile with email on success', async () => {
    const GET = await loadGetRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { id: string; email: string; role: string; full_name: string };
    expect(json.id).toBe('user-1');
    expect(json.email).toBe('ivan@example.com');
    expect(json.role).toBe('investor');
    expect(json.full_name).toBe('Иван Петров');
  });
});

// ─── PATCH /api/profile ──────────────────────────────────────────────────────

describe('T116 PATCH /api/profile', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadPatchRoute(options?: {
    authed?: boolean;
    updateData?: Record<string, unknown> | null;
    dbError?: boolean;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const updateData = options?.updateData !== undefined
      ? options.updateData
      : { id: 'user-1', role: 'investor', full_name: 'Новое Имя', is_active: true, created_at: '2026-01-01T00:00:00Z' };

    const singleMock = jest.fn(async () => ({
      data: updateData,
      error: options?.dbError ? { message: 'update error' } : null,
    }));
    const selectAfterUpdate = jest.fn(() => ({ single: singleMock }));
    const eqMock = jest.fn(() => ({ select: selectAfterUpdate }));
    const updateMock = jest.fn(() => ({ eq: eqMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1', email: 'ivan@example.com' } : null },
          })),
        },
        from: jest.fn(() => ({ update: updateMock })),
      })),
    }));

    const { PATCH } = await import('@/app/api/profile/route');
    return PATCH;
  }

  it('returns 401 when not authenticated', async () => {
    const PATCH = await loadPatchRoute({ authed: false });
    const res = await PATCH(makePatchRequest('/api/profile', { full_name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when full_name is missing', async () => {
    const PATCH = await loadPatchRoute();
    const res = await PATCH(makePatchRequest('/api/profile', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when full_name is empty string', async () => {
    const PATCH = await loadPatchRoute();
    const res = await PATCH(makePatchRequest('/api/profile', { full_name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    const PATCH = await loadPatchRoute({ dbError: true });
    const res = await PATCH(makePatchRequest('/api/profile', { full_name: 'Новое Имя' }));
    expect(res.status).toBe(500);
  });

  it('returns updated profile on success', async () => {
    const PATCH = await loadPatchRoute();
    const res = await PATCH(makePatchRequest('/api/profile', { full_name: 'Новое Имя' }));
    expect(res.status).toBe(200);
    const json = await res.json() as { full_name: string; email: string };
    expect(json.full_name).toBe('Новое Имя');
    expect(json.email).toBe('ivan@example.com');
  });
});

// ─── GET /api/profile/notification-preferences ───────────────────────────────

describe('T116 GET /api/profile/notification-preferences', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadGetPrefRoute(options?: {
    authed?: boolean;
    prefData?: { email_enabled: boolean } | null;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const prefData = options?.prefData !== undefined ? options.prefData : { email_enabled: true };

    const singleMock = jest.fn(async () => ({ data: prefData, error: null }));
    const eqMock = jest.fn(() => ({ single: singleMock }));
    const selectMock = jest.fn(() => ({ eq: eqMock }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
        },
      })),
    }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({ select: selectMock })),
      })),
    }));

    const { GET } = await import('@/app/api/profile/notification-preferences/route');
    return GET;
  }

  it('returns 401 when not authenticated', async () => {
    const GET = await loadGetPrefRoute({ authed: false });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns email_enabled: true when no preference row exists', async () => {
    const GET = await loadGetPrefRoute({ prefData: null });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { email_enabled: boolean };
    expect(json.email_enabled).toBe(true);
  });

  it('returns stored email_enabled value', async () => {
    const GET = await loadGetPrefRoute({ prefData: { email_enabled: false } });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json() as { email_enabled: boolean };
    expect(json.email_enabled).toBe(false);
  });
});

// ─── PATCH /api/profile/notification-preferences ─────────────────────────────

describe('T116 PATCH /api/profile/notification-preferences', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadPatchPrefRoute(options?: {
    authed?: boolean;
    upsertError?: boolean;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;

    const upsertMock = jest.fn(async () => ({
      error: options?.upsertError ? { message: 'upsert error' } : null,
    }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
        },
      })),
    }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({ upsert: upsertMock })),
      })),
    }));

    const { PATCH } = await import('@/app/api/profile/notification-preferences/route');
    return PATCH;
  }

  it('returns 401 when not authenticated', async () => {
    const PATCH = await loadPatchPrefRoute({ authed: false });
    const res = await PATCH(makePatchRequest('/api/profile/notification-preferences', { email_enabled: true }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when email_enabled is not boolean', async () => {
    const PATCH = await loadPatchPrefRoute();
    const res = await PATCH(makePatchRequest('/api/profile/notification-preferences', { email_enabled: 'yes' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on upsert error', async () => {
    const PATCH = await loadPatchPrefRoute({ upsertError: true });
    const res = await PATCH(makePatchRequest('/api/profile/notification-preferences', { email_enabled: false }));
    expect(res.status).toBe(500);
  });

  it('returns ok:true with email_enabled on success', async () => {
    const PATCH = await loadPatchPrefRoute();
    const res = await PATCH(makePatchRequest('/api/profile/notification-preferences', { email_enabled: false }));
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean; email_enabled: boolean };
    expect(json.ok).toBe(true);
    expect(json.email_enabled).toBe(false);
  });
});

// ─── POST /api/profile/password ──────────────────────────────────────────────

describe('T116 POST /api/profile/password', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadPostPasswordRoute(options?: {
    authed?: boolean;
    updateError?: boolean;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
          updateUser: jest.fn(async () => ({
            error: options?.updateError ? { message: 'auth error' } : null,
          })),
        },
      })),
    }));

    const { POST } = await import('@/app/api/profile/password/route');
    return POST;
  }

  it('returns 401 when not authenticated', async () => {
    const POST = await loadPostPasswordRoute({ authed: false });
    const res = await POST(makePostRequest('/api/profile/password', { new_password: 'newpassword123' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when new_password is missing', async () => {
    const POST = await loadPostPasswordRoute();
    const res = await POST(makePostRequest('/api/profile/password', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when new_password is shorter than 8 characters', async () => {
    const POST = await loadPostPasswordRoute();
    const res = await POST(makePostRequest('/api/profile/password', { new_password: 'short' }));
    expect(res.status).toBe(400);
  });

  it('returns 500 on auth updateUser error', async () => {
    const POST = await loadPostPasswordRoute({ updateError: true });
    const res = await POST(makePostRequest('/api/profile/password', { new_password: 'newpassword123' }));
    expect(res.status).toBe(500);
  });

  it('returns ok:true on success', async () => {
    const POST = await loadPostPasswordRoute();
    const res = await POST(makePostRequest('/api/profile/password', { new_password: 'newpassword123' }));
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
```

---

## Ограничения

- НЕ трогать `app/api/profile/route.ts` — только тестируем
- НЕ трогать `app/api/profile/notification-preferences/route.ts` — только тестируем
- НЕ трогать `app/api/profile/password/route.ts` — только тестируем
- НЕ трогать `types/index.ts`, `middleware.ts`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t116.test.ts` | СОЗДАТЬ — тесты для пяти хэндлеров profile API |

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
3. `npm test` — новые тесты проходят (минимум 20 тестов в t116)
4. Существующие тесты (~126 тестов) не сломаны
5. Записать в progress.md: `DONE: T116` + что создано

---

## Формат отчёта

```
DONE: T116
- создан __tests__/t116.test.ts: 20 тестов для GET /api/profile, PATCH /api/profile, GET /api/profile/notification-preferences, PATCH /api/profile/notification-preferences, POST /api/profile/password
```
