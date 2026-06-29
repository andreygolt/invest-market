# T120 — Тесты для manager notes API и manager export API

**Дата:** 2026-06-29
**Текущее кол-во тестов:** ~198 (t1–t80, t113–t119)
**Размер задачи:** M
**Зависимости:** T119 (паттерны моков с двойным supabase-клиентом)

---

## Зачем это нужно

Два блока маршрутов менеджера не покрыты тестами:

1. **Notes API** — менеджеры оставляют внутренние заметки к заявкам инвесторов:
   - `GET /api/manager/applications/[id]/notes` — список заметок с email авторов
   - `POST /api/manager/applications/[id]/notes` — создать заметку
   - `DELETE /api/manager/applications/[id]/notes/[note_id]` — удалить заметку

2. **Export API** — CSV-экспорт заявок для аналитики:
   - `GET /api/manager/export/applications` — экспорт в CSV с фильтрами

Все четыре маршрута используют двойной паттерн аутентификации:
- `createClient()` (server) — для `auth.getUser()`
- `createAdminClient()` — для запросов к БД

Без тестов нельзя гарантировать корректность проверки ролей, логику author-ownership при удалении заметок, и формат CSV-вывода.

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/manager/applications/[id]/notes/route.ts` — GET + POST

**GET** `/api/manager/applications/[id]/notes`
- Требует аутентификации → 401 если нет пользователя
- Требует роли `admin | superadmin | moderator | manager` → 403 если другая роль
- Запрашивает `application_notes` по `application_id`
- Обогащает заметки email авторов через join с `users`
- Возвращает `{ notes: ApplicationNote[] }`

**POST** `/api/manager/applications/[id]/notes`
- 401 если нет пользователя, 403 если нет нужной роли
- Body: `{ content: string }`
- 400 если `content` пустой или длиннее 2000 символов
- INSERT в `application_notes`, возвращает `{ note }` со статусом 201

### `app/api/manager/applications/[id]/notes/[note_id]/route.ts` — DELETE

**DELETE** `/api/manager/applications/[id]/notes/[note_id]`
- 401 если нет пользователя, 403 если нет нужной роли
- Ищет заметку по `note_id` + `application_id` → 404 если не найдена
- 403 если `note.author_id !== user.id` И роль не `superadmin`
- DELETE из `application_notes`
- Возвращает `{ ok: true }`

### `app/api/manager/export/applications/route.ts` — GET CSV

**GET** `/api/manager/export/applications`
- 401 если нет пользователя
- Требует роли `admin | superadmin | manager` → 403 (moderator НЕ имеет доступа)
- Query params: `status`, `project_id`, `date_from`, `date_to` — необязательные фильтры
- Возвращает CSV с заголовками: ID, Проект, Инвестор (email), Статус, Сумма, Инструмент, Сообщение, Причина отклонения, Дата создания
- Content-Type: `text/csv; charset=utf-8`

---

## Создать `__tests__/t120.test.ts`

```typescript
// __tests__/t120.test.ts

// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

function makePostRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makeDeleteRequest(url: string) {
  return new Request(url, { method: 'DELETE' }) as import('next/server').NextRequest;
}

// ─── mock builder ────────────────────────────────────────────────────────────
// Notes и Export используют двойной паттерн:
//   createClient() → supabase.auth.getUser()
//   createAdminClient() → DB queries

function buildAuthMocks(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId ?? 'user-staff-1';
  const role = options.role ?? 'manager';

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId } : null },
        })),
      },
    })),
  }));

  return { userId, role };
}

// ─── GET /api/manager/applications/[id]/notes ─────────────────────────────

