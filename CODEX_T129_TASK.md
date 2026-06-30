# T129 — Тесты для project cabinet API (questionnaire, documents, video, submit)

**Дата:** 2026-06-30
**Текущее кол-во тестов:** ~426 (t1–t80, t113–t128)
**Размер задачи:** L
**Зависимости:** T128 (паттерн jest.doMock/jest.resetModules, table-switching, callCount)

---

## Зачем это нужно

Шесть групп обработчиков кабинета проекта не покрыты тестами:

1. **GET /api/project/questionnaire** — получить ответы одной секции анкеты
2. **POST /api/project/questionnaire** — сохранить (upsert) ответы секции
3. **GET /api/project/documents** — список загруженных документов проекта
4. **POST /api/project/documents/upload** — загрузить документ в Storage + сохранить запись в БД
5. **DELETE /api/project/documents/[id]** — удалить документ из Storage и БД
6. **POST /api/project/submit** — отправить проект на модерацию (draft/rejected → submitted)
7. **POST /api/project/video** — загрузить вертикальное видео в Storage
8. **DELETE /api/project/video** — удалить видео проекта

---

## Что НЕ делаем в этом этапе

- Не трогаем маршруты (только тестируем)
- Не добавляем новые npm-зависимости
- Не изменяем `types/index.ts`, `middleware.ts`, `progress.md` (кроме итогового отчёта)
- Не трогаем существующие тест-файлы

---

## Контекст — логика маршрутов (не трогать)

### `app/api/project/questionnaire/route.ts` — GET + POST

**GET**:
- `createClient()` → `auth.getUser()` → 401
- `searchParams.get('section')` — если отсутствует или не входит в `['s1'…'s8']` → 400 `"invalid section"`
- `from('projects').select('id').eq('owner_id').maybeSingle()` → если нет проекта → 200 `{ answers: {} }`
- `from('project_questionnaire').select('answers').eq('project_id').eq('section').maybeSingle()` → 200 `{ answers: data?.answers ?? {} }`

**POST**:
- `createClient()` → `auth.getUser()` → 401
- Валидация body: `section` должен быть в `['s1'…'s8']` → 400 `"invalid section"`
- `answers` должны быть объектом → 400 `"answers required"`
- `from('projects').select('id').eq('owner_id').maybeSingle()` → 404 если нет проекта
- `from('project_questionnaire').upsert({...}, { onConflict: 'project_id,section' })` → 500 при ошибке
- 200 `{ ok: true }`

### `app/api/project/documents/route.ts` — GET

- `createClient()` → `auth.getUser()` → 401
- `from('projects').select('id').eq('owner_id').maybeSingle()` → если нет проекта → 200 `{ documents: [] }`
- `from('project_documents').select('*').eq('project_id').order('uploaded_at', desc)` → 200 `{ documents: data ?? [] }`

### `app/api/project/documents/upload/route.ts` — POST

- `createClient()` → `auth.getUser()` → 401
- `from('projects').select('id').eq('owner_id').maybeSingle()` → 404 если нет проекта
- `formData.get('file')` → 400 если нет файла
- `formData.get('doc_type')` — должен быть одним из `['pitch_deck','financial_model','charter','team_cv','legal_docs','other']` → 400 `"invalid doc_type"`
- `file.size > 20MB` → 400 `"file too large (max 20MB)"`
- `!ALLOWED_MIME.includes(file.type)` → 400 `"unsupported file type"`
- `supabase.storage.from('project-docs').upload(...)` → 500 при uploadError
- `from('project_documents').insert({...}).select().single()` → 500 при dbError
- 201 `{ document: doc }`

### `app/api/project/documents/[id]/route.ts` — DELETE

- `createClient()` → `auth.getUser()` → 401
- `from('project_documents').select('storage_path, project_id').eq('id').maybeSingle()` → 404 если `!doc`
- `supabase.storage.from('project-docs').remove([doc.storage_path])` — fire-and-forget
- `from('project_documents').delete().eq('id')` → 500 при ошибке
- 200 `{ ok: true }`

### `app/api/project/submit/route.ts` — POST

