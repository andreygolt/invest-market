import { NextRequest } from 'next/server';

function makeGetRequest(url: string) {
  return new NextRequest(url);
}

function makeJsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function buildUsersAuthMock(options: {
  userId?: string | null;
  role?: string | null;
  profileError?: boolean;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

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
            single: jest.fn(async () => ({
              data: options.profileError ? null : userId ? { role } : null,
              error: options.profileError ? { message: 'db error' } : null,
            })),
          })),
        })),
      })),
    })),
  }));
}

describe('T124 GET /api/admin/users', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type UserRow = {
    id: string;
    email: string;
    role: string;
    full_name: string | null;
    is_active: boolean;
    created_at: string;
  };

  function makeUsersMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: UserRow[];
    count?: number;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;
    const chainMock: {
      or: jest.Mock;
      eq: jest.Mock;
      range: jest.Mock;
    } = {
      or: jest.fn(() => chainMock),
      eq: jest.fn(() => chainMock),
      range: jest.fn(async () => ({
        data: options.dbError ? null : rows,
        error: options.dbError ? { message: 'db error' } : null,
        count,
      })),
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => chainMock),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeUsersMock({ userId: null });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeUsersMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeUsersMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeUsersMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with users and total', async () => {
    makeUsersMock({
      rows: [
        {
          id: 'u-1',
          email: 'admin@example.com',
          role: 'admin',
          full_name: 'Admin User',
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { users: UserRow[]; total: number };
    expect(json.users).toHaveLength(1);
    expect(json.users[0].email).toBe('admin@example.com');
    expect(json.total).toBe(1);
  });

  it('returns 200 with correct total from count', async () => {
    makeUsersMock({
      rows: [
        {
          id: 'u-1',
          email: 'a@b.com',
          role: 'investor',
          full_name: null,
          is_active: true,
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      count: 50,
    });
    const { GET } = await import('@/app/api/admin/users/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users?page=1&limit=1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { total: number };
    expect(json.total).toBe(50);
  });
});

describe('T124 GET /api/admin/users/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type UserRow = {
    id: string;
    email: string;
    role: string;
    full_name: string | null;
    is_active: boolean;
    created_at: string;
  };

  function makeGetUserMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    userData?: UserRow | null;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const userData = options.userData ?? {
      id: 'target-1',
      email: 'target@example.com',
      role: 'investor',
      full_name: 'Target User',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.dbError ? null : userData,
                error: options.dbError ? { message: 'db error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetUserMock({ userId: null });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is manager', async () => {
    makeGetUserMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetUserMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with user data', async () => {
    makeGetUserMock({});
    const { GET } = await import('@/app/api/admin/users/[id]/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/users/target-1'), makeContext('target-1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; email: string };
    expect(json.id).toBe('target-1');
    expect(json.email).toBe('target@example.com');
  });
});

describe('T124 POST /api/admin/users/[id] (confirm email)', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeConfirmMock(options: {
    userId?: string | null;
    role?: string | null;
    confirmError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        auth: {
          admin: {
            updateUserById: jest.fn(async () => ({
              data: null,
              error: options.confirmError ? { message: 'confirm error' } : null,
            })),
          },
        },
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makeConfirmMock({ userId: null });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeConfirmMock({ role: 'investor' });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on Auth Admin error', async () => {
    makeConfirmMock({ confirmError: true });
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on success', async () => {
    makeConfirmMock({});
    const { POST } = await import('@/app/api/admin/users/[id]/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'POST', {}),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });
});

describe('T124 PATCH /api/admin/users/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/notifications/notify-user-account-change');
  });

  type UpdatedUser = {
    id: string;
    email: string;
    role: string;
    full_name: string | null;
    is_active: boolean;
    created_at: string;
  };

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    updatedUser?: UpdatedUser;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/notifications/notify-user-account-change', () => ({
      notifyUserAccountChange: jest.fn(),
    }));

    const updatedUser = options.updatedUser ?? {
      id: 'target-1',
      email: 'target@example.com',
      role: 'moderator',
      full_name: 'Target User',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          update: jest.fn(() => ({
            eq: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: options.dbError ? null : updatedUser,
                  error: options.dbError ? { message: 'db error' } : null,
                })),
              })),
            })),
          })),
        })),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makePatchMock({ userId: null });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when trying to update own account', async () => {
    makePatchMock({ userId: 'admin-1', role: 'admin' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/admin-1', 'PATCH', { role: 'moderator' }),
      makeContext('admin-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('own account');
  });

  it('returns 400 when body is invalid (unknown role)', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'hacker' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when is_active is not boolean', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { is_active: 'yes' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 403 when non-superadmin tries to assign superadmin role', async () => {
    makePatchMock({ role: 'admin' });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'superadmin' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 200 when superadmin assigns superadmin role', async () => {
    makePatchMock({
      role: 'superadmin',
      updatedUser: {
        id: 'target-1',
        email: 'target@example.com',
        role: 'superadmin',
        full_name: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'superadmin' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { role: string };
    expect(json.role).toBe('superadmin');
  });

  it('returns 500 on DB error', async () => {
    makePatchMock({ dbError: true });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with updated user on valid PATCH (role change)', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { role: 'moderator' }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: string; role: string };
    expect(json.id).toBe('target-1');
    expect(json.role).toBe('moderator');
  });

  it('returns 200 with updated user on valid PATCH (is_active change)', async () => {
    makePatchMock({
      updatedUser: {
        id: 'target-1',
        email: 'target@example.com',
        role: 'investor',
        full_name: null,
        is_active: false,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
    const { PATCH } = await import('@/app/api/admin/users/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/users/target-1', 'PATCH', { is_active: false }),
      makeContext('target-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { is_active: boolean };
    expect(json.is_active).toBe(false);
  });
});

describe('T124 POST /api/admin/activate-user', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeActivateMock(options: {
    userId?: string | null;
    role?: string | null;
    profileError?: boolean;
    insertError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'admin-1' : options.userId;
    const role = options.role === undefined ? 'admin' : options.role;

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
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.profileError ? null : userId ? { role } : null,
                error: options.profileError ? { message: 'db error' } : null,
              })),
            })),
          })),
          insert: jest.fn(async () => ({
            data: null,
            error: options.insertError ? { message: 'insert error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeActivateMock({ userId: null });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'investor',
      })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeActivateMock({ role: 'investor' });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'investor',
      })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is missing required fields', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test',
        role: 'unknown_role',
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on insert DB error', async () => {
    makeActivateMock({ insertError: true });
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'a@b.com',
        fullName: 'Test User',
        role: 'investor',
      })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on success', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-1',
        email: 'ivan@example.com',
        fullName: 'Иван Иванов',
        role: 'investor',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('accepts project role', async () => {
    makeActivateMock({});
    const { POST } = await import('@/app/api/admin/activate-user/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/activate-user', 'POST', {
        userId: 'u-2',
        email: 'project@example.com',
        fullName: 'ООО Проект',
        role: 'project',
      })
    );
    expect(res.status).toBe(200);
  });
});
