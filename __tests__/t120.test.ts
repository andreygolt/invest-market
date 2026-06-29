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

function buildAuthMocks(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'user-staff-1' : options.userId;
  const role = options.role === undefined ? 'manager' : options.role;

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

// ─── GET /api/manager/applications/[id]/notes ───────────────────────────────

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
    authors?: unknown[];
    dbError?: boolean;
  }) {
    jest.resetModules();
    buildAuthMocks({ userId: options?.userId, role: options?.role });

    const role = options?.role ?? 'manager';
    const notes = options?.notes ?? [];
    const authors = options?.authors ?? [];

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

    const authorInMock = jest.fn(async () => ({ data: authors, error: null }));

    const selectUsersMock = jest.fn((columns: string) => {
      if (columns === 'id, email') return { in: authorInMock };
      return { eq: profileEqMock };
    });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') return { select: selectUsersMock };
          if (table === 'application_notes') return { select: selectNotesMock };
          return {};
        }),
      })),
    }));

    const { GET } = await import('@/app/api/manager/applications/[id]/notes/route');
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
    const json = (await res.json()) as { notes: unknown[] };
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
      authors: [{ id: 'user-staff-1', email: 'manager@example.com' }],
    });
    const res = await GET(
      makeGetRequest('http://localhost/api/manager/applications/app-42/notes'),
      { params }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      notes: { id: string; content: string; author_email: string | null }[];
    };
    expect(json.notes.length).toBe(1);
    expect(json.notes[0].id).toBe('note-1');
    expect(json.notes[0].content).toBe('Проверено');
    expect(json.notes[0].author_email).toBe('manager@example.com');
  });
});

// ─── POST /api/manager/applications/[id]/notes ──────────────────────────────

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
    const userId = options?.userId === undefined ? 'user-staff-1' : options.userId;
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

    const { POST } = await import('@/app/api/manager/applications/[id]/notes/route');
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
    const json = (await res.json()) as { note: { id: string; content: string } };
    expect(json.note.id).toBe('note-new');
    expect(json.note.content).toBe('Новая заметка');
  });
});

// ─── DELETE /api/manager/applications/[id]/notes/[note_id] ──────────────────

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
    const userId = options?.userId === undefined ? 'user-staff-1' : options.userId;
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
    const json = (await res.json()) as { ok: boolean };
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
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

// ─── GET /api/manager/export/applications ───────────────────────────────────

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

    const queryResult = {
      data: options?.dbError ? null : rows,
      error: options?.dbError ? { message: 'db error' } : null,
    };

    const chainable: {
      order?: jest.Mock;
      eq?: jest.Mock;
      gte?: jest.Mock;
      lte?: jest.Mock;
      then?: (resolve: (value: typeof queryResult) => void) => void;
    } = {};
    const chainFn = jest.fn(() => chainable);
    chainable.order = chainFn;
    chainable.eq = chainFn;
    chainable.gte = chainFn;
    chainable.lte = chainFn;
    chainable.then = (resolve: (value: typeof queryResult) => void) => {
      resolve(queryResult);
    };

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
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    const GET = await loadExportRoute({ role: 'moderator' });
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is investor', async () => {
    const GET = await loadExportRoute({ role: 'investor' });
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on database error', async () => {
    const GET = await loadExportRoute({ dbError: true });
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(500);
  });

  it('returns CSV with correct content-type on success', async () => {
    const GET = await loadExportRoute({ rows: [] });
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    const text = await res.text();
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
    const res = await GET(makeGetRequest('http://localhost/api/manager/export/applications'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('app-1');
    expect(text).toContain('Tech Fund');
    expect(text).toContain('investor@example.com');
    expect(text).toContain('pending');
  });
});

// ─── escapeCSV utility ──────────────────────────────────────────────────────

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