- `createClient()` → `auth.getUser()` → 401
- `from('projects').select('id, status, name').eq('owner_id').maybeSingle()` → 404 если нет
- Если `status` не в `['draft','rejected']` → 400 `"project already submitted"`
- `from('project_questionnaire').select('section').eq('project_id')` (без maybeSingle, массив) → если нет `'s1'` → 400 `"questionnaire not filled"`
- `createAdminClient()` → `from('projects').update({status:'submitted',...}).eq('id')` → 500 при updateError
- `adminSupabase.from('project_status_log').insert({...})`
- Fire-and-forget: `notifyModerators(...)`, `notifyProjectStatus(...)`
- Попытка получить staff: `adminSupabase.from('users').select('id').in('role', [...])`
- `global.fetch(...)` для запуска AI extract
- 200 `{ status: 'submitted' }`

### `app/api/project/video/route.ts` — POST + DELETE

**POST**:
- `createClient()` → `auth.getUser()` → 401
- `from('projects').select('id, status').eq('owner_id').maybeSingle()` → 404 если нет проекта
- `formData.get('file')` → 400 если нет файла
- `file.size > 200MB` → 400 `"file too large (max 200MB)"`
- `!ALLOWED_VIDEO_MIME.includes(file.type)` → 400 `"unsupported format (mp4, mov only)"`
- `supabase.storage.from('project-videos').upload(...)` → 500 при uploadError
- `from('projects').update({ video_path }).eq('id')` → 500 при updateError
- 200 `{ video_path }`

**DELETE**:
- `createClient()` → `auth.getUser()` → 401
- `from('projects').select('id, video_path').eq('owner_id').maybeSingle()` → 404 если нет проекта
- Если `!project.video_path` → 404 `"no video"`
- `supabase.storage.from('project-videos').remove([project.video_path])`
- `from('projects').update({ video_path: null }).eq('id')`
- 200 `{ ok: true }`

---

## Создать `__tests__/t129.test.ts`

