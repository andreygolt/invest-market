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
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId, email: 'admin@example.com' } : null },
        })),
      },
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
        return {};
      }),
    })),
  }));
}

function buildProfilesAuthMock(options: {
  userId?: string | null;
  role?: string | null;
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
              data: userId ? { role } : null,
              error: null,
            })),
          })),
        })),
      })),
    })),
  }));
}

describe('T125 GET /api/admin/invites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type InviteRow = {
    id: string;
    code: string;
    role: string;
    email: string | null;
    used_by: string | null;
    used_at: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
    note: string | null;
  };

  function makeGetInvitesMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: InviteRow[];
    count?: number;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const count = options.count ?? rows.length;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => ({
              range: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
                count,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetInvitesMock({ userId: null });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetInvitesMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makeGetInvitesMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetInvitesMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with invites list and total', async () => {
    makeGetInvitesMock({
      rows: [
        {
          id: 'inv-1',
          code: 'abc123def456gh78',
          role: 'investor',
          email: null,
          used_by: null,
          used_at: null,
          created_by: 'admin-1',
          created_at: '2026-06-01T00:00:00Z',
          expires_at: null,
          note: null,
        },
      ],
      count: 1,
    });
    const { GET } = await import('@/app/api/admin/invites/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/invites'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { invites: InviteRow[]; total: number };
    expect(json.invites).toHaveLength(1);
    expect(json.invites[0].role).toBe('investor');
    expect(json.total).toBe(1);
  });
});

describe('T125 POST /api/admin/invites', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
  });

  type InviteCreated = {
    id: string;
    code: string;
    role: string;
    email: string | null;
    used_by: string | null;
    used_at: string | null;
    created_by: string;
    created_at: string;
    expires_at: string | null;
    note: string | null;
    url: string;
  };

  function makePostInviteMock(options: {
    userId?: string | null;
    role?: string | null;
    insertError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/audit/log', () => ({
      writeAuditLog: jest.fn(),
    }));

    const createdInvite = {
      id: 'new-inv-1',
      code: 'testcode1234abcd',
      role: 'investor',
      email: null,
      used_by: null,
      used_at: null,
      created_by: 'admin-1',
      created_at: '2026-06-30T10:00:00Z',
      expires_at: null,
      note: null,
    };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          insert: jest.fn(() => ({
            select: jest.fn(() => ({
              single: jest.fn(async () => ({
                data: options.insertError ? null : createdInvite,
                error: options.insertError ? { message: 'insert error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePostInviteMock({ userId: null });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is manager', async () => {
    makePostInviteMock({ role: 'manager' });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body has no role', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(makeJsonRequest('http://localhost/api/admin/invites', 'POST', {}));
    expect(res.status).toBe(400);
  });

  it('returns 400 when role is invalid', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'admin' })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiresInDays is negative', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: -5,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when expiresInDays is not an integer', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: 1.5,
      })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB insert error', async () => {
    makePostInviteMock({ insertError: true });
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', { role: 'investor' })
    );
    expect(res.status).toBe(500);
  });

  it('returns 201 with invite data and url on success', async () => {
    makePostInviteMock({});
    const { POST } = await import('@/app/api/admin/invites/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/invites', 'POST', {
        role: 'investor',
        expiresInDays: 7,
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as InviteCreated;
    expect(json.code).toBeTruthy();
    expect(json.url).toContain(json.code);
    expect(json.role).toBe('investor');
  });
});

describe('T125 DELETE /api/admin/invites/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeDeleteInviteMock(options: {
    userId?: string | null;
    role?: string | null;
    selectError?: boolean;
    alreadyUsed?: boolean;
    deleteError?: boolean;
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
          if (table === 'invites') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.selectError
                      ? null
                      : { used_by: options.alreadyUsed ? 'some-user-id' : null },
                    error: options.selectError ? { message: 'db error' } : null,
                  })),
                })),
              })),
              delete: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.deleteError ? { message: 'delete error' } : null,
                })),
              })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makeDeleteInviteMock({ userId: null });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeDeleteInviteMock({ role: 'moderator' });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 when invite select fails', async () => {
    makeDeleteInviteMock({ selectError: true });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 400 when invite is already used', async () => {
    makeDeleteInviteMock({ alreadyUsed: true });
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('used');
  });

  it('returns 204 on successful deletion', async () => {
    makeDeleteInviteMock({});
    const { DELETE } = await import('@/app/api/admin/invites/[id]/route');
    const res = await DELETE(
      makeGetRequest('http://localhost/api/admin/invites/inv-1'),
      makeContext('inv-1')
    );
    expect(res.status).toBe(204);
  });
});

