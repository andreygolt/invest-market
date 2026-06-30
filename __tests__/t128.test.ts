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

type ProjectRow = { id: string; owner_id: string; name: string; status: string };
type LogRow = {
  id: string;
  project_id: string;
  old_status: string;
  new_status: string;
  changed_at: string;
  changed_by: string;
};
type UpdateRow = {
  id: string;
  project_id: string;
  title: string;
  body: string;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
};

describe('T128 GET /api/project/my', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeGetMyMock(options: { userId?: string | null; project?: ProjectRow | null }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : null;

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({ data: project, error: null })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetMyMock({ userId: null });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with null when no project exists', async () => {
    makeGetMyMock({ project: null });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ project: null });
  });

  it('returns 200 with project when found', async () => {
    makeGetMyMock({ project: { id: 'proj-1', owner_id: 'user-1', name: 'My Startup', status: 'draft' } });
    const { GET } = await import('@/app/api/project/my/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.id).toBe('proj-1');
    expect(json.project.name).toBe('My Startup');
  });
});

describe('T128 POST /api/project/my', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makePostMyMock(options: {
    userId?: string | null;
    existingProject?: ProjectRow | null;
    insertedProject?: ProjectRow | null;
    insertError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const existing = options.existingProject !== undefined ? options.existingProject : null;
    const inserted = options.insertedProject ?? {
      id: 'new-proj-1',
      owner_id: 'user-1',
      name: 'New Project',
      status: 'draft',
    };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => {
        let callCount = 0;
        return {
          auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
          from: jest.fn(() => {
            callCount += 1;
            if (callCount === 1) {
              return {
                select: jest.fn(() => ({
                  eq: jest.fn(() => ({
                    maybeSingle: jest.fn(async () => ({ data: existing, error: null })),
                  })),
                })),
              };
            }
            return {
              insert: jest.fn(() => ({
                select: jest.fn(() => ({
                  single: jest.fn(async () => ({
                    data: options.insertError ? null : inserted,
                    error: options.insertError ? { message: 'insert error' } : null,
                  })),
                })),
              })),
            };
          }),
        };
      }),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePostMyMock({ userId: null });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing', async () => {
    makePostMyMock({});
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', {}));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('name required');
  });

  it('returns 400 when name is whitespace only', async () => {
    makePostMyMock({});
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', { name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 200 with existing project when project already exists', async () => {
    makePostMyMock({ existingProject: { id: 'proj-1', owner_id: 'user-1', name: 'Existing', status: 'draft' } });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Name' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.name).toBe('Existing');
  });

  it('returns 500 on insert error', async () => {
    makePostMyMock({ insertError: true });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Project' }));
    expect(res.status).toBe(500);
  });

  it('returns 201 with new project on success', async () => {
    makePostMyMock({ insertedProject: { id: 'new-1', owner_id: 'user-1', name: 'New Project', status: 'draft' } });
    const { POST } = await import('@/app/api/project/my/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/my', 'POST', { name: 'New Project' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { project: ProjectRow };
    expect(json.project.id).toBe('new-1');
  });
});

describe('T128 GET /api/project/status-log', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeStatusLogMock(options: {
    userId?: string | null;
    role?: string | null;
    projectId?: string | null;
    logRows?: LogRow[];
    logError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const role = options.role === undefined ? 'project' : options.role;
    const projectId = options.projectId !== undefined ? options.projectId : 'proj-1';
    const logRows = options.logRows ?? [];

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
      })),
    }));
    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'users') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({ data: userId ? { role } : null, error: null })),
                })),
              })),
            };
          }
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  single: jest.fn(async () => ({ data: projectId ? { id: projectId } : null, error: null })),
                })),
              })),
            };
          }
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(async () => ({
                  data: options.logError ? null : logRows,
                  error: options.logError ? { message: 'db error' } : null,
                })),
              })),
            })),
          };
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatusLogMock({ userId: null });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is investor', async () => {
    makeStatusLogMock({ role: 'investor' });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 403 when role is admin (projectId stays null for staff)', async () => {
    makeStatusLogMock({ role: 'admin' });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it('returns 200 with empty log when project role user has no project', async () => {
    makeStatusLogMock({ role: 'project', projectId: null });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ log: [] });
  });

  it('returns 500 on log DB error', async () => {
    makeStatusLogMock({ role: 'project', logError: true });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with status log for project role', async () => {
    makeStatusLogMock({
      role: 'project',
      logRows: [{
        id: 'log-1',
        project_id: 'proj-1',
        old_status: 'draft',
        new_status: 'submitted',
        changed_at: '2026-06-01T10:00:00Z',
        changed_by: 'user-1',
      }],
    });
    const { GET } = await import('@/app/api/project/status-log/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { log: LogRow[] };
    expect(json.log[0].new_status).toBe('submitted');
  });
});