```typescript
// __tests__/t129.test.ts

import { NextRequest } from 'next/server';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function makeJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** Создаёт мок-запрос с formData для routes, использующих request.formData() */
function makeFormRequest(fields: Record<string, unknown>): NextRequest {
  const mockFormData = {
    get: jest.fn((key: string) => (Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : null)),
  };
  return {
    formData: jest.fn(async () => mockFormData),
  } as unknown as NextRequest;
}

// ─── GET /api/project/questionnaire ──────────────────────────────────────────

describe('T129 GET /api/project/questionnaire', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type QuestRow = { answers: Record<string, unknown> };

  function makeQuestGetMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    questRow?: QuestRow | null;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };
    const questRow = options.questRow !== undefined ? options.questRow : null;

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
          if (table === 'project_questionnaire') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: questRow, error: null })),
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
    makeQuestGetMock({ userId: null });
    const { GET } = await import('@/app/api/project/questionnaire/route');
    const res = await GET(makeGetRequest('http://localhost/api/project/questionnaire?section=s1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when section is missing', async () => {
    makeQuestGetMock({});
    const { GET } = await import('@/app/api/project/questionnaire/route');
    const res = await GET(makeGetRequest('http://localhost/api/project/questionnaire'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('invalid section');
  });

  it('returns 400 when section is invalid value', async () => {
    makeQuestGetMock({});
    const { GET } = await import('@/app/api/project/questionnaire/route');
    const res = await GET(makeGetRequest('http://localhost/api/project/questionnaire?section=s9'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty answers when no project', async () => {
    makeQuestGetMock({ project: null });
    const { GET } = await import('@/app/api/project/questionnaire/route');
    const res = await GET(makeGetRequest('http://localhost/api/project/questionnaire?section=s1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { answers: Record<string, unknown> };
    expect(json.answers).toEqual({});
  });

  it('returns 200 with answers when section found', async () => {
    makeQuestGetMock({ questRow: { answers: { company_name: 'ООО Тест', inn: '1234567890' } } });
    const { GET } = await import('@/app/api/project/questionnaire/route');
    const res = await GET(makeGetRequest('http://localhost/api/project/questionnaire?section=s1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { answers: Record<string, unknown> };
    expect(json.answers.company_name).toBe('ООО Тест');
  });
});

// ─── POST /api/project/questionnaire ─────────────────────────────────────────

describe('T129 POST /api/project/questionnaire', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeQuestPostMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    upsertError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };

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
          if (table === 'project_questionnaire') {
            return {
              upsert: jest.fn(async () => ({
                error: options.upsertError ? { message: 'upsert error' } : null,
              })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeQuestPostMock({ userId: null });
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', {
        section: 's1',
        answers: { company_name: 'ООО Тест' },
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when section is invalid', async () => {
    makeQuestPostMock({});
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', {
        section: 'invalid',
        answers: {},
      })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('invalid section');
  });

  it('returns 400 when answers is missing', async () => {
    makeQuestPostMock({});
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', { section: 's1' })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('answers required');
  });

  it('returns 404 when no project', async () => {
    makeQuestPostMock({ project: null });
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', {
        section: 's1',
        answers: { company_name: 'ООО Тест' },
      })
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on upsert error', async () => {
    makeQuestPostMock({ upsertError: true });
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', {
        section: 's2',
        answers: { revenue: 10000000 },
      })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 ok on success', async () => {
    makeQuestPostMock({});
    const { POST } = await import('@/app/api/project/questionnaire/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', {
        section: 's3',
        answers: { team_size: 5 },
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

// ─── GET /api/project/documents ──────────────────────────────────────────────

describe('T129 GET /api/project/documents', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type DocRow = { id: string; project_id: string; doc_type: string; filename: string; storage_path: string };

  function makeDocGetMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    docs?: DocRow[];
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };
    const docs = options.docs ?? [];

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
          if (table === 'project_documents') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(async () => ({ data: docs, error: null })),
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
    makeDocGetMock({ userId: null });
    const { GET } = await import('@/app/api/project/documents/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty documents when no project', async () => {
    makeDocGetMock({ project: null });
    const { GET } = await import('@/app/api/project/documents/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { documents: DocRow[] };
    expect(json.documents).toEqual([]);
  });

  it('returns 200 with documents list', async () => {
    makeDocGetMock({
      docs: [
        {
          id: 'doc-1',
          project_id: 'proj-1',
          doc_type: 'pitch_deck',
          filename: 'pitch.pdf',
          storage_path: 'proj-1/pitch_deck_123.pdf',
        },
      ],
    });
    const { GET } = await import('@/app/api/project/documents/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { documents: DocRow[] };
    expect(json.documents).toHaveLength(1);
    expect(json.documents[0].doc_type).toBe('pitch_deck');
  });
});

// ─── POST /api/project/documents/upload ──────────────────────────────────────

describe('T129 POST /api/project/documents/upload', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  type DocRow = { id: string; project_id: string; doc_type: string; filename: string; storage_path: string };

  function makeUploadMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    uploadError?: boolean;
    dbError?: boolean;
    insertedDoc?: DocRow | null;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };
    const insertedDoc = options.insertedDoc ?? {
      id: 'doc-new',
      project_id: 'proj-1',
      doc_type: 'pitch_deck',
      filename: 'pitch.pdf',
      storage_path: 'proj-1/pitch_deck_1234.pdf',
    };

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
          if (table === 'project_documents') {
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.dbError ? null : insertedDoc,
                    error: options.dbError ? { message: 'db error' } : null,
                  })),
                })),
              })),
            };
          }
          return {};
        }),
        storage: {
          from: jest.fn(() => ({
            upload: jest.fn(async () => ({
              error: options.uploadError ? { message: 'storage error' } : null,
            })),
          })),
        },
      })),
    }));
  }

  const validFile = {
    size: 1024,
    type: 'application/pdf',
    name: 'pitch.pdf',
    arrayBuffer: jest.fn(async () => new ArrayBuffer(0)),
  };

  it('returns 401 when unauthenticated', async () => {
    makeUploadMock({ userId: null });
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ file: validFile, doc_type: 'pitch_deck' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project', async () => {
    makeUploadMock({ project: null });
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ file: validFile, doc_type: 'pitch_deck' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file', async () => {
    makeUploadMock({});
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ doc_type: 'pitch_deck' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('file required');
  });

  it('returns 400 when doc_type is invalid', async () => {
    makeUploadMock({});
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ file: validFile, doc_type: 'unknown_type' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('invalid doc_type');
  });

  it('returns 400 when file is too large', async () => {
    makeUploadMock({});
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const bigFile = { ...validFile, size: 21 * 1024 * 1024 };
    const res = await POST(makeFormRequest({ file: bigFile, doc_type: 'pitch_deck' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('file too large');
  });

  it('returns 400 when file mime type is unsupported', async () => {
    makeUploadMock({});
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const wrongMimeFile = { ...validFile, type: 'image/png', name: 'photo.png' };
    const res = await POST(makeFormRequest({ file: wrongMimeFile, doc_type: 'other' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('unsupported file type');
  });

  it('returns 500 on storage upload error', async () => {
    makeUploadMock({ uploadError: true });
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ file: validFile, doc_type: 'pitch_deck' }));
    expect(res.status).toBe(500);
  });

  it('returns 201 with document on success', async () => {
    makeUploadMock({
      insertedDoc: {
        id: 'doc-1',
        project_id: 'proj-1',
        doc_type: 'pitch_deck',
        filename: 'pitch.pdf',
        storage_path: 'proj-1/pitch_deck_123.pdf',
      },
    });
    const { POST } = await import('@/app/api/project/documents/upload/route');
    const res = await POST(makeFormRequest({ file: validFile, doc_type: 'pitch_deck' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { document: DocRow };
    expect(json.document.id).toBe('doc-1');
    expect(json.document.doc_type).toBe('pitch_deck');
  });
});

// ─── DELETE /api/project/documents/[id] ──────────────────────────────────────

describe('T129 DELETE /api/project/documents/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeDocDeleteMock(options: {
    userId?: string | null;
    doc?: { storage_path: string; project_id: string } | null;
    deleteError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const doc = options.doc !== undefined ? options.doc : { storage_path: 'proj-1/pitch_deck_1.pdf', project_id: 'proj-1' };

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
              // select doc
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: doc, error: null })),
                  })),
                })),
              };
            }
            // delete doc
            return {
              delete: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.deleteError ? { message: 'delete error' } : null,
                })),
              })),
            };
          }),
          storage: {
            from: jest.fn(() => ({
              remove: jest.fn(async () => ({ error: null })),
            })),
          },
        };
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeDocDeleteMock({ userId: null });
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/documents/doc-1'),
      makeContext('doc-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when document not found', async () => {
    makeDocDeleteMock({ doc: null });
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/documents/missing'),
      makeContext('missing')
    );
    expect(res.status).toBe(404);
  });

  it('returns 500 on delete DB error', async () => {
    makeDocDeleteMock({ deleteError: true });
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/documents/doc-1'),
      makeContext('doc-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 ok on successful deletion', async () => {
    makeDocDeleteMock({});
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/project/documents/doc-1'),
      makeContext('doc-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

// ─── POST /api/project/submit ─────────────────────────────────────────────────

describe('T129 POST /api/project/submit', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-moderators');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  function makeSubmitMock(options: {
    userId?: string | null;
    project?: { id: string; status: string; name: string } | null;
    questionnaireSections?: string[];
    updateError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined
      ? options.project
      : { id: 'proj-1', status: 'draft', name: 'Тест Проект' };
    const sections = options.questionnaireSections ?? ['s1', 's2'];

    jest.doMock('@/lib/notifications/notify-moderators', () => ({
      notifyModerators: jest.fn(async () => {}),
    }));
    jest.doMock('@/lib/notifications/notify-project-status', () => ({
      notifyProjectStatus: jest.fn(),
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
          if (table === 'project_questionnaire') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  data: sections.map((s) => ({ section: s })),
                  error: null,
                })),
              })),
            };
          }
          return {};
        }),
      })),
    }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              update: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.updateError ? { message: 'update error' } : null,
                })),
              })),
            };
          }
          if (table === 'project_status_log') {
            return {
              insert: jest.fn(async () => ({ data: null, error: null })),
            };
          }
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                in: jest.fn(async () => ({ data: [{ id: 'mod-1' }], error: null })),
              })),
            };
          }
          return {};
        }),
      })),
    }));

    // mock global fetch for AI extract fire-and-forget
    global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  }

  it('returns 401 when unauthenticated', async () => {
    makeSubmitMock({ userId: null });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project', async () => {
    makeSubmitMock({ project: null });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(404);
  });

  it('returns 400 when project is already submitted', async () => {
    makeSubmitMock({ project: { id: 'proj-1', status: 'submitted', name: 'Тест' } });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('project already submitted');
  });

  it('returns 400 when questionnaire s1 is not filled', async () => {
    makeSubmitMock({ questionnaireSections: ['s2', 's3'] });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('questionnaire not filled');
  });

  it('returns 500 on DB update error', async () => {
    makeSubmitMock({ updateError: true });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(500);
  });

  it('returns 200 with status submitted on success (draft → submitted)', async () => {
    makeSubmitMock({});
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('submitted');
  });

  it('returns 200 on resubmit (rejected → submitted)', async () => {
    makeSubmitMock({ project: { id: 'proj-1', status: 'rejected', name: 'Тест Проект' } });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit') as NextRequest);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('submitted');
  });
});

// ─── POST /api/project/video ──────────────────────────────────────────────────

describe('T129 POST /api/project/video', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeVideoPostMock(options: {
    userId?: string | null;
    project?: { id: string; status: string } | null;
    uploadError?: boolean;
    updateError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1', status: 'draft' };

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
              // project lookup
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                  })),
                })),
              };
            }
            // update video_path
            return {
              update: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.updateError ? { message: 'update error' } : null,
                })),
              })),
            };
          }),
          storage: {
            from: jest.fn(() => ({
              upload: jest.fn(async () => ({
                error: options.uploadError ? { message: 'storage error' } : null,
              })),
            })),
          },
        };
      }),
    }));
  }

  const validVideoFile = {
    size: 10 * 1024 * 1024, // 10 MB
    type: 'video/mp4',
    name: 'pitch.mp4',
    arrayBuffer: jest.fn(async () => new ArrayBuffer(0)),
  };

  it('returns 401 when unauthenticated', async () => {
    makeVideoPostMock({ userId: null });
    const { POST } = await import('@/app/api/project/video/route');
    const res = await POST(makeFormRequest({ file: validVideoFile }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project', async () => {
    makeVideoPostMock({ project: null });
    const { POST } = await import('@/app/api/project/video/route');
    const res = await POST(makeFormRequest({ file: validVideoFile }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when no file', async () => {
    makeVideoPostMock({});
    const { POST } = await import('@/app/api/project/video/route');
    const res = await POST(makeFormRequest({}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('file required');
  });

  it('returns 400 when file is too large', async () => {
    makeVideoPostMock({});
    const { POST } = await import('@/app/api/project/video/route');
    const bigFile = { ...validVideoFile, size: 201 * 1024 * 1024 };
    const res = await POST(makeFormRequest({ file: bigFile }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('file too large');
  });

  it('returns 400 when video format is unsupported', async () => {
    makeVideoPostMock({});
    const { POST } = await import('@/app/api/project/video/route');
    const wrongFile = { ...validVideoFile, type: 'video/avi', name: 'pitch.avi' };
    const res = await POST(makeFormRequest({ file: wrongFile }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('unsupported format');
  });

  it('returns 500 on storage upload error', async () => {
    makeVideoPostMock({ uploadError: true });
    const { POST } = await import('@/app/api/project/video/route');
    const res = await POST(makeFormRequest({ file: validVideoFile }));
    expect(res.status).toBe(500);
  });

  it('returns 200 with video_path on success', async () => {
    makeVideoPostMock({});
    const { POST } = await import('@/app/api/project/video/route');
    const res = await POST(makeFormRequest({ file: validVideoFile }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { video_path: string };
    expect(typeof json.video_path).toBe('string');
    expect(json.video_path).toContain('proj-1');
  });
});

// ─── DELETE /api/project/video ────────────────────────────────────────────────

describe('T129 DELETE /api/project/video', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeVideoDeleteMock(options: {
    userId?: string | null;
    project?: { id: string; video_path: string | null } | null;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined
      ? options.project
      : { id: 'proj-1', video_path: 'proj-1/pitch_123.mp4' };

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
              // project lookup
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                  })),
                })),
              };
            }
            // update video_path to null
            return {
              update: jest.fn(() => ({
                eq: jest.fn(async () => ({ error: null })),
              })),
            };
          }),
          storage: {
            from: jest.fn(() => ({
              remove: jest.fn(async () => ({ error: null })),
            })),
          },
        };
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeVideoDeleteMock({ userId: null });
    const { DELETE } = await import('@/app/api/project/video/route');
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project', async () => {
    makeVideoDeleteMock({ project: null });
    const { DELETE } = await import('@/app/api/project/video/route');
    const res = await DELETE();
    expect(res.status).toBe(404);
  });

  it('returns 404 when project has no video', async () => {
    makeVideoDeleteMock({ project: { id: 'proj-1', video_path: null } });
    const { DELETE } = await import('@/app/api/project/video/route');
    const res = await DELETE();
    expect(res.status).toBe(404);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('no video');
  });

  it('returns 200 ok on successful deletion', async () => {
    makeVideoDeleteMock({});
    const { DELETE } = await import('@/app/api/project/video/route');
    const res = await DELETE();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
```

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `__tests__/t129.test.ts` | СОЗДАТЬ — ~41 тест для 8 обработчиков project cabinet API |