describe('T125 GET /api/admin/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/admin/stats');
  });

  const mockStats = {
    projects: { draft: 1, submitted: 2, approved: 3, rejected: 0, total: 6 },
    users: { investor: 5, project: 2, admin: 1, moderator: 1, manager: 0, total: 9 },
    applications: { pending: 3, approved: 2, rejected: 1, total: 6 },
    portfolio: { total_records: 4 },
    invites: { total: 10, used: 5, unused: 5 },
    recent_activity: [],
  };

  function makeStatsMock(options: {
    userId?: string | null;
    role?: string | null;
    statsError?: boolean;
  }) {
    jest.resetModules();
    buildUsersAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/admin/stats', () => ({
      getAdminStats: jest.fn(async () => {
        if (options.statsError) throw new Error('stats error');
        return mockStats;
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeStatsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 when getAdminStats throws', async () => {
    makeStatsMock({ statsError: true });
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with stats shape', async () => {
    makeStatsMock({});
    const { GET } = await import('@/app/api/admin/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as typeof mockStats;
    expect(json.projects.total).toBe(6);
    expect(json.users.investor).toBe(5);
    expect(json.invites.unused).toBe(5);
    expect(Array.isArray(json.recent_activity)).toBe(true);
  });
});

describe('T125 GET /api/admin/search', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeSearchMock(options: {
    userId?: string | null;
    role?: string | null;
    searchError?: boolean;
    projects?: Array<{ id: string; name: string; category: string; status: string }>;
    investors?: Array<{ id: string; full_name: string | null; email: string; created_at: string }>;
    applications?: Array<{
      id: string;
      project_id: string;
      investor_id: string;
      amount: number | null;
      status: string;
      projects: { name: string } | null;
      profiles: { email: string } | null;
    }>;
  }) {
    jest.resetModules();
    buildProfilesAuthMock({ userId: options.userId, role: options.role });

    const projData = options.projects ?? [];
    const invData = options.investors ?? [];
    const appData = options.applications ?? [];
    const searchError = options.searchError ? { message: 'search error' } : null;

    function makeOrLimitMock(data: unknown[]) {
      return {
        select: jest.fn(() => ({
          or: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
          })),
          eq: jest.fn(() => ({
            or: jest.fn(() => ({
              limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
            })),
          })),
          ilike: jest.fn(() => ({
            limit: jest.fn(async () => ({ data: searchError ? null : data, error: searchError })),
          })),
        })),
      };
    }

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') return makeOrLimitMock(projData);
          if (table === 'profiles') return makeOrLimitMock(invData);
          if (table === 'investor_applications') return makeOrLimitMock(appData);
          return makeOrLimitMock([]);
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeSearchMock({ userId: null });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeSearchMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(403);
  });

  it('returns 200 with empty results when q is less than 2 chars', async () => {
    makeSearchMock({});
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=a'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      query: string;
      projects: unknown[];
      investors: unknown[];
      applications: unknown[];
    };
    expect(json.projects).toEqual([]);
    expect(json.investors).toEqual([]);
    expect(json.applications).toEqual([]);
  });

  it('returns 200 with empty results when q is absent', async () => {
    makeSearchMock({});
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: unknown[] };
    expect(json.projects).toEqual([]);
  });

  it('returns 500 on search DB error', async () => {
    makeSearchMock({ searchError: true });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=test'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with search results', async () => {
    makeSearchMock({
      projects: [{ id: 'p-1', name: 'TestCorp', category: 'Tech', status: 'approved' }],
      investors: [],
      applications: [],
    });
    const { GET } = await import('@/app/api/admin/search/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/search?q=TestCorp'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      query: string;
      projects: Array<{ id: string; name: string }>;
      investors: unknown[];
      applications: unknown[];
    };
    expect(json.query).toBe('TestCorp');
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].name).toBe('TestCorp');
  });
});
