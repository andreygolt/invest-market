# T128 — Тесты для project cabinet API (my, status-log, stats, updates)

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~393 (t1–t80, t113–t127)
**Размер задачи:** M
**Зависимости:** T127 (паттерн jest.doMock/jest.resetModules, table-switching mocks)

---

## Зачем это нужно

Семь обработчиков кабинета проекта не покрыты тестами:

1. **GET /api/project/my** — получить собственный проект владельца
2. **POST /api/project/my** — создать проект (если не существует) или вернуть существующий
3. **GET /api/project/status-log** — история изменений статуса проекта (только роль `project`)
4. **GET /api/project/stats** — статистика одобренного проекта (favorites, views, applications, portfolio)
5. **GET /api/project/updates** — список обновлений проекта
6. **POST /api/project/updates** — опубликовать обновление (fire-and-forget: AI summary, уведомления)
7. **DELETE /api/project/updates/[id]** — удалить обновление с проверкой владения

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/project/my/route.ts` — GET + POST

**GET**:
- `createClient()` → `auth.getUser()` → 401 если нет user
- `supabase.from('projects').select('*').eq('owner_id', userId).maybeSingle()`
- 200 с `{ project: data ?? null }` (без ошибки при отсутствии проекта)

**POST**:
- `createClient()` → `auth.getUser()` → 401
- Валидация body: `name` обязателен, непустая строка → 400 `"name required"`
- `supabase.from('projects').select('*').eq('owner_id').maybeSingle()` → check existing
- Если existing не null → 200 с `{ project: existing }` (ранний возврат, без создания)
- Иначе: `supabase.from('projects').insert({...}).select().single()`
- 500 при ошибке insert
- 201 с `{ project }`

### `app/api/project/status-log/route.ts` — GET

- `createClient()` → `auth.getUser()` → 401
- `createAdminClient()` → `from('users').select('role').eq('id').single()` → профиль
- Если профиль не найден → 403
- `staffRoles = ['admin','superadmin','moderator','manager']`
- Если роль не `project` и не staff → 403 (investor → 403)
- Если роль `project`:
  - `admin.from('projects').select('id').eq('owner_id').single()` → project
  - Если нет проекта → 200 `{ log: [] }` (ранний возврат)
  - `projectId = project.id`
- Если `projectId === null` (staff роли сюда попадают) → 403
- `admin.from('project_status_log').select(...).eq('project_id').order('changed_at', asc)` → log
- 500 при ошибке DB
- 200 с `{ log: data ?? [] }`

**Важно:** staff-роли (admin, moderator и т.д.) получают 403, так как `projectId` остаётся null — они проходят первую проверку, но не проходят вторую.

### `app/api/project/stats/route.ts` — GET

- `createClient()` → `auth.getUser()` → 401
- `supabase.from('projects').select('id,status').eq('owner_id').maybeSingle<ProjectStatsRow>()`
- 500 при `projectError`
- 404 если `!project`
- 403 если `project.status !== 'approved'`
- `createAdminClient()` → 4 параллельных запроса (Promise.all):
  1. `from('investor_favorites').select('*', { count: 'exact', head: true }).eq('project_id')`
  2. `from('applications').select('status').eq('project_id')`
  3. `from('investor_portfolio').select('*', { count: 'exact', head: true }).eq('project_id')`
  4. `from('deal_room_views').select('investor_id').eq('project_id')`
- 500 если любой запрос вернул error
- 200 с `ProjectStats` (favorites_count, portfolio_count, views_count, unique_viewers, applications{total,pending,approved,rejected,cancelled,withdrawn})

### `app/api/project/updates/route.ts` — GET + POST

**GET**:
- `createClient()` → `auth.getUser()` → 401
- `supabase.from('projects').select('id, name').eq('owner_id').maybeSingle()` → project
- 500 при projectError
- Если нет проекта → 200 `[]` (пустой массив, ранний возврат)
- `supabase.from('project_updates').select('...').eq('project_id').order('created_at', desc)`
- 500 при ошибке
- 200 с массивом `ProjectUpdate[]`

**POST**:
- `createClient()` → `auth.getUser()` → 401
- `validateUpdateBody()`: title обязателен и ≤ 200 символов, body обязателен и ≤ 5000 символов → 400 `"Invalid update"`
- `supabase.from('projects').select('id, name').eq('owner_id').maybeSingle()` → project
- 500 при projectError
- 404 если нет проекта
- `supabase.from('project_updates').insert({...}).select('...').single()` → created
- 500 при ошибке
- Fire-and-forget (void):
  - `generateUpdateSummary(created.id)` из `@/lib/ai/updates`
  - `notifyProjectInvestors(...)` из `@/lib/notifications/notify-project-investors`
  - `notifyProjectUpdate(...)` из `@/lib/notifications/notify-project-update`
- 201 с созданным обновлением

### `app/api/project/updates/[id]/route.ts` — DELETE

- `createClient()` → `auth.getUser()` → 401
- `supabase.from('projects').select('id').eq('owner_id').maybeSingle()` → project
- 500 при projectError
- 404 если нет проекта
- `supabase.from('project_updates').select('id, project_id').eq('id').eq('project_id').maybeSingle()` → update
- 500 при updateError
- 404 если нет update (не принадлежит проекту)
- `supabase.from('project_updates').delete().eq('id').eq('project_id')`
- 500 при ошибке
- 200 с `{ success: true }`

---

## Создать `__tests__/t128.test.ts`

```typescript
// __tests__/t128.test.ts

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

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ─── GET /api/project/my ─────────────────────────────────────────────────────

