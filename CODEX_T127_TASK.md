# T127 — Тесты для admin/projects API (list, detail, approve, reject)

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~370 (t1–t80, t113–t126)
**Размер задачи:** M
**Зависимости:** T126 (паттерн jest.doMock/jest.resetModules, table-switching mocks)

---

## Зачем это нужно

Четыре маршрута модерации проектов не покрыты тестами:

1. **GET /api/admin/projects** — список проектов на модерацию (статусы submitted/under_review)
2. **GET /api/admin/projects/[id]** — детальная карточка проекта: данные + анкета + AI-отчёт
3. **POST /api/admin/projects/[id]/approve** — одобрение проекта (submitted/under_review → approved)
4. **POST /api/admin/projects/[id]/reject** — отклонение проекта (submitted/under_review → rejected)

**Особенность:** эти маршруты НЕ выполняют auth-проверку внутри route handler — они используют только `createAdminClient()`. Защита осуществляется на уровне middleware. Тесты проверяют бизнес-логику: валидацию входных данных, переходы статусов, DB-ошибки, корректный shape ответа.

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — файлы маршрутов (не трогать)

### `app/api/admin/projects/route.ts` — GET

- `createAdminClient()` → `from('projects').select(…).in('status', ['submitted','under_review']).order('updated_at', {ascending:false})`
- 500 при ошибке DB
- 200 с `{ projects: data ?? [] }`

### `app/api/admin/projects/[id]/route.ts` — GET

- `createAdminClient()` → 3 параллельных запроса (Promise.all):
  1. `from('projects').select(…).eq('id', projectId).maybeSingle()`
  2. `from('project_questionnaire').select('section, answers').eq('project_id', projectId).order('section')`
  3. `from('ai_reports').select('id, status, report, updated_at').eq('project_id', projectId).maybeSingle()`
- 404 если `projectResult.error || !projectResult.data`
- 200 с `{ project, questionnaire: questionnaireResult.data ?? [], ai_report: aiReportResult.data ?? null }`

### `app/api/admin/projects/[id]/approve/route.ts` — POST

- Body: `{ moderator_id?: string }`
- 400 если `!moderatorId`
- `createAdminClient()` → `from('projects').select('id, status, owner_id, name').eq('id', projectId).maybeSingle()`
- 404 если `projectError || !project`
- 400 если `project.status` не в `['submitted', 'under_review']` — текст: `cannot approve project with status: {status}`
- `createAdminClient()` → `from('projects').update({status:'approved', moderated_by, moderated_at, rejection_reason:null, updated_at}).eq('id', projectId)`
- 500 если updateError
- Прямой await: `from('admin_action_log').insert({…})`
- Fire-and-forget (void):
  - `writeAuditLog(…)`
  - `createNotification(…)`
  - `notifyProjectStatus(…)`
  - `notifyInvestorsNewDeal(…)`
- 200 с `{ ok: true, status: 'approved' }`

### `app/api/admin/projects/[id]/reject/route.ts` — POST

- Body: `{ moderator_id?: string, rejection_reason?: string }`
- 400 если `!moderatorId`
- 400 если `!rejectionReason || rejectionReason.trim().length < 10` — текст: `rejection_reason must be at least 10 characters`
- `createAdminClient()` → `from('projects').select('id, status, owner_id, name').eq('id', projectId).maybeSingle()`
- 404 если `projectError || !project`
- 400 если `project.status` не в `['submitted', 'under_review']` — текст: `cannot reject project with status: {status}`
- `createAdminClient()` → `from('projects').update({status:'rejected', moderated_by, moderated_at, rejection_reason, updated_at}).eq('id', projectId)`
- 500 если updateError
- Прямой await: `from('admin_action_log').insert({…})`
- Fire-and-forget (void):
  - `writeAuditLog(…)`
  - `createNotification(…)`
  - `notifyProjectStatus(…)`
- 200 с `{ ok: true, status: 'rejected' }`

---

## Создать `__tests__/t127.test.ts`

