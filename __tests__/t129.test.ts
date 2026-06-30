import { NextRequest } from 'next/server';

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

function makeFormRequest(fields: Record<string, unknown>): NextRequest {
  const mockFormData = {
    get: jest.fn((key: string) => (Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : null)),
  };
  return {
    formData: jest.fn(async () => mockFormData),
  } as unknown as NextRequest;
}

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
    const res = await POST(makeJsonRequest('http://localhost/api/project/questionnaire', 'POST', { section: 's1' }));
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

  it('returns 500 on document insert error', async () => {
    makeUploadMock({ dbError: true });
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
            callCount += 1;
            if (callCount === 1) {
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: doc, error: null })),
                  })),
                })),
              };
            }
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
    const res = await DELETE(makeGetRequest('http://localhost/api/project/documents/doc-1'), makeContext('doc-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when document not found', async () => {
    makeDocDeleteMock({ doc: null });
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/documents/missing'), makeContext('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on delete DB error', async () => {
    makeDocDeleteMock({ deleteError: true });
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/documents/doc-1'), makeContext('doc-1'));
    expect(res.status).toBe(500);
  });

  it('returns 200 ok on successful deletion', async () => {
    makeDocDeleteMock({});
    const { DELETE } = await import('@/app/api/project/documents/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/documents/doc-1'), makeContext('doc-1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

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
      notifyModerators: jest.fn(async () => undefined),
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
                  data: sections.map((section) => ({ section })),
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

    global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  }

  it('returns 401 when unauthenticated', async () => {
    makeSubmitMock({ userId: null });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project', async () => {
    makeSubmitMock({ project: null });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when project is already submitted', async () => {
    makeSubmitMock({ project: { id: 'proj-1', status: 'submitted', name: 'Тест' } });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('project already submitted');
  });

  it('returns 400 when questionnaire s1 is not filled', async () => {
    makeSubmitMock({ questionnaireSections: ['s2', 's3'] });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('questionnaire not filled');
  });

  it('returns 500 on DB update error', async () => {
    makeSubmitMock({ updateError: true });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with status submitted on success (draft to submitted)', async () => {
    makeSubmitMock({});
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('submitted');
  });

  it('returns 200 on resubmit (rejected to submitted)', async () => {
    makeSubmitMock({ project: { id: 'proj-1', status: 'rejected', name: 'Тест Проект' } });
    const { POST } = await import('@/app/api/project/submit/route');
    const res = await POST(makeGetRequest('http://localhost/api/project/submit'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe('submitted');
  });
});

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
            callCount += 1;
            if (callCount === 1) {
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                  })),
                })),
              };
            }
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
    size: 10 * 1024 * 1024,
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

  it('returns 500 on project update error', async () => {
    makeVideoPostMock({ updateError: true });
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
            callCount += 1;
            if (callCount === 1) {
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: project, error: null })),
                  })),
                })),
              };
            }
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
