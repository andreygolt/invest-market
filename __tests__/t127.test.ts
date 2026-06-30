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

describe('T127 GET /api/admin/projects', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  type ProjectRow = {
    id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
    moderated_at: string | null;
    rejection_reason: string | null;
    owner_id: string;
  };

  function makeListMock(options: { dbError?: boolean; rows?: ProjectRow[] }) {
    jest.resetModules();

    const rows = options.rows ?? [];

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            in: jest.fn(() => ({
              order: jest.fn(async () => ({
                data: options.dbError ? null : rows,
                error: options.dbError ? { message: 'db error' } : null,
              })),
            })),
          })),
        })),
      })),
    }));
  }

  it('returns 500 on DB error', async () => {
    makeListMock({ dbError: true });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(500);
  });

  it('returns 200 with empty array when no projects', async () => {
    makeListMock({ rows: [] });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toEqual([]);
  });

  it('returns 200 with projects list', async () => {
    makeListMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Тест Проект',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].name).toBe('Тест Проект');
    expect(json.projects[0].status).toBe('submitted');
  });

  it('returns 200 with projects of both submitted and under_review status', async () => {
    makeListMock({
      rows: [
        {
          id: 'proj-1',
          name: 'Submitted Project',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        },
        {
          id: 'proj-2',
          name: 'Under Review Project',
          status: 'under_review',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-11T00:00:00Z',
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-2',
        },
      ],
    });
    const { GET } = await import('@/app/api/admin/projects/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const json = (await res.json()) as { projects: ProjectRow[] };
    expect(json.projects).toHaveLength(2);
  });
});

describe('T127 GET /api/admin/projects/[id]', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
  });

  function makeDetailMock(options: {
    projectError?: boolean;
    notFound?: boolean;
    questionnaireRows?: Array<{ section: string; answers: Record<string, unknown> }>;
    aiReport?: { id: string; status: string; report: unknown; updated_at: string } | null;
  }) {
    jest.resetModules();

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          name: 'Тест Проект',
          status: 'submitted',
          created_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-10T00:00:00Z',
          moderated_by: null,
          moderated_at: null,
          rejection_reason: null,
          owner_id: 'owner-1',
        };
    const questionnaireRows = options.questionnaireRows ?? [];
    const aiReport = options.aiReport !== undefined ? options.aiReport : null;

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: options.projectError ? null : projectData,
                    error: options.projectError ? { message: 'project error' } : null,
                  })),
                })),
              })),
            };
          }
          if (table === 'project_questionnaire') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  order: jest.fn(async () => ({
                    data: questionnaireRows,
                    error: null,
                  })),
                })),
              })),
            };
          }
          if (table === 'ai_reports') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: aiReport,
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

  it('returns 404 when project not found', async () => {
    makeDetailMock({ notFound: true });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/missing-1'),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when project DB error', async () => {
    makeDetailMock({ projectError: true });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 200 with project, empty questionnaire, null ai_report', async () => {
    makeDetailMock({});
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      project: { id: string; name: string };
      questionnaire: unknown[];
      ai_report: unknown | null;
    };
    expect(json.project.id).toBe('proj-1');
    expect(json.project.name).toBe('Тест Проект');
    expect(json.questionnaire).toEqual([]);
    expect(json.ai_report).toBeNull();
  });

  it('returns 200 with questionnaire sections and ai_report', async () => {
    makeDetailMock({
      questionnaireRows: [
        { section: 's1', answers: { company_name: 'ООО Тест' } },
        { section: 's2', answers: { revenue: 10000000 } },
      ],
      aiReport: {
        id: 'report-1',
        status: 'done',
        report: { score: 85 },
        updated_at: '2026-06-15T00:00:00Z',
      },
    });
    const { GET } = await import('@/app/api/admin/projects/[id]/route');
    const res = await GET(
      makeGetRequest('http://localhost/api/admin/projects/proj-1'),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      project: { id: string };
      questionnaire: Array<{ section: string }>;
      ai_report: { id: string; status: string } | null;
    };
    expect(json.questionnaire).toHaveLength(2);
    expect(json.questionnaire[0].section).toBe('s1');
    expect(json.ai_report?.id).toBe('report-1');
    expect(json.ai_report?.status).toBe('done');
  });
});

