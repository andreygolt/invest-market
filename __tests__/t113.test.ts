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
    const json = (await res.json()) as { projectId: string };
    expect(json.projectId).toBe('proj-abc');
  });

  it('inserts project with status draft', async () => {
    const { POST, projectsInsert } = await loadApplyRoute();
    const req = makeApplyRequest({ userId: 'uid', email: 'a@b.com', companyName: 'Acme' });
    await POST(req);
    expect(projectsInsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
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

    const { PATCH } = await import('@/app/api/projects/[projectId]/questionnaire/route');

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
    const json = (await res.json()) as { ok: boolean };
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
