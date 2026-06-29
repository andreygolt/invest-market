import { NextRequest } from 'next/server';

type NotificationInsert = {
  user_id: string;
  title: string;
  body: string;
  link: string;
};

type CommercialTermsRow = {
  id: string;
  project_id: string;
  success_fee_pct: number;
  fixed_fee: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/commercial-terms', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function loadNotifyCommercialTermsTest(options?: {
  project?: { owner_id: string | null; name: string } | null;
  inserted?: { id: string } | null;
  insertThrows?: boolean;
}) {
  jest.resetModules();

  const mockMaybeSingle = jest.fn(async () => ({
    data:
      options && 'project' in options
        ? options.project
        : { owner_id: 'owner-uuid', name: 'Тестовый проект' },
    error: null,
  }));
  const mockProjectSelect = jest.fn(() => ({
    eq: jest.fn(() => ({
      maybeSingle: mockMaybeSingle,
    })),
  }));
  const mockNotificationSingle = jest.fn(async () => ({
    data: options && 'inserted' in options ? options.inserted : { id: 'notif-uuid' },
    error: options && 'inserted' in options && options.inserted === null ? { message: 'DB error' } : null,
  }));
  const mockNotificationSelect = jest.fn(() => ({
    single: mockNotificationSingle,
  }));
  const mockInsert = jest.fn((row: NotificationInsert) => {
    void row;
    if (options?.insertThrows) throw new Error('insert failed');
    return {
      select: mockNotificationSelect,
    };
  });
  const mockFrom = jest.fn((table: string) => {
    if (table === 'projects') {
      return {
        select: mockProjectSelect,
      };
    }

    if (table === 'notifications') {
      return {
        insert: mockInsert,
      };
    }

    return {};
  });

  jest.doMock('@/lib/supabase/admin', () => ({
    createAdminClient: jest.fn(() => ({
      from: mockFrom,
    })),
  }));

  const notifyModule = await import('@/lib/notifications/notify-commercial-terms');

  return {
    notifyCommercialTerms: notifyModule.notifyCommercialTerms,
    mockInsert,
  };
}

function makeCommercialTermsRow(overrides?: Partial<CommercialTermsRow>): CommercialTermsRow {
  return {
    id: 'terms-uuid',
    project_id: 'project-uuid',
    success_fee_pct: 7.5,
    fixed_fee: 150000,
    notes: null,
    created_by: 'admin-uuid',
    created_at: '2026-06-29T10:00:00.000Z',
    updated_at: '2026-06-29T10:00:00.000Z',
    ...overrides,
  };
}

async function loadCommercialTermsRouteTest(options?: { terms?: CommercialTermsRow }) {
  jest.resetModules();

  const terms = options?.terms ?? makeCommercialTermsRow();
  const mockNotifyCommercialTerms = jest.fn().mockResolvedValue(undefined);
  const usersQuery = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: { role: 'admin' },
      error: null,
    })),
  };
  const termsQuery = {
    upsert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: terms,
      error: null,
    })),
  };
  const mockFrom = jest.fn((table: string) => {
    if (table === 'users') return usersQuery;
    if (table === 'commercial_terms') return termsQuery;
    return {};
  });

  jest.doMock('@/lib/supabase/server', () => ({
    createClient: jest.fn().mockResolvedValue({
      auth: {
        getUser: jest.fn().mockResolvedValue({
          data: { user: { id: 'admin-uuid' } },
        }),
      },
      from: mockFrom,
    }),
  }));
  jest.doMock('@/lib/notifications/notify-commercial-terms', () => ({
    notifyCommercialTerms: mockNotifyCommercialTerms,
  }));

  const route = await import('@/app/api/admin/commercial-terms/route');

  return {
    POST: route.POST,
    mockNotifyCommercialTerms,
  };
}

describe('T76 notifyCommercialTerms', () => {
  beforeEach(() => {
    restoreEnv();
    global.fetch = jest.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.dontMock('@/lib/supabase/admin');
  });

  it('returns early when project is not found', async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest({
      project: null,
    });

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns early when owner_id is null', async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest({
      project: { owner_id: null, name: 'Тестовый проект' },
    });

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("uses title 'Коммерческие условия установлены'", async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Коммерческие условия установлены' })
    );
  });

  it('body contains project name and success fee', async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.body).toContain('Тестовый проект');
    expect(row.body).toContain('7.5%');
  });

  it("uses '/project' link", async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ link: '/project' }));
  });

  it('calls dispatch-email fetch once after insert', async () => {
    const { notifyCommercialTerms } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://invest.test/api/notifications/dispatch-email',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('does not throw when insert fails', async () => {
    const { notifyCommercialTerms } = await loadNotifyCommercialTermsTest({ insertThrows: true });

    await expect(
      notifyCommercialTerms({
        projectId: 'project-uuid',
        successFeePct: 7.5,
        fixedFee: 0,
        baseUrl: 'https://invest.test',
      })
    ).resolves.toBeUndefined();
  });

  it('body contains fixed fee when fixedFee is positive', async () => {
    const { notifyCommercialTerms, mockInsert } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 150000,
      baseUrl: 'https://invest.test',
    });

    const [row] = mockInsert.mock.calls[0] as [NotificationInsert];
    expect(row.body.replace(/\s/g, ' ')).toContain('150 000 ₽');
  });

  it('passes notificationId and owner_id to dispatch-email payload', async () => {
    const { notifyCommercialTerms } = await loadNotifyCommercialTermsTest();

    await notifyCommercialTerms({
      projectId: 'project-uuid',
      successFeePct: 7.5,
      fixedFee: 0,
      baseUrl: 'https://invest.test',
    });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      notificationId: 'notif-uuid',
      userId: 'owner-uuid',
    });
  });
});

describe('T76 POST /api/admin/commercial-terms', () => {
  afterEach(() => {
    jest.dontMock('@/lib/supabase/server');
    jest.dontMock('@/lib/notifications/notify-commercial-terms');
  });

  it('calls notifyCommercialTerms after successful upsert', async () => {
    const { POST, mockNotifyCommercialTerms } = await loadCommercialTermsRouteTest();

    const response = await POST(
      makePostRequest({
        project_id: 'project-uuid',
        success_fee_pct: 7.5,
        fixed_fee: 150000,
      })
    );

    expect(response.status).toBe(200);
    expect(mockNotifyCommercialTerms).toHaveBeenCalledTimes(1);
  });

  it('passes projectId, successFeePct and fixedFee from upsert data to notifyCommercialTerms', async () => {
    const { POST, mockNotifyCommercialTerms } = await loadCommercialTermsRouteTest({
      terms: makeCommercialTermsRow({
        project_id: 'project-from-data',
        success_fee_pct: 9,
        fixed_fee: 250000,
      }),
    });

    await POST(
      makePostRequest({
        project_id: 'project-request',
        success_fee_pct: 7.5,
        fixed_fee: 150000,
      })
    );

    expect(mockNotifyCommercialTerms).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'project-from-data',
        successFeePct: 9,
        fixedFee: 250000,
      })
    );
  });

  it('does not call notifyCommercialTerms for invalid data', async () => {
    const { POST, mockNotifyCommercialTerms } = await loadCommercialTermsRouteTest();

    const response = await POST(
      makePostRequest({
        success_fee_pct: 101,
        fixed_fee: 150000,
      })
    );

    expect(response.status).toBe(400);
    expect(mockNotifyCommercialTerms).not.toHaveBeenCalled();
  });
});
