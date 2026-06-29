// ─── helpers ────────────────────────────────────────────────────────────────

function makeGetRequest(url: string) {
  return new Request(url) as import('next/server').NextRequest;
}

function makePostRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/investor/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makePatchRequest(id: string, body: Record<string, unknown>) {
  return new Request(`http://localhost/api/investor/favorites/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest;
}

function makeDeleteRequest(id: string, investorId?: string) {
  const url = investorId
    ? `http://localhost/api/investor/favorites/${id}?investor_id=${investorId}`
    : `http://localhost/api/investor/favorites/${id}`;
  return new Request(url, { method: 'DELETE' }) as import('next/server').NextRequest;
}

// ─── GET /api/investor/favorites ─────────────────────────────────────────────

describe('T118 GET /api/investor/favorites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  async function loadGetRoute(options?: {
    data?: unknown[];
    catalogData?: unknown[];
    dbError?: boolean;
  }) {
    jest.resetModules();

    const rows = options?.data ?? [];
    const catalogRows = options?.catalogData ?? [];

    const orderMock = jest.fn(async () => ({
      data: rows,
      error: options?.dbError ? { message: 'db error' } : null,
    }));
    const eqOrderMock = jest.fn(() => ({ order: orderMock }));
    const eqInvestorMock = jest.fn(() => ({
      order: orderMock,
      eq: eqOrderMock,
    }));
    const selectFavMock = jest.fn(() => ({ eq: eqInvestorMock }));

    const inMock = jest.fn(async () => ({
      data: catalogRows,
      error: null,
    }));
    const selectCatalogMock = jest.fn(() => ({ in: inMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'investor_favorites') return { select: selectFavMock };
          if (table === 'v_investor_catalog') return { select: selectCatalogMock };
          return {};
        }),
      })),
    }));

    const { GET } = await import('@/app/api/investor/favorites/route');
    return GET;
  }

  it('returns 400 when investor_id is missing', async () => {
    const GET = await loadGetRoute();
    const res = await GET(makeGetRequest('http://localhost/api/investor/favorites'));
    expect(res.status).toBe(400);
  });

  it('returns 200 with empty favorites array', async () => {
    const GET = await loadGetRoute({ data: [] });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/favorites?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { favorites: unknown[] };
    expect(Array.isArray(json.favorites)).toBe(true);
    expect(json.favorites.length).toBe(0);
  });

  it('returns 200 with mapped favorites including project name', async () => {
    const rows = [
      {
        id: 'fav-1',
        investor_id: 'user-1',
        project_id: 'proj-1',
        notes: 'Интересный',
        personal_status: 'watching',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
        projects: { name: 'Tech Fund' },
      },
    ];
    const catalogRows = [
      { id: 'proj-1', industry: 'IT', stage: 'series_a', ai_score: 85 },
    ];
    const GET = await loadGetRoute({ data: rows, catalogData: catalogRows });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/favorites?investor_id=user-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      favorites: {
        id: string;
        project_name: string;
        project_industry: string | null;
        project_ai_score: number | null;
        notes: string | null;
        personal_status: string | null;
      }[];
    };
    expect(json.favorites.length).toBe(1);
    expect(json.favorites[0].project_name).toBe('Tech Fund');
    expect(json.favorites[0].project_industry).toBe('IT');
    expect(json.favorites[0].project_ai_score).toBe(85);
    expect(json.favorites[0].notes).toBe('Интересный');
    expect(json.favorites[0].personal_status).toBe('watching');
  });

  it('returns 500 on database error', async () => {
    const GET = await loadGetRoute({ dbError: true });
    const res = await GET(
      makeGetRequest('http://localhost/api/investor/favorites?investor_id=user-1')
    );
    expect(res.status).toBe(500);
  });
});

// ─── POST /api/investor/favorites ────────────────────────────────────────────

