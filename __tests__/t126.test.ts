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

function buildApplicationsAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'admin' : options.role;

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn(async () => ({
      auth: {
        getUser: jest.fn(async () => ({
          data: { user: userId ? { id: userId, email: `${userId}@example.com` } : null },
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

function buildSettingsAuthMock(options: {
  userId?: string | null;
  role?: string | null;
}) {
  const userId = options.userId === undefined ? 'admin-1' : options.userId;
  const role = options.role === undefined ? 'superadmin' : options.role;

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

describe('T126 GET /api/admin/applications', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type AppRow = {
    id: string;
    project_id: string;
    investor_id: string;
    amount: number | null;
    instrument: string | null;
    status: string;
    message: string | null;
    rejection_reason: string | null;
    created_at: string;
    projects: { name: string } | null;
    users: { full_name: string | null; email: string } | null;
  };

  function makeGetApplicationsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: AppRow[];
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];
    const dbError = options.dbError ? { message: 'db error' } : null;
    const result = { data: dbError ? null : rows, error: dbError };
    const chain = {
      eq: jest.fn(),
      then: (resolve: (value: typeof result) => void) => {
        resolve(result);
      },
    };
    chain.eq.mockImplementation(() => chain);

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            order: jest.fn(() => chain),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetApplicationsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetApplicationsMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is project', async () => {
    makeGetApplicationsMock({ role: 'project' });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetApplicationsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with applications list and mapped fields', async () => {
    makeGetApplicationsMock({
      rows: [
        {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          instrument: 'equity',
          status: 'pending',
          message: null,
          rejection_reason: null,
          created_at: '2026-06-01T00:00:00Z',
          projects: { name: 'Тест Проект' },
          users: { full_name: 'Иван Иванов', email: 'ivan@example.com' },
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      applications: Array<{
        id: string;
        project_name: string | null;
        investor_email: string | null;
        status: string;
      }>;
    };
    expect(json.applications).toHaveLength(1);
    expect(json.applications[0].project_name).toBe('Тест Проект');
    expect(json.applications[0].investor_email).toBe('ivan@example.com');
    expect(json.applications[0].status).toBe('pending');
  });

  it('returns 200 for moderator role', async () => {
    makeGetApplicationsMock({ role: 'moderator', rows: [] });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
  });

  it('returns 200 for manager role', async () => {
    makeGetApplicationsMock({ role: 'manager', rows: [] });
    const { GET } = await import('@/app/api/admin/applications/route');
    const res = await GET(makeGetRequest('http://localhost/api/admin/applications'));
    expect(res.status).toBe(200);
  });
});

describe('T126 GET /api/admin/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeGetAppByIdMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    notFound?: boolean;
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    const appData = options.notFound
      ? null
      : {
          id: 'app-1',
          project_id: 'proj-1',
          investor_id: 'inv-1',
          amount: 500000,
          instrument: 'equity',
          status: 'pending',
          message: null,
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T00:00:00Z',
          projects: { id: 'proj-1', name: 'Тест Проект' },
          users: { email: 'ivan@example.com', full_name: 'Иван' },
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: options.dbError ? null : appData,
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
    makeGetAppByIdMock({ userId: null });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeGetAppByIdMock({ role: 'investor' });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetAppByIdMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 404 when application not found', async () => {
    makeGetAppByIdMock({ notFound: true });
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/missing-1'),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with application data', async () => {
    makeGetAppByIdMock({});
    const { GET } = await import('@/app/api/admin/applications/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/applications/app-1'),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { application: { id: string; status: string } };
    expect(json.application.id).toBe('app-1');
    expect(json.application.status).toBe('pending');
  });
});

describe('T126 PATCH /api/admin/applications/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-owner-application-status');
  });

  function makePatchMock(options: {
    userId?: string | null;
    role?: string | null;
    currentStatus?: string;
    notFound?: boolean;
    updateError?: boolean;
  }) {
    jest.resetModules();
    buildApplicationsAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-owner-application-status', () => ({
      notifyOwnerApplicationStatus: jest.fn(),
    }));

    const currentStatus = options.currentStatus ?? 'pending';
    const appData = options.notFound
      ? null
      : { id: 'app-1', status: currentStatus, investor_id: 'inv-1', project_id: 'proj-1' };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'applications') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: appData,
                    error: null,
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
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: { name: 'Тест Проект' },
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

  function makeContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  it('returns 401 when unauthenticated', async () => {
    makePatchMock({ userId: null });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makePatchMock({ role: 'investor' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when status is invalid', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'invalid_status',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when application not found', async () => {
    makePatchMock({ notFound: true });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/missing-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when transition is forbidden (approved to rejected)', async () => {
    makePatchMock({ currentStatus: 'approved' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'rejected',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when transition is forbidden (rejected to approved)', async () => {
    makePatchMock({ currentStatus: 'rejected' });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makePatchMock({ updateError: true });
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 on pending to approved', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'approved',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });

  it('returns 200 on pending to rejected with rejection_reason', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'rejected',
        rejection_reason: 'Не соответствует требованиям',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });

  it('returns 200 on pending to cancelled', async () => {
    makePatchMock({});
    const { PATCH } = await import('@/app/api/admin/applications/[id]/route');
    const res = await PATCH(
      makeJsonRequest('http://localhost/api/admin/applications/app-1', 'PATCH', {
        status: 'cancelled',
      }),
      makeContext('app-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('cancelled');
  });
});

describe('T126 GET /api/admin/settings', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  type SettingRow = {
    key: string;
    value: string;
    updated_at: string;
    updated_by: string;
  };

  function makeGetSettingsMock(options: {
    userId?: string | null;
    role?: string | null;
    dbError?: boolean;
    rows?: SettingRow[];
  }) {
    jest.resetModules();
    buildSettingsAuthMock({ userId: options.userId, role: options.role });

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(async () => ({
            data: options.dbError ? null : rows,
            error: options.dbError ? { message: 'db error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetSettingsMock({ userId: null });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is moderator', async () => {
    makeGetSettingsMock({ role: 'moderator' });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is manager', async () => {
    makeGetSettingsMock({ role: 'manager' });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 500 on DB error', async () => {
    makeGetSettingsMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with settings map for admin', async () => {
    makeGetSettingsMock({
      role: 'admin',
      rows: [
        {
          key: 'platform_name',
          value: 'Invest Market',
          updated_at: '2026-01-01T00:00:00Z',
          updated_by: 'admin-1',
        },
        {
          key: 'contact_email',
          value: 'info@invest.com',
          updated_at: '2026-01-01T00:00:00Z',
          updated_by: 'admin-1',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { settings: Record<string, string> };
    expect(json.settings.platform_name).toBe('Invest Market');
    expect(json.settings.contact_email).toBe('info@invest.com');
  });

  it('returns 200 with empty settings for superadmin', async () => {
    makeGetSettingsMock({ role: 'superadmin', rows: [] });
    const { GET } = await import('@/app/api/admin/settings/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { settings: Record<string, string> };
    expect(Object.keys(json.settings)).toHaveLength(0);
  });
});

describe('T126 PUT /api/admin/settings', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makePutSettingsMock(options: {
    userId?: string | null;
    role?: string | null;
    upsertError?: boolean;
  }) {
    jest.resetModules();
    buildSettingsAuthMock({ userId: options.userId, role: options.role });

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          upsert: jest.fn(async () => ({
            error: options.upsertError ? { message: 'upsert error' } : null,
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePutSettingsMock({ userId: null });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is admin (only superadmin can write)', async () => {
    makePutSettingsMock({ role: 'admin' });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is moderator', async () => {
    makePutSettingsMock({ role: 'moderator' });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'Test' })
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when body is empty object', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('No settings');
  });

  it('returns 400 when key is unknown', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { unknown_key: 'value' })
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Unknown setting key');
  });

  it('returns 400 when numeric key has negative value', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { success_fee_default: -5 })
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB upsert error', async () => {
    makePutSettingsMock({ upsertError: true });
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', { platform_name: 'New Name' })
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true } on valid string setting', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {
        platform_name: 'Invest Market Pro',
        contact_email: 'admin@invest.com',
      })
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it('returns 200 on valid numeric settings', async () => {
    makePutSettingsMock({});
    const { PUT } = await import('@/app/api/admin/settings/route');
    const res = await PUT(
      makeJsonRequest('http://localhost/api/admin/settings', 'PUT', {
        min_investment_amount: 100000,
        max_investment_amount: 50000000,
        catalog_page_size: 20,
        success_fee_default: 5,
      })
    );
    expect(res.status).toBe(200);
  });
});