describe('T128 GET /api/project/my', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type ProjectRow = { id: string; owner_id: string; name: string; status: string };

  function makeGetMyMock(options: { userId?: string | null; project?: ProjectRow | null }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : null;

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
              maybeSingle: jest.fn(async () => ({ data: project, error: null })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetMyMock({ userId: null });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with null when no project exists', async () => {
    makeGetMyMock({ project: null });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: ProjectRow | null };
    expect(json.project).toBeNull();
  });

  it('returns 200 with project when found', async () => {
    makeGetMyMock({
      project: { id: 'proj-1', owner_id: 'user-1', name: 'My Startup', status: 'draft' },
    });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.id).toBe('proj-1');
    expect(json.project.name).toBe('My Startup');
  });
});

// ─── POST /api/project/my ────────────────────────────────────────────────────

describe('T128 POST /api/project/my', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type ProjectRow = { id: string; owner_id: string; name: string; status: string };

  function makePostMyMock(options: {
    userId?: string | null;
    existingProject?: ProjectRow | null;
    insertedProject?: ProjectRow | null;
    insertError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const existing = options.existingProject !== undefined ? options.existingProject : null;
    const inserted = options.insertedProject ?? {
      id: 'new-proj-1',
      owner_id: 'user-1',
      name: 'New Project',
      status: 'draft',
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => {
        let callCount = 0;
        return {
          auth: {
            getUser: jest.fn(async () => ({
              data: { user: userId ? { id: userId } : null },
            })),
          },
          from: jest.fn(() => {
            callCount++;
            if (callCount === 1) {
              // check existing
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: existing, error: null })),
                  })),
                })),
              };
            }
            // insert path
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.insertError ? null : inserted,
                    error: options.insertError ? { message: 'insert error' } : null,
                  })),
                })),
              })),
            };
          }),
        };
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePostMyMock({ userId: null });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'Test' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    makePostMyMock({});
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', {})
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('name required');
  });

  it('returns 400 when name is whitespace only', async () => {
    makePostMyMock({});
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', { name: '   ' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 200 with existing project when project already exists', async () => {
    makePostMyMock({
      existingProject: { id: 'proj-1', owner_id: 'user-1', name: 'Existing', status: 'draft' },
    });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Name' })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.id).toBe('proj-1');
    expect(json.project.name).toBe('Existing');
  });

  it('returns 500 on insert error', async () => {
    makePostMyMock({ insertError: true });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Project' })
    );
    expect(res.status).toBe(500);
  });

  it('returns 201 with new project on success', async () => {
    makePostMyMock({
      insertedProject: { id: 'new-1', owner_id: 'user-1', name: 'New Project', status: 'draft' },
    });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Project' })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.id).toBe('new-1');
    expect(json.project.status).toBe('draft');
  });
});

// ─── GET /api/project/status-log ─────────────────────────────────────────────