describe('T120 GET /api/manager/applications/[id]/notes', () => {
  const params = Promise.resolve({ id: 'app-42' });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadGetNotesRoute(options?: {
    userId?: string | null;
    role?: string | null;
    notes?: unknown[];
    dbError?: boolean;
  }) {
    jest.resetModules();
    buildAuthMocks({ userId: options?.userId, role: options?.role });

    const role = options?.role ?? 'manager';
    const notes = options?.notes ?? [];

    const orderMock = jest.fn(async () => ({
      data: options?.dbError ? null : notes,
      error: options?.dbError ? { message: 'db error' } : null,
    }));
    const eqAppMock = jest.fn(() => ({ order: orderMock }));
    const selectNotesMock = jest.fn(() => ({ eq: eqAppMock }));

    const profileSingleMock = jest.fn(async () => ({
      data: options?.userId === null ? null : { role },
      error: null,
    }));
    const profileEqMock = jest.fn(() => ({ single: profileSingleMock }));
    const profileSelectMock = jest.fn(() => ({ eq: profileEqMock }));

    const authorInMock = jest.fn(async () => ({ data: [], error: null }));
    const authorSelectMock = jest.fn(() => ({ in: authorInMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') return { select: profileSelectMock };
          if (table === 'application_notes') return { select: selectNotesMock };
          return {};
        }),
      })),
    }));

    const { GET } = await import(
      '@/app/api/manager/applications/[id]/notes/route'
    );
    return GET;
  }

  it('returns 401 when user is not authenticated', async () => {
    const GET = await loadGetNotesRoute({ userId: null });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when user role is not staff', async () => {
    const GET = await loadGetNotesRoute({ role: 'investor' });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetNotesRoute({ dbError: true });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with empty notes array', async () => {
    const GET = await loadGetNotesRoute({ notes: [] });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { notes: unknown[] };
    expect(Array.isArray(json.notes)).toBe(true);
    expect(json.notes.length).toBe(0);
  });

  it('returns 200 with notes including author_email', async () => {
    const GET = await loadGetNotesRoute({
      notes: [
        {
          id: 'note-1',
          application_id: 'app-42',
          author_id: 'user-staff-1',
          content: 'Проверено',
          created_at: '2026-06-29T10:00:00Z',
        },
      ],
    });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { notes: { id: string; content: string }[] };
    expect(json.notes.length).toBe(1);
    expect(json.notes[0].id).toBe('note-1');
    expect(json.notes[0].content).toBe('Проверено');
  });
});

// ─── POST /api/manager/applications/[id]/notes ────────────────────────────

describe('T120 POST /api/manager/applications/[id]/notes', () => {
  const params = Promise.resolve({ id: 'app-42' });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadPostNotesRoute(options?: {
    userId?: string | null;
    role?: string | null;
    insertError?: boolean;
  }) {
    jest.resetModules();
    const userId = options?.userId ?? 'user-staff-1';
    const role = options?.role ?? 'manager';
    buildAuthMocks({ userId, role });

    const insertedNote = {
      id: 'note-new',
      application_id: 'app-42',
      author_id: userId ?? 'user-staff-1',
      content: 'Новая заметка',
      created_at: '2026-06-29T10:00:00Z',
    };

    const profileSingleMock = jest.fn(async () => ({
      data: userId === null ? null : { role },
      error: null,
    }));
    const profileEqMock = jest.fn(() => ({ single: profileSingleMock }));
    const profileSelectMock = jest.fn(() => ({ eq: profileEqMock }));

    const insertSingleMock = jest.fn(async () => ({
      data: options?.insertError ? null : insertedNote,
      error: options?.insertError ? { message: 'insert error' } : null,
    }));
    const insertSelectMock = jest.fn(() => ({ single: insertSingleMock }));
    const insertMock = jest.fn(() => ({ select: insertSelectMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') return { select: profileSelectMock };
          if (table === 'application_notes') return { insert: insertMock };
          return {};
        }),
      })),
    }));

    const { POST } = await import(
      '@/app/api/manager/applications/[id]/notes/route'
    );
    return POST;
  }

  it('returns 401 when user is not authenticated', async () => {
    const POST = await loadPostNotesRoute({ userId: null });
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', { content: 'ok' }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not staff', async () => {
    const POST = await loadPostNotesRoute({ role: 'project' });
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', { content: 'ok' }),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when content is empty', async () => {
    const POST = await loadPostNotesRoute();
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', { content: '  ' }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when content exceeds 2000 chars', async () => {
    const POST = await loadPostNotesRoute();
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', {
        content: 'x'.repeat(2001),
      }),
      { params }
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on insert error', async () => {
    const POST = await loadPostNotesRoute({ insertError: true });
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', {
        content: 'Заметка',
      }),
      { params }
    );
    expect(res.status).toBe(500);
  });

  it('returns 201 with note on success', async () => {
    const POST = await loadPostNotesRoute();
    const res = await POST(
      makePostRequest('http://localhost/api/manager/applications/app-42/notes', {
        content: 'Новая заметка',
      }),
      { params }
    );
    expect(res.status).toBe(201);
    const json = await res.json() as { note: { id: string; content: string } };
    expect(json.note.id).toBe('note-new');
    expect(json.note.content).toBe('Новая заметка');
  });
});

