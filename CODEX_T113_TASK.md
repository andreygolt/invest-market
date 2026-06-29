# T113 — Apply flow: slate-тема для анкеты + тесты API

## Цель

Два связанных улучшения:

1. `app/apply/questionnaire/page.tsx` создавался в рамках T103/T110 **до** финальной
   миграции slate-темы (T108), поэтому `<select>` и `<textarea>` используют
   `border-gray-300` вместо `border-slate-200`. Нужно привести в соответствие с остальным
   приложением.

2. API-маршруты `POST /api/apply` и `PATCH /api/projects/[projectId]/questionnaire` созданы
   в T103/T110, но тестов не имеют. Нужно добавить `__tests__/t113.test.ts`.

---

## Контекст

- `app/apply/page.tsx` — уже на slate-теме, не трогать
- `app/apply/done/page.tsx` — уже на slate-теме, не трогать
- `app/apply/questionnaire/page.tsx` — **3 элемента** со старыми `border-gray-300` классами
- `app/api/apply/route.ts` — POST, создаёт запись в `users` и `projects`
- `app/api/projects/[projectId]/questionnaire/route.ts` — PATCH, сохраняет анкету

---

## Шаг 1 — Обновить `app/apply/questionnaire/page.tsx`

**ОБЯЗАТЕЛЬНО прочитать файл перед изменением.**

Заменить только классы `border-gray-300` и `focus:ring-gray-400` в трёх элементах:

### Два `<select>` и один `<textarea>` (описание проекта):

```tsx
// Было (для каждого из трёх):
className="... border border-gray-300 ... focus:ring-2 focus:ring-gray-400"

// Стало:
className="... border border-slate-200 ... focus:ring-2 focus:ring-slate-300"
```

Точные замены для каждого элемента:

**select#industry (строка ~87):**
```tsx
className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
```

**select#stage (строка ~107):**
```tsx
className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
```

**textarea#description (строка ~127):**
```tsx
className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
```

**textarea#useOfFunds (строка ~155):**
```tsx
className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
```

> Примечание: может быть 4 элемента (2 select + 2 textarea). Читай файл и заменяй все `border-gray-300` и `focus:ring-gray-400`.

---

## Шаг 2 — Создать `__tests__/t113.test.ts`

Два describe-блока:
1. `T113 POST /api/apply` — тесты для `app/api/apply/route.ts`
2. `T113 PATCH /api/projects/[projectId]/questionnaire` — тесты для `app/api/projects/[projectId]/questionnaire/route.ts`