describe('T128 GET /api/project/status-log', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type LogRow = {
    id: string;
    project_id: string;
    old_status: string;
    new_status: string;
    changed_at: string;
    changed_by: string;
  };

  function makeStatusLogMock(options: {
    userId?: string | null;
    role?: string | null;
    projectId?: string | null;
    logRows?: LogRow[];
    logError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const role = options.role === undefined ? 'project' : options.role;
    const projectId = options.projectId !== undefined ? options.projectId : 'proj-1';
    const logRows = options.logRows ?? [];

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
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: projectId ? { id: projectId } : null,
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'project_status_log') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(async () => ({
                    data: options.logError ? null : logRows,
                    error: options.logError ? { message: 'db error' } : null,
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

  it('returns 401 when unauthenticated', async () => {
    makeStatusLogMock({ userId: null });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeStatusLogMock({ role: 'investor' });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is admin (projectId stays null for staff)', async () => {
    makeStatusLogMock({ role: 'admin' });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 with empty log when project role user has no project', async () => {
    makeStatusLogMock({ role: 'project', projectId: null });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { log: LogRow[] };
    expect(json.log).toEqual([]);
  });

  it('returns 500 on log DB error', async () => {
    makeStatusLogMock({ role: 'project', logError: true });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with status log for project role', async () => {
    makeStatusLogMock({
      role: 'project',
      logRows: [
        {
          id: 'log-1',
          project_id: 'proj-1',
          old_status: 'draft',
          new_status: 'submitted',
          changed_at: '2026-06-01T10:00:00Z',
          changed_by: 'user-1',
        },
      ],
    });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { log: LogRow[] };
    expect(json.log).toHaveLength(1);
    expect(json.log[0].new_status).toBe('submitted');
  });
});

// ─── GET /api/project/stats ───────────────────────────────────────────────────

describe('T128 GET /api/project/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeStatsMock(options: {
    userId?: string | null;
    projectStatus?: string | null;
    projectError?: boolean;
    parallelError?: boolean;
    appRows?: Array<{ status: string }>;
    viewRows?: Array<{ investor_id: string }>;
    favCount?: number;
    portfolioCount?: number;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const projectStatus = options.projectStatus !== undefined ? options.projectStatus : 'approved';
    const appRows = options.appRows ?? [];
    const viewRows = options.viewRows ?? [];
    const favCount = options.favCount ?? 0;
    const portfolioCount = options.portfolioCount ?? 0;

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
              maybeSingle: jest.fn(async () => ({
                data: options.projectError || !projectStatus
                  ? null
                  : { id: 'proj-1', status: projectStatus },
                error: options.projectError ? { message: 'project error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));

    const parallelError = options.parallelError ? { message: 'parallel error' } : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'investor_favorites') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  count: favCount,
                  data: null,
                  error: parallelError,
                })),
              })),
            };
          }
          if (table === 'applications') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: parallelError ? null : appRows,
                  error: parallelError,
                })),
              })),
            };
          }
          if (table === 'investor_portfolio') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  count: portfolioCount,
                  data: null,
                  error: null,
                })),
              })),
            };
          }
          if (table === 'deal_room_views') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: parallelError ? null : viewRows,
                  error: null,
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
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on project DB error', async () => {
    makeStatsMock({ projectError: true });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 404 when no project found', async () => {
    makeStatsMock({ projectStatus: null });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 403 when project is not approved', async () => {
    makeStatsMock({ projectStatus: 'submitted' });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('project_not_approved');
  });

  it('returns 500 when a parallel query fails', async () => {
    makeStatsMock({ parallelError: true });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with correct stats shape', async () => {
    makeStatsMock({
      favCount: 5,
      portfolioCount: 2,
      viewRows: [
        { investor_id: 'inv-1' },
        { investor_id: 'inv-2' },
        { investor_id: 'inv-1' }, // duplicate — unique_viewers should be 2
      ],
      appRows: [
        { status: 'pending' },
        { status: 'pending' },
        { status: 'approved' },
        { status: 'rejected' },
      ],
    });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      favorites_count: number;
      portfolio_count: number;
      views_count: number;
      unique_viewers: number;
      applications: {
        total: number;
        pending: number;
        approved: number;
        rejected: number;
        cancelled: number;
        withdrawn: number;
      };
    };
    expect(json.favorites_count).toBe(5);
    expect(json.portfolio_count).toBe(2);
    expect(json.views_count).toBe(3);
    expect(json.unique_viewers).toBe(2);
    expect(json.applications.total).toBe(4);
    expect(json.applications.pending).toBe(2);
    expect(json.applications.approved).toBe(1);
    expect(json.applications.rejected).toBe(1);
  });
});

// ─── GET /api/project/updates ─────────────────────────────────────────────────