// ─── DELETE /api/manager/applications/[id]/notes/[note_id] ───────────────

describe('T120 DELETE /api/manager/applications/[id]/notes/[note_id]', () => {
  const params = Promise.resolve({ id: 'app-42', note_id: 'note-1' });

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadDeleteNoteRoute(options?: {
    userId?: string | null;
    role?: string | null;
    noteAuthorId?: string | null;
    noteFound?: boolean;
    deleteError?: boolean;
  }) {
    jest.resetModules();
    const userId = options?.userId ?? 'user-staff-1';
    const role = options?.role ?? 'manager';
    buildAuthMocks({ userId, role });

    const noteFound = options?.noteFound ?? true;
    const noteAuthorId = options?.noteAuthorId ?? userId ?? 'user-staff-1';

    const profileSingleMock = jest.fn(async () => ({
      data: userId === null ? null : { role },
      error: null,
    }));
    const profileEqMock = jest.fn(() => ({ single: profileSingleMock }));
    const profileSelectMock = jest.fn(() => ({ eq: profileEqMock }));

    const noteSingleMock = jest.fn(async () => ({
      data: noteFound ? { id: 'note-1', author_id: noteAuthorId } : null,
      error: null,
    }));
    const noteEqAppMock = jest.fn(() => ({ single: noteSingleMock }));
    const noteEqIdMock = jest.fn(() => ({ eq: noteEqAppMock }));
    const noteSelectMock = jest.fn(() => ({ eq: noteEqIdMock }));

    const deleteEqMock = jest.fn(async () => ({
      error: options?.deleteError ? { message: 'delete error' } : null,
    }));
    const deleteMock = jest.fn(() => ({ eq: deleteEqMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') return { select: profileSelectMock };
          if (table === 'application_notes') return { select: noteSelectMock, delete: deleteMock };
          return {};
        }),
      })),
    }));

    const { DELETE } = await import(
      '@/app/api/manager/applications/[id]/notes/[note_id]/route'
    );
    return DELETE;
  }

  it('returns 401 when user is not authenticated', async () => {
    const DELETE = await loadDeleteNoteRoute({ userId: null });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is not staff', async () => {
    const DELETE = await loadDeleteNoteRoute({ role: 'investor' });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when note not found', async () => {
    const DELETE = await loadDeleteNoteRoute({ noteFound: false });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not author and not superadmin', async () => {
    const DELETE = await loadDeleteNoteRoute({
      userId: 'user-staff-1',
      role: 'manager',
      noteAuthorId: 'another-user',
    });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('allows superadmin to delete any note', async () => {
    const DELETE = await loadDeleteNoteRoute({
      userId: 'superadmin-1',
      role: 'superadmin',
      noteAuthorId: 'another-user',
    });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 500 on delete error', async () => {
    const DELETE = await loadDeleteNoteRoute({ deleteError: true });
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(500);
  });

  it('returns ok:true when author deletes own note', async () => {
    const DELETE = await loadDeleteNoteRoute();
    const res = await DELETE(
      makeDeleteRequest('http://localhost/api/manager/applications/app-42/notes/note-1'),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

// ─── GET /api/manager/export/applications ────────────────────────────────

describe('T120 GET /api/manager/export/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadExportRoute(options?: {
    userId?: string | null;
    role?: string | null;
    rows?: unknown[];
    dbError?: boolean;
  }) {
    jest.resetModules();
    buildAuthMocks({ userId: options?.userId, role: options?.role });

    const role = options?.role ?? 'manager';
    const rows = options?.rows ?? [];

    const profileSingleMock = jest.fn(async () => ({
      data: options?.userId === null ? null : { role },
      error: null,
    }));
    const profileEqMock = jest.fn(() => ({ single: profileSingleMock }));
    const profileSelectMock = jest.fn(() => ({ eq: profileEqMock }));

    // Export uses a chained query builder with optional filters
    const queryResult = {
      data: options?.dbError ? null : rows,
      error: options?.dbError ? { message: 'db error' } : null,
    };

    // The route chains: select → order → [eq|gte|lte] → final await
    // We use a proxy-like mock that returns itself for any chaining method
    // and resolves to queryResult when awaited (then-able).
    const chainable: Record<string, unknown> = {};
    const chainFn = jest.fn(() => chainable);
    chainable.order = chainFn;
    chainable.eq = chainFn;
    chainable.gte = chainFn;
    chainable.lte = chainFn;
    // Make chainable thenable so "await query" resolves to queryResult
    chainable.then = (resolve: (v: typeof queryResult) => void) => resolve(queryResult);

    const appSelectMock = jest.fn(() => chainable);

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') return { select: profileSelectMock };
          if (table === 'investor_applications') return { select: appSelectMock };
          return {};
        }),
      })),
    }));

    const { GET } = await import('@/app/api/manager/export/applications/route');
    return GET;
  }

  it('returns 401 when user is not authenticated', async () => {
    const GET = await loadExportRoute({ userId: null });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator (not in allowed list)', async () => {
    const GET = await loadExportRoute({ role: 'moderator' });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is investor', async () => {
    const GET = await loadExportRoute({ role: 'investor' });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadExportRoute({ dbError: true });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct content-type on success', async () => {
    const GET = await loadExportRoute({ rows: [] });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
    // headers row must always be present
    expect(text).toContain('ID');
    expect(text).toContain('Проект');
    expect(text).toContain('Статус');
  });

  it('returns CSV rows with data when rows exist', async () => {
    const GET = await loadExportRoute({
      rows: [
        {
          id: 'app-1',
          status: 'pending',
          amount: 1000000,
          instrument: 'equity',
          message: 'Интересно',
          created_at: '2026-06-29T10:00:00Z',
          rejection_reason: null,
          projects: { name: 'Tech Fund' },
          users: { email: 'investor@example.com' },
        },
      ],
    });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/export/applications')
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('app-1');
    expect(text).toContain('Tech Fund');
    expect(text).toContain('investor@example.com');
    expect(text).toContain('pending');
  });
});
```

---

## Утилита `escapeCSV` — отдельный тест

Функция `escapeCSV` экспортируется из route.ts и может быть протестирована изолированно:

```typescript
// Добавить в конец файла t120.test.ts