describe('T128 GET /api/project/stats', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeStatsMock(options: {
    userId?: string | null;
    projectStatus?: string | null;
    projectError?: boolean;
    parallelError?: boolean;
    appRows?: Array<{ status: string }>;
    viewRows?: Array<{ investor_id: string }>;
    favCount?: number;
    portfolioCount?: number;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const projectStatus = options.projectStatus !== undefined ? options.projectStatus : 'approved';
    const parallelError = options.parallelError ? { message: 'parallel error' } : null;

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              maybeSingle: jest.fn(async () => ({
                data: options.projectError || !projectStatus ? null : { id: 'proj-1', status: projectStatus },
                error: options.projectError ? { message: 'project error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => ({
          select: jest.fn(() => ({
            eq: jest.fn(async () => {
              if (table === 'investor_favorites') return { count: options.favCount ?? 0, data: null, error: parallelError };
              if (table === 'applications') return { data: parallelError ? null : options.appRows ?? [], error: parallelError };
              if (table === 'investor_portfolio') return { count: options.portfolioCount ?? 0, data: null, error: null };
              return { data: parallelError ? null : options.viewRows ?? [], error: null };
            }),
          })),
        })),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeStatsMock({ userId: null });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 on project DB error', async () => {
    makeStatsMock({ projectError: true });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 404 when no project found', async () => {
    makeStatsMock({ projectStatus: null });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 403 when project is not approved', async () => {
    makeStatsMock({ projectStatus: 'submitted' });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('project_not_approved');
  });

  it('returns 500 when a parallel query fails', async () => {
    makeStatsMock({ parallelError: true });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with correct stats shape', async () => {
    makeStatsMock({
      favCount: 5,
      portfolioCount: 2,
      viewRows: [{ investor_id: 'inv-1' }, { investor_id: 'inv-2' }, { investor_id: 'inv-1' }],
      appRows: [{ status: 'pending' }, { status: 'pending' }, { status: 'approved' }, { status: 'rejected' }],
    });
    const { GET } = await import('@/app/api/project/stats/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      favorites_count: number;
      portfolio_count: number;
      views_count: number;
      unique_viewers: number;
      applications: Record<string, number>;
    };
    expect(json.favorites_count).toBe(5);
    expect(json.portfolio_count).toBe(2);
    expect(json.views_count).toBe(3);
    expect(json.unique_viewers).toBe(2);
    expect(json.applications.total).toBe(4);
    expect(json.applications.pending).toBe(2);
    expect(json.applications.approved).toBe(1);
    expect(json.applications.rejected).toBe(1);
  });
});

describe('T128 GET /api/project/updates', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeGetUpdatesMock(options: {
    userId?: string | null;
    project?: { id: string; name: string } | null;
    updates?: UpdateRow[];
    updatesError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1', name: 'My Startup' };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
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
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                order: jest.fn(async () => ({
                  data: options.updatesError ? null : options.updates ?? [],
                  error: options.updatesError ? { message: 'db error' } : null,
                })),
              })),
            })),
          };
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeGetUpdatesMock({ userId: null });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty array when no project', async () => {
    makeGetUpdatesMock({ project: null });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([]);
  });

  it('returns 500 on updates DB error', async () => {
    makeGetUpdatesMock({ updatesError: true });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with updates list', async () => {
    makeGetUpdatesMock({
      updates: [{
        id: 'upd-1',
        project_id: 'proj-1',
        title: 'Новость',
        body: 'Текст обновления',
        ai_summary: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }],
    });
    const { GET } = await import('@/app/api/project/updates/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as UpdateRow[];
    expect(json[0].title).toBe('Новость');
  });
});