Больше ничего не трогать.

---

## Ключевые особенности моков

### GET /api/project/questionnaire — требует NextRequest (nextUrl.searchParams)

Роут использует `request.nextUrl.searchParams.get('section')`, поэтому тест **обязан** передавать `new NextRequest(url)`, а не `new Request(url)`. В файле добавлен `import { NextRequest } from 'next/server'` и все запросы создаются через `new NextRequest(url)`.

### Table-switching в questionnaire GET — цепочка `.eq().eq().maybeSingle()`

`project_questionnaire` использует двойной `.eq()`:
```typescript
from: jest.fn((table: string) => {
  if (table === 'project_questionnaire') {
    return {
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(async () => ({ data: questRow, error: null })),
          })),
        })),
      })),
    };
  }
})
```

### FormData mock для upload и video POST — request.formData() как мок-метод

Вместо реального `FormData` создаётся объект с мок-методом `get()`:
```typescript
function makeFormRequest(fields: Record<string, unknown>): NextRequest {
  const mockFormData = {
    get: jest.fn((key: string) => Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : null),
  };
  return { formData: jest.fn(async () => mockFormData) } as unknown as NextRequest;
}
```

Мок-файл содержит `arrayBuffer: jest.fn(async () => new ArrayBuffer(0))` для прохождения `await file.arrayBuffer()`.