```typescript
// __tests__/t113.test.ts

// ─── helpers ────────────────────────────────────────────────────────────────

function makeApplyRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makeQuestionnaireRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/projects/proj-1/questionnaire', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

const VALID_QUESTIONNAIRE = {
  industry: 'Финтех',
  stage: 'seed',
  description: 'a'.repeat(100),
  raiseAmount: '5 000 000 ₽',
  useOfFunds: 'На разработку продукта и маркетинг.',
  teamSize: 5,
  website: 'https://example.com',
};

// ─── /api/apply ─────────────────────────────────────────────────────────────

describe('T113 POST /api/apply', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadApplyRoute(options?: {
    userError?: boolean;
    projectError?: boolean;
    projectId?: string;
  }) {
    jest.resetModules();

    const projectId = options?.projectId ?? 'project-uuid';

    const usersUpsert = jest.fn(async () => ({
      error: options?.userError ? { message: 'user error' } : null,
    }));

    const projectsSingle = jest.fn(async () => ({
      data: options?.projectError ? null : { id: projectId },
      error: options?.projectError ? { message: 'project error' } : null,
    }));
    const projectsSelect = jest.fn(() => ({ single: projectsSingle }));
    const projectsInsert = jest.fn(() => ({ select: projectsSelect }));

    const mockFrom = jest.fn((table: string) => {
      if (table === 'users') return { upsert: usersUpsert };
      if (table === 'projects') return { insert: projectsInsert };
      return {};
    });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({ from: mockFrom })),
    }));

    const { POST } = await import('@/app/api/apply/route');
    return { POST, mockFrom, usersUpsert, projectsInsert };
  }

  it('returns 400 when body is missing userId', async () => {
    const { POST } = await loadApplyRoute();
    const req = makeApplyRequest({ email: 'a@b.com', companyName: 'Acme' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing email', async () => {
    const { POST } = await loadApplyRoute();
    const req = makeApplyRequest({ userId: 'uid', companyName: 'Acme' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing companyName', async () => {
    const { POST } = await loadApplyRoute();
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com' });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 500 when users upsert fails', async () => {
    const { POST } = await loadApplyRoute({ userError: true });
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns 500 when projects insert fails', async () => {
    const { POST } = await loadApplyRoute({ projectError: true });
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it('returns projectId on success', async () => {
    const { POST } = await loadApplyRoute({ projectId: 'proj-abc' });
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json() as { projectId: string };
    expect(json.projectId).toBe('proj-abc');
  });

  it('inserts project with status draft', async () => {
    const { POST, projectsInsert } = await loadApplyRoute();
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    await POST(req);
    expect(projectsInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft' })
    );
  });

  it('upserts user with role project and is_active false', async () => {
    const { POST, usersUpsert } = await loadApplyRoute();
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    await POST(req);
    expect(usersUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'project', is_active: false })
    );
  });
});

// ─── /api/projects/[projectId]/questionnaire ────────────────────────────────

describe('T113 PATCH /api/projects/[projectId]/questionnaire', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/supabase/server');
  });

  async function loadQuestionnaireRoute(options?: {
    authed?: boolean;
    projectOwnerId?: string;
    projectNotFound?: boolean;
    upsertError?: boolean;
  }) {
    jest.resetModules();

    const authed = options?.authed ?? true;
    const projectOwnerId = options?.projectOwnerId ?? 'user-1';

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: authed ? { id: 'user-1' } : null },
          })),
        },
      })),
    }));

    const projectMaybeSingle = jest.fn(async () => ({
      data: options?.projectNotFound ? null : { id: 'proj-1', owner_id: projectOwnerId },
      error: null,
    }));
    const projectEq = jest.fn(() => ({ maybeSingle: projectMaybeSingle }));
    const projectSelect = jest.fn(() => ({ eq: projectEq }));

    const upsertMock = jest.fn(async () => ({
      error: options?.upsertError ? { message: 'upsert failed' } : null,
    }));

    const mockAdminFrom = jest.fn((table: string) => {
      if (table === 'projects') return { select: projectSelect };
      if (table === 'project_questionnaire') return { upsert: upsertMock };
      return {};
    });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({ from: mockAdminFrom })),
    }));

    const { PATCH } = await import(
      '@/app/api/projects/[projectId]/questionnaire/route'
    );

    return { PATCH, upsertMock };
  }

  const params = Promise.resolve({ projectId: 'proj-1' });

  it('returns 401 when not authenticated', async () => {
    const { PATCH } = await loadQuestionnaireRoute({ authed: false });
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    const res = await PATCH(req, { params });
    expect(res.status).toBe(401);
  });

  it('returns 400 when industry is invalid', async () => {
    const { PATCH } = await loadQuestionnaireRoute();
    const req = makeQuestionnaireRequest({ ...VALID_QUESTIONNAIRE, industry: 'Неверная отрасль' });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when stage is invalid', async () => {
    const { PATCH } = await loadQuestionnaireRoute();
    const req = makeQuestionnaireRequest({ ...VALID_QUESTIONNAIRE, stage: 'wrong_stage' });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 400 when description is too short', async () => {
    const { PATCH } = await loadQuestionnaireRoute();
    const req = makeQuestionnaireRequest({ ...VALID_QUESTIONNAIRE, description: 'short' });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when project not found', async () => {
    const { PATCH } = await loadQuestionnaireRoute({ projectNotFound: true });
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not the project owner', async () => {
    const { PATCH } = await loadQuestionnaireRoute({ projectOwnerId: 'other-user' });
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    const res = await PATCH(req, { params });
    expect(res.status).toBe(403);
  });

  it('returns 500 when upsert fails', async () => {
    const { PATCH } = await loadQuestionnaireRoute({ upsertError: true });
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    const res = await PATCH(req, { params });
    expect(res.status).toBe(500);
  });

  it('returns ok:true on success', async () => {
    const { PATCH } = await loadQuestionnaireRoute();
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json() as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('upserts with section s1', async () => {
    const { PATCH, upsertMock } = await loadQuestionnaireRoute();
    const req = makeQuestionnaireRequest(VALID_QUESTIONNAIRE);
    await PATCH(req, { params });
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ section: 's1', project_id: 'proj-1' }),
      expect.any(Object)
    );
  });
});
```

---

## Ограничения

- Менять ТОЛЬКО `border-gray-300` и `focus:ring-gray-400` → `border-slate-200` и `focus:ring-slate-300`
- НЕ трогать `app/apply/page.tsx` — уже на slate-теме
- НЕ трогать `app/apply/done/page.tsx` — уже на slate-теме
- НЕ трогать `app/api/apply/route.ts` — только тестируем
- НЕ трогать `app/api/projects/[projectId]/questionnaire/route.ts` — только тестируем
- НЕ трогать `types/index.ts`, `middleware.ts`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `app/apply/questionnaire/page.tsx` | ИЗМЕНИТЬ — заменить `border-gray-300` → `border-slate-200`, `focus:ring-gray-400` → `focus:ring-slate-300` |
| `__tests__/t113.test.ts` | СОЗДАТЬ — тесты для `/api/apply` и `/api/projects/[projectId]/questionnaire` |

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
3. В `app/apply/questionnaire/page.tsx` нет классов `border-gray-300` или `focus:ring-gray-400`
4. `npm test` — новые тесты проходят (минимум 15 тестов в t113)
5. Существующие тесты (~80 тестов) не сломаны
6. Записать в progress.md: `DONE: T113` + что создано/изменено

---

## Формат отчёта

```
DONE: T113
- изменён app/apply/questionnaire/page.tsx: border-gray-300 → border-slate-200, focus:ring-gray-400 → focus:ring-slate-300 (4 элемента)
- создан __tests__/t113.test.ts: 15 тестов для POST /api/apply и PATCH /api/projects/[projectId]/questionnaire
```