describe('T128 POST /api/project/updates', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/ai/updates');
    jest.dontMock('@/lib/notifications/notify-project-investors');
    jest.dontMock('@/lib/notifications/notify-project-update');
  });

  function makePostUpdatesMock(options: {
    userId?: string | null;
    project?: { id: string; name: string } | null;
    insertError?: boolean;
    insertedUpdate?: UpdateRow | null;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1', name: 'My Startup' };
    const inserted = options.insertedUpdate ?? {
      id: 'upd-new',
      project_id: 'proj-1',
      title: 'Новость',
      body: 'Текст',
      ai_summary: null,
      created_at: '2026-06-30T00:00:00Z',
      updated_at: '2026-06-30T00:00:00Z',
    };

    jest.doMock('@/lib/ai/updates', () => ({ generateUpdateSummary: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-investors', () => ({ notifyProjectInvestors: jest.fn(async () => {}) }));
    jest.doMock('@/lib/notifications/notify-project-update', () => ({ notifyProjectUpdate: jest.fn() }));
    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
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
          return {
            insert: jest.fn(() => ({
              select: jest.fn(() => ({
                single: jest.fn(async () => ({
                  data: options.insertError ? null : inserted,
                  error: options.insertError ? { message: 'insert error' } : null,
                })),
              })),
            })),
          };
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makePostUpdatesMock({ userId: null });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Title', body: 'Body text' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when title is missing', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { body: 'Some text' }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('Invalid update');
  });

  it('returns 400 when title exceeds 200 chars', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'A'.repeat(201), body: 'Some text' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is missing', async () => {
    makePostUpdatesMock({});
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Title' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when no project found', async () => {
    makePostUpdatesMock({ project: null });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Title', body: 'Body text' }));
    expect(res.status).toBe(404);
  });

  it('returns 500 on insert error', async () => {
    makePostUpdatesMock({ insertError: true });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Title', body: 'Body text' }));
    expect(res.status).toBe(500);
  });

  it('returns 201 with created update on success', async () => {
    makePostUpdatesMock({
      insertedUpdate: {
        id: 'upd-1',
        project_id: 'proj-1',
        title: 'Новость',
        body: 'Текст обновления',
        ai_summary: null,
        created_at: '2026-06-30T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      },
    });
    const { POST } = await import('@/app/api/project/updates/route');
    const res = await POST(makeJsonRequest('http://localhost/api/project/updates', 'POST', { title: 'Новость', body: 'Текст обновления' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { id: string; title: string };
    expect(json.id).toBe('upd-1');
    expect(json.title).toBe('Новость');
  });
});

describe('T128 DELETE /api/project/updates/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/server');
  });

  function makeDeleteUpdateMock(options: {
    userId?: string | null;
    project?: { id: string } | null;
    projectError?: boolean;
    update?: { id: string; project_id: string } | null;
    updateError?: boolean;
    deleteError?: boolean;
  }) {
    jest.resetModules();
    const userId = options.userId === undefined ? 'user-1' : options.userId;
    const project = options.project !== undefined ? options.project : { id: 'proj-1' };
    const update = options.update !== undefined ? options.update : { id: 'upd-1', project_id: 'proj-1' };

    jest.doMock('@/lib/supabase/server', () => ({
      createClient: jest.fn(async () => ({
        auth: { getUser: jest.fn(async () => ({ data: { user: userId ? { id: userId } : null } })) },
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: project,
                    error: options.projectError ? { message: 'project error' } : null,
                  })),
                })),
              })),
            };
          }
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: options.updateError ? null : update,
                    error: options.updateError ? { message: 'update error' } : null,
                  })),
                })),
              })),
            })),
            delete: jest.fn(() => ({
              eq: jest.fn(() => ({
                eq: jest.fn(async () => ({
                  error: options.deleteError ? { message: 'delete error' } : null,
                })),
              })),
            })),
          };
        }),
      })),
    }));
  }

  it('returns 401 when unauthenticated', async () => {
    makeDeleteUpdateMock({ userId: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/upd-1'), makeContext('upd-1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no project found', async () => {
    makeDeleteUpdateMock({ project: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/upd-1'), makeContext('upd-1'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on update select error', async () => {
    makeDeleteUpdateMock({ updateError: true });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/upd-1'), makeContext('upd-1'));
    expect(res.status).toBe(500);
  });

  it('returns 404 when update not found or not owned by project', async () => {
    makeDeleteUpdateMock({ update: null });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/other-upd'), makeContext('other-upd'));
    expect(res.status).toBe(404);
  });

  it('returns 500 on delete DB error', async () => {
    makeDeleteUpdateMock({ deleteError: true });
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/upd-1'), makeContext('upd-1'));
    expect(res.status).toBe(500);
  });

  it('returns 200 with { success: true } on successful deletion', async () => {
    makeDeleteUpdateMock({});
    const { DELETE } = await import('@/app/api/project/updates/[id]/route');
    const res = await DELETE(makeGetRequest('http://localhost/api/project/updates/upd-1'), makeContext('upd-1'));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ success: true });
  });
});