describe('T118 POST /api/investor/favorites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  const VALID_BODY = {
    investor_id: 'investor-1',
    project_id: 'proj-1',
    notes: 'Хороший проект',
    personal_status: 'watching',
  };

  async function loadPostRoute(options?: {
    projectFound?: boolean;
    upsertError?: boolean;
    upsertedData?: Record<string, unknown>;
  }) {
    jest.resetModules();

    const projectFound = options?.projectFound ?? true;
    const upsertedData = options?.upsertedData ?? {
      id: 'fav-new',
      investor_id: 'investor-1',
      project_id: 'proj-1',
      notes: 'Хороший проект',
      personal_status: 'watching',
      created_at: '2026-06-29T10:00:00Z',
      updated_at: '2026-06-29T10:00:00Z',
    };

    const projectMaybeSingle = jest.fn(async () => ({
      data: projectFound ? { id: 'proj-1' } : null,
      error: null,
    }));
    const projectEqStatus = jest.fn(() => ({ maybeSingle: projectMaybeSingle }));
    const projectEqId = jest.fn(() => ({ eq: projectEqStatus }));
    const projectSelect = jest.fn(() => ({ eq: projectEqId }));

    const upsertSingle = jest.fn(async () => ({
      data: options?.upsertError ? null : upsertedData,
      error: options?.upsertError ? { message: 'upsert error' } : null,
    }));
    const upsertSelectMock = jest.fn(() => ({ single: upsertSingle }));
    const upsertMock = jest.fn(() => ({ select: upsertSelectMock }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return { select: projectSelect };
          if (table === 'investor_favorites') return { upsert: upsertMock };
          return {};
        }),
      })),
    }));

    const { POST } = await import('@/app/api/investor/favorites/route');
    return POST;
  }

  it('returns 400 when investor_id is missing', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest({ project_id: 'proj-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when project_id is missing', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest({ investor_id: 'user-1' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when project not found or not approved', async () => {
    const POST = await loadPostRoute({ projectFound: false });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('returns 500 on upsert error', async () => {
    const POST = await loadPostRoute({ upsertError: true });
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('returns 201 with favorite data on success', async () => {
    const POST = await loadPostRoute();
    const res = await POST(makePostRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; investor_id: string; project_id: string };
    expect(json.id).toBe('fav-new');
    expect(json.investor_id).toBe('investor-1');
    expect(json.project_id).toBe('proj-1');
  });
});

// ─── PATCH /api/investor/favorites/[id] ──────────────────────────────────────

describe('T118 PATCH /api/investor/favorites/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  const params = Promise.resolve({ id: 'fav-1' });

  async function loadPatchRoute(options?: {
    existingData?: { id: string; investor_id: string } | null;
    updateError?: boolean;
  }) {
    jest.resetModules();

    const existing = options?.existingData !== undefined
      ? options.existingData
      : { id: 'fav-1', investor_id: 'investor-1' };

    const findMaybeSingle = jest.fn(async () => ({
      data: existing,
      error: null,
    }));
    const findEq = jest.fn(() => ({ maybeSingle: findMaybeSingle }));
    const findSelect = jest.fn(() => ({ eq: findEq }));

    const updateSingle = jest.fn(async () => ({
      data: {
        id: 'fav-1',
        investor_id: 'investor-1',
        project_id: 'proj-1',
        notes: 'Обновлено',
        personal_status: 'in_progress',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-29T10:00:00Z',
      },
      error: options?.updateError ? { message: 'update error' } : null,
    }));
    const updateSelectMock = jest.fn(() => ({ single: updateSingle }));
    const updateEq = jest.fn(() => ({ select: updateSelectMock }));
    const updateMock = jest.fn(() => ({ eq: updateEq }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: findSelect,
          update: updateMock,
        })),
      })),
    }));

    const { PATCH } = await import('@/app/api/investor/favorites/[id]/route');
    return PATCH;
  }

  it('returns 400 when investor_id is missing in body', async () => {
    const PATCH = await loadPatchRoute();
    const res = await PATCH(makePatchRequest('fav-1', { notes: 'test' }), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when favorite not found', async () => {
    const PATCH = await loadPatchRoute({ existingData: null });
    const res = await PATCH(
      makePatchRequest('fav-1', { investor_id: 'investor-1', notes: 'test' }),
      { params }
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when investor_id does not match owner', async () => {
    const PATCH = await loadPatchRoute({
      existingData: { id: 'fav-1', investor_id: 'other-user' },
    });
    const res = await PATCH(
      makePatchRequest('fav-1', { investor_id: 'investor-1', notes: 'test' }),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on update error', async () => {
    const PATCH = await loadPatchRoute({ updateError: true });
    const res = await PATCH(
      makePatchRequest('fav-1', { investor_id: 'investor-1', notes: 'Обновлено' }),
      { params }
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with updated favorite on success', async () => {
    const PATCH = await loadPatchRoute();
    const res = await PATCH(
      makePatchRequest('fav-1', {
        investor_id: 'investor-1',
        notes: 'Обновлено',
        personal_status: 'in_progress',
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; notes: string; personal_status: string };
    expect(json.id).toBe('fav-1');
    expect(json.notes).toBe('Обновлено');
    expect(json.personal_status).toBe('in_progress');
  });
});

// ─── DELETE /api/investor/favorites/[id] ─────────────────────────────────────

describe('T118 DELETE /api/investor/favorites/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  const params = Promise.resolve({ id: 'fav-1' });

  async function loadDeleteRoute(options?: {
    existingData?: { id: string; investor_id: string } | null;
    deleteError?: boolean;
  }) {
    jest.resetModules();

    const existing = options?.existingData !== undefined
      ? options.existingData
      : { id: 'fav-1', investor_id: 'investor-1' };

    const findMaybeSingle = jest.fn(async () => ({
      data: existing,
      error: null,
    }));
    const findEq = jest.fn(() => ({ maybeSingle: findMaybeSingle }));
    const findSelect = jest.fn(() => ({ eq: findEq }));

    const deleteEq = jest.fn(async () => ({
      error: options?.deleteError ? { message: 'delete error' } : null,
    }));
    const deleteMock = jest.fn(() => ({ eq: deleteEq }));

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: findSelect,
          delete: deleteMock,
        })),
      })),
    }));

    const { DELETE } = await import('@/app/api/investor/favorites/[id]/route');
    return DELETE;
  }

  it('returns 400 when investor_id query param is missing', async () => {
    const DELETE = await loadDeleteRoute();
    const res = await DELETE(makeDeleteRequest('fav-1'), { params });
    expect(res.status).toBe(400);
  });

  it('returns 404 when favorite not found', async () => {
    const DELETE = await loadDeleteRoute({ existingData: null });
    const res = await DELETE(makeDeleteRequest('fav-1', 'investor-1'), { params });
    expect(res.status).toBe(404);
  });

  it('returns 403 when investor_id does not match owner', async () => {
    const DELETE = await loadDeleteRoute({
      existingData: { id: 'fav-1', investor_id: 'other-user' },
    });
    const res = await DELETE(makeDeleteRequest('fav-1', 'investor-1'), { params });
    expect(res.status).toBe(403);
  });

  it('returns 500 on delete error', async () => {
    const DELETE = await loadDeleteRoute({ deleteError: true });
    const res = await DELETE(makeDeleteRequest('fav-1', 'investor-1'), { params });
    expect(res.status).toBe(500);
  });

  it('returns ok:true on success', async () => {
    const DELETE = await loadDeleteRoute();
    const res = await DELETE(makeDeleteRequest('fav-1', 'investor-1'), { params });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