describe('T127 POST /api/admin/projects/[id]/approve', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
    jest.dontMock('@/lib/notifications/notify-investors-new-deal');
  });

  function makeApproveMock(options: {
    notFound?: boolean;
    projectStatus?: string;
    updateError?: boolean;
  }) {
    jest.resetModules();

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-status', () => ({
      notifyProjectStatus: jest.fn(),
    }));
    jest.doMock('@/lib/notifications/notify-investors-new-deal', () => ({
      notifyInvestorsNewDeal: jest.fn(),
    }));

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          status: options.projectStatus ?? 'submitted',
          owner_id: 'owner-1',
          name: 'Тест Проект',
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: projectData,
                    error: options.notFound ? { message: 'not found' } : null,
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
          if (table === 'admin_action_log') {
            return {
              insert: jest.fn(async () => ({ data: null, error: null })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 400 when moderator_id is missing', async () => {
    makeApproveMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {}),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('moderator_id');
  });

  it('returns 404 when project not found', async () => {
    makeApproveMock({ notFound: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/missing-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when project status is already approved', async () => {
    makeApproveMock({ projectStatus: 'approved' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('cannot approve project with status: approved');
  });

  it('returns 400 when project status is draft', async () => {
    makeApproveMock({ projectStatus: 'draft' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makeApproveMock({ updateError: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true, status: approved } for submitted project', async () => {
    makeApproveMock({ projectStatus: 'submitted' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });

  it('returns 200 for under_review project', async () => {
    makeApproveMock({ projectStatus: 'under_review' });
    const { POST } = await import('@/app/api/admin/projects/[id]/approve/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/approve', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('approved');
  });
});

describe('T127 POST /api/admin/projects/[id]/reject', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('@/lib/supabase/admin');
    jest.dontMock('@/lib/audit/log');
    jest.dontMock('@/lib/notifications/create');
    jest.dontMock('@/lib/notifications/notify-project-status');
  });

  function makeRejectMock(options: {
    notFound?: boolean;
    projectStatus?: string;
    updateError?: boolean;
  }) {
    jest.resetModules();

    jest.doMock('@/lib/audit/log', () => ({ writeAuditLog: jest.fn() }));
    jest.doMock('@/lib/notifications/create', () => ({ createNotification: jest.fn() }));
    jest.doMock('@/lib/notifications/notify-project-status', () => ({
      notifyProjectStatus: jest.fn(),
    }));

    const projectData = options.notFound
      ? null
      : {
          id: 'proj-1',
          status: options.projectStatus ?? 'submitted',
          owner_id: 'owner-1',
          name: 'Тест Проект',
        };

    jest.doMock('@/lib/supabase/admin', () => ({
      createAdminClient: jest.fn(() => ({
        from: jest.fn((table: string) => {
          if (table === 'projects') {
            return {
              select: jest.fn(() => ({
                eq: jest.fn(() => ({
                  maybeSingle: jest.fn(async () => ({
                    data: projectData,
                    error: options.notFound ? { message: 'not found' } : null,
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
          if (table === 'admin_action_log') {
            return {
              insert: jest.fn(async () => ({ data: null, error: null })),
            };
          }
          return {};
        }),
      })),
    }));
  }

  it('returns 400 when moderator_id is missing', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        rejection_reason: 'Недостаточно информации',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('moderator_id');
  });

  it('returns 400 when rejection_reason is missing', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('rejection_reason must be at least 10 characters');
  });

  it('returns 400 when rejection_reason is shorter than 10 characters', async () => {
    makeRejectMock({});
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Коротко',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('rejection_reason must be at least 10 characters');
  });

  it('returns 404 when project not found', async () => {
    makeRejectMock({ notFound: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/missing-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('missing-1')
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when project status is already rejected', async () => {
    makeRejectMock({ projectStatus: 'rejected' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toContain('cannot reject project with status: rejected');
  });

  it('returns 400 when project status is approved', async () => {
    makeRejectMock({ projectStatus: 'approved' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(400);
  });

  it('returns 500 on DB update error', async () => {
    makeRejectMock({ updateError: true });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(500);
  });

  it('returns 200 with { ok: true, status: rejected } for submitted project', async () => {
    makeRejectMock({ projectStatus: 'submitted' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Недостаточно информации для анализа',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });

  it('returns 200 for under_review project', async () => {
    makeRejectMock({ projectStatus: 'under_review' });
    const { POST } = await import('@/app/api/admin/projects/[id]/reject/route');
    const res = await POST(
      makeJsonRequest('http://localhost/api/admin/projects/proj-1/reject', 'POST', {
        moderator_id: 'mod-1',
        rejection_reason: 'Проект не соответствует требованиям платформы',
      }),
      makeContext('proj-1')
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; status: string };
    expect(json.ok).toBe(true);
    expect(json.status).toBe('rejected');
  });
});