### Storage mock — `supabase.storage.from().upload/remove`

Хранилище мокируется как часть клиента:
```typescript
storage: {
  from: jest.fn(() => ({
    upload: jest.fn(async () => ({ error: null })),
    remove: jest.fn(async () => ({ error: null })),
  })),
},
```

### DELETE documents и DELETE video — callCount для двойного вызова `from('projects')` / `from('project_documents')`

Роуты вызывают один и тот же `from(table)` дважды с разными цепочками. Используется счётчик:
```typescript
let callCount = 0;
from: jest.fn(() => {
  callCount++;
  if (callCount === 1) { return { select: /* maybeSingle */ }; }
  return { delete: /* .eq */ };
})
```

### POST /api/project/submit — два клиента + global.fetch

- `createClient()` — auth + from('projects').maybeSingle + from('project_questionnaire') без maybeSingle (возвращает массив напрямую через `.select().eq()`)
- `createAdminClient()` — table-switching: projects (update), project_status_log (insert), users (select.in)
- `global.fetch` мокируется для fire-and-forget вызова AI extract:
  ```typescript
  global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  ```
- `notifyModerators` и `notifyProjectStatus` мокируются через `jest.doMock`

### project_questionnaire в submit — нет maybeSingle

```typescript
const { data: questionnaire } = await supabase
  .from('project_questionnaire')
  .select('section')
  .eq('project_id', project.id);
// data — массив, без .maybeSingle()
```