describe('T120 escapeCSV utility', () => {
  it('returns empty string for null', async () => {
    jest.resetModules();
    const { escapeCSV } = await import('@/app/api/manager/export/applications/route');
    expect(escapeCSV(null)).toBe('');
  });

  it('returns empty string for undefined', async () => {
    jest.resetModules();
    const { escapeCSV } = await import('@/app/api/manager/export/applications/route');
    expect(escapeCSV(undefined)).toBe('');
  });

  it('returns plain string unchanged', async () => {
    jest.resetModules();
    const { escapeCSV } = await import('@/app/api/manager/export/applications/route');
    expect(escapeCSV('hello')).toBe('hello');
  });

  it('wraps in quotes when value contains comma', async () => {
    jest.resetModules();
    const { escapeCSV } = await import('@/app/api/manager/export/applications/route');
    expect(escapeCSV('hello, world')).toBe('"hello, world"');
  });

  it('escapes inner double quotes', async () => {
    jest.resetModules();
    const { escapeCSV } = await import('@/app/api/manager/export/applications/route');
    expect(escapeCSV('say "hi"')).toBe('"say ""hi"""');
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t120.test.ts` | СОЗДАТЬ — тесты для notes API и export API |

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
3. `npm test` — новые тесты проходят (минимум 23 теста в t120)
4. Существующие тесты (~198 тестов) не сломаны
5. Записать в progress.md: `DONE: T120` + что создано

---

## Что НЕ трогать

- `app/api/manager/applications/[id]/notes/route.ts`
- `app/api/manager/applications/[id]/notes/[note_id]/route.ts`
- `app/api/manager/export/applications/route.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие тесты

---

## Формат отчёта

```
DONE: T120
- создан __tests__/t120.test.ts: 23 теста для GET/POST /api/manager/applications/[id]/notes, DELETE /api/manager/applications/[id]/notes/[note_id], GET /api/manager/export/applications, escapeCSV
```