```typescript
// __tests__/t127.test.ts

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

// ─── GET /api/admin/projects ──────────────────────────────────────────────────

describe('T127 GET /api/admin/projects', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  type ProjectRow = {
    id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
    moderated_at: string | null;
    rejection_reason: string | null;
    owner_id: string;
  };

  function makeListMock(options: { dbError?: boolean; rows?: ProjectRow[] }) {
    jest.resetModules();

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            in: jest.fn(() => ({
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

  it('returns 500 on DB error', async () => {
    makeListMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with empty array when no projects', async () => {
    makeListMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toEqual([]);
  });

  it('returns 200 with projects list', async () => {
    makeListMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Тест Проект',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].name).toBe('Тест Проект');
    expect(json.projects[0].status).toBe('submitted');
  });

  it('returns 200 with projects of both submitted and under_review status', async () => {
    makeListMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Submitted Project',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        },
        {
          id: 'proj-2',
          name: 'Under Review Project',
          status: 'under_review',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-11T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-2',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toHaveLength(2);
  });
});

// ─── GET /api/admin/projects/[id] ────────────────────────────────────────────

describe('T127 GET /api/admin/projects/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeDetailMock(options: {
    projectError?: boolean;
    notFound?: boolean;
    questionnaireRows?: Array<{ section: string; answers: Record<string, unknown> }>;
    aiReport?: { id: string; status: string; report: unknown; updated_at: string } | null;
  }) {
    jest.resetModules();

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          name: 'Тест Проект',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_by: null,
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        };

    const questionnaireRows = options.questionnaireRows ?? [];
    const aiReport = options.aiReport !== undefined ? options.aiReport : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: options.projectError ? null : projectData,
                    error: options.projectError ? { message: 'project error' } : null,
                  })),
                })),
              })),
            };
          }
          if (table === 'project_questionnaire') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(async () => ({
                    data: questionnaireRows,
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'ai_reports') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: aiReport,
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

  it('returns 404 when project not found', async () => {
    makeDetailMock({ notFound: true });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/missing-1'),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when project DB error', async () => {
    makeDetailMock({ projectError: true });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with project, empty questionnaire, null ai_report', async () => {
    makeDetailMock({});
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      project: { id: string; name: string };
      questionnaire: unknown[];
      ai_report: unknown | null;
    };
    expect(json.project.id).toBe('proj-1');
    expect(json.project.name).toBe('Тест Проект');
    expect(json.questionnaire).toEqual([]);
    expect(json.ai_report).toBeNull();
  });

  it('returns 200 with questionnaire sections and ai_report', async () => {
    makeDetailMock({
      questionnaireRows: [
        { section: 's1', answers: { company_name: 'ООО Тест' } },
        { section: 's2', answers: { revenue: 10000000 } },
      ],
      aiReport: {
        id: 'report-1',
        status: 'done',
        report: { score: 85 },
        updated_at: '2026-06-15T00:00:00Z',
      },
    });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      project: { id: string };
      questionnaire: Array<{ section: string }>;
      ai_report: { id: string; status: string } | null;
    };
    expect(json.questionnaire).toHaveLength(2);
    expect(json.questionnaire[0].section).toBe('s1');
    expect(json.ai_report?.id).toBe('report-1');
    expect(json.ai_report?.status).toBe('done');
  });
});

// ─── POST /api/admin/projects/[id]/approve ────────────────────────────────────

describe('T127 POST /api/admin/projects/[id]/approve', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
    jest.dontMock('@/lib/notifications/notify-investors-new-deal');
  });

  function makeApproveMock(options: {
    notFound?: boolean;
    projectStatus?: string;
    updateError?: boolean;
  }) {
    jest.resetModules();

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-status', () => ({
      notifyProjectStatus: jest.fn(),
    }));
    jest.doMock('@/lib/notifications/notify-investors-new-deal', () => ({
      notifyInvestorsNewDeal: jest.fn(),
    }));

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          status: options.projectStatus ?? 'submitted',
          owner_id: 'owner-1',
          name: 'Тест Проект',
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: projectData,
                    error: options.notFound ? { message: 'not found' } : null,
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
          if (table === 'admin_action_log') {
            return {
              insert: jest.fn(async () => ({ data: null, error: null })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 400 when moderator_id is missing', async () => {
    makeApproveMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {}),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('moderator_id');
  });

  it('returns 404 when project not found', async () => {
    makeApproveMock({ notFound: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/missing-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when project status is already approved', async () => {
    makeApproveMock({ projectStatus: 'approved' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('cannot approve project with status: approved');
  });

  it('returns 400 when project status is draft', async () => {
    makeApproveMock({ projectStatus: 'draft' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makeApproveMock({ updateError: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true, status: approved } for submitted project', async () => {
    makeApproveMock({ projectStatus: 'submitted' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });

  it('returns 200 for under_review project', async () => {
    makeApproveMock({ projectStatus: 'under_review' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });
});

// ─── POST /api/admin/projects/[id]/reject ────────────────────────────────────

describe('T127 POST /api/admin/projects/[id]/reject', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  function makeRejectMock(options: {
    notFound?: boolean;
    projectStatus?: string;
    updateError?: boolean;
  }) {
    jest.resetModules();

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-status', () => ({
      notifyProjectStatus: jest.fn(),
    }));

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          status: options.projectStatus ?? 'submitted',
          owner_id: 'owner-1',
          name: 'Тест Проект',
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: projectData,
                    error: options.notFound ? { message: 'not found' } : null,
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
          if (table === 'admin_action_log') {
            return {
              insert: jest.fn(async () => ({ data: null, error: null })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 400 when moderator_id is missing', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        rejection_reason: 'Недостаточно информации',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('moderator_id');
  });

  it('returns 400 when rejection_reason is missing', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('rejection_reason must be at least 10 characters');
  });

  it('returns 400 when rejection_reason is shorter than 10 characters', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Коротко',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('rejection_reason must be at least 10 characters');
  });

  it('returns 404 when project not found', async () => {
    makeRejectMock({ notFound: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/missing-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when project status is already rejected', async () => {
    makeRejectMock({ projectStatus: 'rejected' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('cannot reject project with status: rejected');
  });

  it('returns 400 when project status is approved', async () => {
    makeRejectMock({ projectStatus: 'approved' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makeRejectMock({ updateError: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true, status: rejected } for submitted project', async () => {
    makeRejectMock({ projectStatus: 'submitted' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });

  it('returns 200 for under_review project', async () => {
    makeRejectMock({ projectStatus: 'under_review' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Проект не соответствует требованиям платформы',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t127.test.ts` | СОЗДАТЬ — тесты для admin/projects (GET list, GET [id], POST approve, POST reject) |