Мок должен завершать цепочку на `.eq()`:
```typescript
if (table === 'project_questionnaire') {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async () => ({
        data: sections.map((s) => ({ section: s })),
        error: null,
      })),
    })),
  };
}
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
3. `npm test` — все тесты в `t129.test.ts` проходят (минимум 41 тест)
4. Существующие тесты (~426 тестов) не сломаны
5. Добавить в начало `progress.md`: строку `REVIEWED: T129` + отчёт

---

## Что НЕ трогать

- `app/api/project/questionnaire/route.ts`
- `app/api/project/documents/route.ts`
- `app/api/project/documents/upload/route.ts`
- `app/api/project/documents/[id]/route.ts`
- `app/api/project/submit/route.ts`
- `app/api/project/video/route.ts`
- `lib/notifications/notify-moderators.ts`
- `lib/notifications/notify-project-status.ts`
- `types/index.ts`
- `middleware.ts`
- Любые существующие файлы тестов (t1–t128)

---

## Формат отчёта

```
REVIEWED: T129
- создан __tests__/t129.test.ts: 41 тест для GET /api/project/questionnaire (5 — 401, 400 no section, 400 invalid section, 200 no project, 200 with answers), POST /api/project/questionnaire (6 — 401, 400 invalid section, 400 no answers, 404 no project, 500 upsert error, 200 ok), GET /api/project/documents (3 — 401, 200 no project empty, 200 with docs), POST /api/project/documents/upload (7 — 401, 404 no project, 400 no file, 400 invalid doc_type, 400 too large, 500 storage error, 201 success), DELETE /api/project/documents/[id] (4 — 401, 404 not found, 500 delete error, 200 ok), POST /api/project/submit (7 — 401, 404 no project, 400 already submitted, 400 questionnaire not filled, 500 update error, 200 draft→submitted, 200 rejected→submitted), POST /api/project/video (7 — 401, 404 no project, 400 no file, 400 too large, 400 unsupported format, 500 storage error, 200 success), DELETE /api/project/video (4 — 401, 404 no project, 404 no video, 200 ok)
```