describe('T128 GET /api/project/updates', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type UpdateRow = {
    id: string;
    project_id: string;
    title: string;
    body: string;
    ai_summary: string | null;
    created_at: string;
    updated_at: string;
  };

  function makeGetUpdatesMock(options: {
    userId?: string | null;
    project?: { id: string; name: string } | null;
    updates?: UpdateRow[];
    updatesError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1', name: 'My Startup' };
    const updates = options.updates ?? [];

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                })),
              })),
            };
          }
          if (table === 'project_updates') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(async () => ({
                    data: options.updatesError ? null : updates,
                    error: options.updatesError ? { message: 'db error' } : null,
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

  it('returns 401 when unauthenticated', async () => {
    makeGetUpdatesMock({ userId: null });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array when no project', async () => {
    makeGetUpdatesMock({ project: null });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as UpdateRow[];
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(0);
  });

  it('returns 500 on updates DB error', async () => {
    makeGetUpdatesMock({ updatesError: true });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with updates list', async () => {
    makeGetUpdatesMock({
      updates: [
        {
          id: 'upd-1',
          project_id: 'proj-1',
          title: 'Новость',
          body: 'Текст обновления',
          ai_summary: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
        },
      ],
    });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as UpdateRow[];
    expect(json).toHaveLength(1);
    expect(json[0].title).toBe('Новость');
  });
});

// ─── POST /api/project/updates ────────────────────────────────────────────────

describe('T128 POST /api/project/updates', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/ai/updates');
    jest.dontMock('@/lib/notifications/notify-project-investors');
    jest.dontMock('@/lib/notifications/notify-project-update');
  });

  type UpdateRow = {
    id: string;
    project_id: string;
    title: string;
    body: string;
    ai_summary: string | null;
    created_at: string;
    updated_at: string;
  };

  function makePostUpdatesMock(options: {
    userId?: string | null;
    project?: { id: string; name: string } | null;
    insertError?: boolean;
    insertedUpdate?: UpdateRow | null;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1', name: 'My Startup' };
    const inserted = options.insertedUpdate ?? {
      id: 'upd-new',
      project_id: 'proj-1',
      title: 'Новость',
      body: 'Текст',
      ai_summary: null,
      created_at: '2026-06-30T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
    };

    jest.doMock('@/lib/ai/updates', () => ({ generateUpdateSummary: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-investors', () => ({
      notifyProjectInvestors: jest.fn(async () => {}),
    }));
    jest.doMock('@/lib/notifications/notify-project-update', () => ({
      notifyProjectUpdate: jest.fn(),
    }));

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                })),
              })),
            };
          }
          if (table === 'project_updates') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.insertError ? null : inserted,
                    error: options.insertError ? { message: 'insert error' } : null,
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

  it('returns 401 when unauthenticated', async () => {
    makePostUpdatesMock({ userId: null });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', {
        title: 'Title',
        body: 'Body text',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', { body: 'Some text' })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Invalid update');
  });

  it('returns 400 when title exceeds 200 chars', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', {
        title: 'A'.repeat(201),
        body: 'Some text',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Title' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when no project found', async () => {
    makePostUpdatesMock({ project: null });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', {
        title: 'Title',
        body: 'Body text',
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on insert error', async () => {
    makePostUpdatesMock({ insertError: true });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', {
        title: 'Title',
        body: 'Body text',
      })
    );
    expect(res.status).toBe(500);
  });

  it('returns 201 with created update on success', async () => {
    makePostUpdatesMock({
      insertedUpdate: {
        id: 'upd-1',
        project_id: 'proj-1',
        title: 'Новость',
        body: 'Текст обновления',
        ai_summary: null,
        created_at: '2026-06-30T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/updates', 'POST', {
        title: 'Новость',
        body: 'Текст обновления',
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; title: string };
    expect(json.id).toBe('upd-1');
    expect(json.title).toBe('Новость');
  });
});

// ─── DELETE /api/project/updates/[id] ────────────────────────────────────────

describe('T128 DELETE /api/project/updates/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeDeleteUpdateMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    projectError?: boolean;
    update?: { id: string; project_id: string } | null;
    updateError?: boolean;
    deleteError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };
    const update = options.update !== undefined ? options.update : { id: 'upd-1', project_id: 'proj-1' };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: {
          getUser: jest.fn(async () => ({
            data: { user: userId ? { id: userId } : null },
          })),
        },
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: project,
                    error: options.projectError ? { message: 'project error' } : null,
                  })),
                })),
              })),
            };
          }
          if (table === 'project_updates') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({
                      data: options.updateError ? null : update,
                      error: options.updateError ? { message: 'update error' } : null,
                    })),
                  })),
                })),
              })),
              delete: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(async () => ({
                    error: options.deleteError ? { message: 'delete error' } : null,
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

  it('returns 401 when unauthenticated', async () => {
    makeDeleteUpdateMock({ userId: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/upd-1'),
      makeContext('upd-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project found', async () => {
    makeDeleteUpdateMock({ project: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/upd-1'),
      makeContext('upd-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on update select error', async () => {
    makeDeleteUpdateMock({ updateError: true });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/upd-1'),
      makeContext('upd-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 404 when update not found or not owned by project', async () => {
    makeDeleteUpdateMock({ update: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/other-upd'),
      makeContext('other-upd')
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on delete DB error', async () => {
    makeDeleteUpdateMock({ deleteError: true });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/upd-1'),
      makeContext('upd-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { success: true } on successful deletion', async () => {
    makeDeleteUpdateMock({});
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/updates/upd-1'),
      makeContext('upd-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t128.test.ts` | СОЗДАТЬ — 33 теста для 7 обработчиков project cabinet API |

Больше ничего не трогать.

---

## Ключевые особенности моков

### GET /project/my — простой mock без table-switching

Единственная цепочка: `.select('*').eq('owner_id').maybeSingle()`.

### POST /project/my — двойной вызов `from('projects')`

Маршрут вызывает `from('projects')` дважды:
1. Проверка существующего проекта (`.select().eq().maybeSingle()`)
2. Создание нового (`.insert().select().single()`)

Мок использует счётчик вызовов (`callCount`) внутри фабрики `createClient`:
```typescript
let callCount = 0;
from: jest.fn(() => {
  callCount++;
  if (callCount === 1) { /* check existing */ }
  return { insert: /* create */ };
})
```

### GET /project/status-log — оба клиента + 3 таблицы в adminClient

- `createClient()` → только auth.getUser()
- `createAdminClient()` → table-switching: `users`, `projects`, `project_status_log`

**Важно:** Admin/staff роли (admin, moderator и т.д.) получают 403, не 200. Только роль `project` может просматривать лог своего проекта.

### GET /project/stats — createClient для проекта, createAdminClient для 4 параллельных запросов

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'investor_favorites') { return { select: /* .eq() → { count, error } */ }; }
      if (table === 'applications') { return { select: /* .eq() → { data: rows, error } */ }; }
      if (table === 'investor_portfolio') { return { select: /* .eq() → { count, error } */ }; }
      if (table === 'deal_room_views') { return { select: /* .eq() → { data: viewRows, error } */ }; }
    }),
  })),
}));
```

Тест `unique_viewers` проверяет дедупликацию через `Set`: 3 записи с 2 уникальными investor_id → `unique_viewers = 2`.

### GET + POST /project/updates — table-switching для `projects` и `project_updates`

Оба обработчика используют один `createClient()`. Мок переключается по таблице:
- `from('projects')` → maybeSingle для поиска проекта
- `from('project_updates')` → order/insert для обновлений

### POST /project/updates — fire-and-forget зависимости

Три модуля вызываются без await:
```typescript
jest.doMock('@/lib/ai/updates', () => ({ generateUpdateSummary: jest.fn() }));
jest.doMock('@/lib/notifications/notify-project-investors', () => ({
  notifyProjectInvestors: jest.fn(async () => {}),
}));
jest.doMock('@/lib/notifications/notify-project-update', () => ({
  notifyProjectUpdate: jest.fn(),
}));
```

### DELETE /project/updates/[id] — тройной `from('project_updates')` с разными цепочками

- select: `.eq('id').eq('project_id').maybeSingle()` (проверка владения)
- delete: `.eq('id').eq('project_id')` (удаление)

Мок возвращает разные объекты для `select` и `delete` ключей одного `from('project_updates')`.

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
3. `npm test` — все тесты в `t128.test.ts` проходят (минимум 33 теста)
4. Существующие тесты (~393 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T128` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/project/my/route.ts`
- `app/api/project/status-log/route.ts`
- `app/api/project/stats/route.ts`
- `app/api/project/updates/route.ts`
- `app/api/project/updates/[id]/route.ts`
- `lib/ai/updates.ts`
- `lib/notifications/notify-project-investors.ts`
- `lib/notifications/notify-project-update.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t127)

---

## Формат отчёта

```
REVIEWED: T128
- создан __tests__/t128.test.ts: 33 теста для GET /api/project/my (3 — 401, null project, found project), POST /api/project/my (6 — 401, 400 no name, 400 empty name, 200 existing, 500 insert error, 201 success), GET /api/project/status-log (6 — 401, 403 investor, 403 admin staff, 200 no project, 500 DB error, 200 with log), GET /api/project/stats (6 — 401, 500 project error, 404 no project, 403 not approved, 500 parallel error, 200 with stats + unique_viewers dedup), GET /api/project/updates (4 — 401, 200 no project empty array, 500 DB error, 200 with updates), POST /api/project/updates (7 — 401, 400 no title, 400 title too long, 400 no body, 404 no project, 500 insert error, 201 success), DELETE /api/project/updates/[id] (6 — 401, 404 no project, 500 select error, 404 update not found, 500 delete error, 200 success)
```
