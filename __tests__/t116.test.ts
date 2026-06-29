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
    const profileData =
      options?.profileData !== undefined
        ? options.profileData
        : {
            id: 'user-1',
            role: 'investor',
            full_name: 'Иван Петров',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          };

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
    makeGetRequest();
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
    const json = (await res.json()) as {
      id: string;
      email: string;
      role: string;
      full_name: string;
    };
    expect(json.id).toBe('user-1');
    expect(json.email).toBe('ivan@example.com');
    expect(json.role).toBe('investor');
    expect(json.full_name).toBe('Иван Петров');
  });
});

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
    const updateData =
      options?.updateData !== undefined
        ? options.updateData
        : {
            id: 'user-1',
            role: 'investor',
            full_name: 'Новое Имя',
            is_active: true,
            created_at: '2026-01-01T00:00:00Z',
          };

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
    const json = (await res.json()) as { full_name: string; email: string };
    expect(json.full_name).toBe('Новое Имя');
    expect(json.email).toBe('ivan@example.com');
  });
});

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
    const json = (await res.json()) as { email_enabled: boolean };
    expect(json.email_enabled).toBe(true);
  });

  it('returns stored email_enabled value', async () => {
    const GET = await loadGetPrefRoute({ prefData: { email_enabled: false } });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { email_enabled: boolean };
    expect(json.email_enabled).toBe(false);
  });
});

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
    const res = await PATCH(
      makePatchRequest('/api/profile/notification-preferences', { email_enabled: true })
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when email_enabled is not boolean', async () => {
    const PATCH = await loadPatchPrefRoute();
    const res = await PATCH(
      makePatchRequest('/api/profile/notification-preferences', { email_enabled: 'yes' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on upsert error', async () => {
    const PATCH = await loadPatchPrefRoute({ upsertError: true });
    const res = await PATCH(
      makePatchRequest('/api/profile/notification-preferences', { email_enabled: false })
    );
    expect(res.status).toBe(500);
  });

  it('returns ok:true with email_enabled on success', async () => {
    const PATCH = await loadPatchPrefRoute();
    const res = await PATCH(
      makePatchRequest('/api/profile/notification-preferences', { email_enabled: false })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; email_enabled: boolean };
    expect(json.ok).toBe(true);
    expect(json.email_enabled).toBe(false);
  });
});

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
    const res = await POST(
      makePostRequest('/api/profile/password', { new_password: 'newpassword123' })
    );
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
    const res = await POST(
      makePostRequest('/api/profile/password', { new_password: 'newpassword123' })
    );
    expect(res.status).toBe(500);
  });

  it('returns ok:true on success', async () => {
    const POST = await loadPostPasswordRoute();
    const res = await POST(
      makePostRequest('/api/profile/password', { new_password: 'newpassword123' })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});