Больше ничего не трогать.

---

## Ключевые особенности моков

### Нет auth-проверки в route handler

Эти маршруты НЕ вызывают `createClient()` для auth. Мок нужен только для `createAdminClient()`. Не мокировать `@/lib/supabase/server`.

### GET /api/admin/projects — прямая цепочка `.in().order()`

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn(() => ({
          order: jest.fn(async () => ({ data: rows, error: null })),
        })),
      })),
    })),
  })),
}));
```

### GET /api/admin/projects/[id] — table-switching mock (3 таблицы)

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return { select: /* .eq().maybeSingle() */ };
      }
      if (table === 'project_questionnaire') {
        return { select: /* .eq().order() */ };
      }
      if (table === 'ai_reports') {
        return { select: /* .eq().maybeSingle() */ };
      }
      return {};
    }),
  })),
}));
```

### POST approve/reject — table-switching mock (projects + admin_action_log)

```typescript
jest.doMock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: jest.fn(() => ({ eq: jest.fn(() => ({ maybeSingle: jest.fn(async () => ({ data: projectData, error: null })) })) })),
          update: jest.fn(() => ({ eq: jest.fn(async () => ({ error: null })) })),
        };
      }
      if (table === 'admin_action_log') {
        return { insert: jest.fn(async () => ({ data: null, error: null })) };
      }
      return {};
    }),
  })),
}));
```

### Fire-and-forget зависимости (approve)

```typescript
jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
jest.doMock('@/lib/notifications/notify-project-status', () => ({ notifyProjectStatus: jest.fn() }));
jest.doMock('@/lib/notifications/notify-investors-new-deal', () => ({ notifyInvestorsNewDeal: jest.fn() }));
```

### Fire-and-forget зависимости (reject — без notifyInvestorsNewDeal)

```typescript
jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
jest.doMock('@/lib/notifications/notify-project-status', () => ({ notifyProjectStatus: jest.fn() }));
```

---

## Правила переходов статусов проекта

```
approve: только из ['submitted', 'under_review'] → 'approved'
  - 'draft'     → 400 cannot approve project with status: draft
  - 'approved'  → 400 cannot approve project with status: approved
  - 'rejected'  → 400 cannot approve project with status: rejected

reject:  только из ['submitted', 'under_review'] → 'rejected'
  - 'draft'     → 400 cannot reject project with status: draft
  - 'approved'  → 400 cannot reject project with status: approved
  - 'rejected'  → 400 cannot reject project with status: rejected
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
3. `npm test` — все тесты в `t127.test.ts` проходят (минимум 22 теста)
4. Существующие тесты (~370 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T127` + отчёт в формате ниже

---

## Что НЕ трогать

- `app/api/admin/projects/route.ts`
- `app/api/admin/projects/[id]/route.ts`
- `app/api/admin/projects/[id]/approve/route.ts`
- `app/api/admin/projects/[id]/reject/route.ts`
- `lib/audit/log.ts`
- `lib/notifications/create.ts`
- `lib/notifications/notify-project-status.ts`
- `lib/notifications/notify-investors-new-deal.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t126)

---

## Формат отчёта

```
REVIEWED: T127
- создан __tests__/t127.test.ts: 22 теста для GET /api/admin/projects (4 — DB error, пустой список, список с проектами), GET /api/admin/projects/[id] (4 — not found, project error, пустая анкета/null ai_report, с данными), POST /api/admin/projects/[id]/approve (7 — missing moderator_id, not found, invalid status approved/draft, update error, submitted→approved, under_review→approved), POST /api/admin/projects/[id]/reject (9 — missing moderator_id, missing/short rejection_reason, not found, invalid status rejected/approved, update error, submitted→rejected, under_review→rejected)
```
