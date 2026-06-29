import { NextRequest } from 'next/server';

import { POST as POST_REJECT_PROJECT } from '@/app/api/admin/projects/[id]/reject/route';
import { POST as POST_SUBMIT_PROJECT } from '@/app/api/project/submit/route';
import { createNotification } from '@/lib/notifications/create';
import type { ProjectDashboardData, ProjectStatus } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockCreateNotification = jest.mocked(createNotification);

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockServerFrom,
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn(),
}));

type ProjectSubmitRow = {
  id: string;
  status: ProjectStatus;
};

type ProjectRejectRow = {
  id: string;
  status: ProjectStatus;
  owner_id: string;
  name: string;
};

type QueryResult<T> = {
  data: T;
  error: { message: string } | null;
};

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function makeSubmitProjectQuery(project: ProjectSubmitRow | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async (): Promise<QueryResult<ProjectSubmitRow | null>> => ({
          data: project,
          error: null,
        })),
      })),
    })),
  };
}

function makeQuestionnaireQuery(sections: string[]) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async (): Promise<QueryResult<Array<{ section: string }>>> => ({
        data: sections.map((section) => ({ section })),
        error: null,
      })),
    })),
  };
}

function makeAdminUpdateQuery(updateSpy: jest.Mock) {
  return {
    update: updateSpy.mockImplementation(() => ({
      eq: jest.fn(async (): Promise<QueryResult<null>> => ({ data: null, error: null })),
    })),
  };
}

function makeAdminInsertQuery(insertSpy: jest.Mock) {
  return {
    insert: insertSpy.mockImplementation(async (): Promise<QueryResult<null>> => ({
      data: null,
      error: null,
    })),
  };
}

function makeRejectProjectSelectQuery(project: ProjectRejectRow | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async (): Promise<QueryResult<ProjectRejectRow | null>> => ({
          data: project,
          error: null,
        })),
      })),
    })),
  };
}

function setupSubmitRoute(status: ProjectStatus, sections = ['s1']) {
  const updateSpy = jest.fn();
  const insertSpy = jest.fn();

  mockUser('user-1');
  mockServerFrom.mockImplementation((table: string) => {
    if (table === 'projects') {
      return makeSubmitProjectQuery({ id: 'project-1', status });
    }
    if (table === 'project_questionnaire') {
      return makeQuestionnaireQuery(sections);
    }
    return {};
  });
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeAdminUpdateQuery(updateSpy);
    if (table === 'project_status_log') return makeAdminInsertQuery(insertSpy);
    return {};
  });

  return { updateSpy, insertSpy };
}

describe('T36 project resubmit', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockCreateNotification.mockReset();
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("POST /api/project/submit returns 400 if status is 'approved'", async () => {
    setupSubmitRoute('approved');

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(response.status).toBe(400);
  });

  it("POST /api/project/submit returns 200 if status is 'rejected'", async () => {
    setupSubmitRoute('rejected');

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));
    const body = (await response.json()) as { status: string };

    expect(response.status).toBe(200);
    expect(body.status).toBe('submitted');
  });

  it('POST /api/project/submit resets rejection_reason on resubmit', async () => {
    const { updateSpy } = setupSubmitRoute('rejected');

    await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(updateSpy).toHaveBeenCalledWith({
      status: 'submitted',
      rejection_reason: null,
      moderated_by: null,
      moderated_at: null,
    });
  });

  it("POST /api/project/submit writes from_status = 'rejected' on resubmit", async () => {
    const { insertSpy } = setupSubmitRoute('rejected');

    await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(insertSpy).toHaveBeenCalledWith({
      project_id: 'project-1',
      from_status: 'rejected',
      to_status: 'submitted',
      changed_by: 'user-1',
    });
  });

  it("POST /api/project/submit returns 200 if status is 'draft'", async () => {
    setupSubmitRoute('draft');

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(response.status).toBe(200);
  });

  it('POST /api/project/submit returns 401 without auth', async () => {
    mockUser(null);

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(response.status).toBe(401);
  });

  it('POST /api/project/submit returns 400 if section s1 is missing', async () => {
    setupSubmitRoute('draft', ['s2']);

    const response = await POST_SUBMIT_PROJECT(new NextRequest('http://localhost/api/project/submit'));

    expect(response.status).toBe(400);
  });

  it('ProjectDashboardData contains rejection_reason', () => {
    const project: ProjectDashboardData = {
      id: 'project-1',
      name: 'Project',
      status: 'rejected',
      questionnaire_s1: null,
      questionnaire_s5: null,
      video_path: null,
      created_at: '2026-06-28T10:00:00Z',
      rejection_reason: 'Недостаточно данных о рынке',
    };

    expect(project.rejection_reason).toBe('Недостаточно данных о рынке');
  });

  it('POST /api/admin/projects/[id]/reject notification body contains rejection reason', async () => {
    const updateSpy = jest.fn();
    const actionLogInsertSpy = jest.fn();
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'projects') {
        const projectCalls = mockAdminFrom.mock.calls.filter(([name]) => name === 'projects').length;
        return projectCalls === 1
          ? makeRejectProjectSelectQuery({
              id: 'project-1',
              status: 'submitted',
              owner_id: 'owner-1',
              name: 'Проект',
            })
          : makeAdminUpdateQuery(updateSpy);
      }
      if (table === 'admin_action_log') return makeAdminInsertQuery(actionLogInsertSpy);
      return {};
    });

    const response = await POST_REJECT_PROJECT(
      new NextRequest('http://localhost/api/admin/projects/project-1/reject', {
        method: 'POST',
        body: JSON.stringify({
          moderator_id: 'moderator-1',
          rejection_reason: 'Недостаточно данных о рынке',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Ваш проект «Проект» был отклонён. Причина: Недостаточно данных о рынке',
      })
    );
  });

  it('POST /api/admin/projects/[id]/reject returns 400 if rejection_reason is shorter than 10 chars', async () => {
    const response = await POST_REJECT_PROJECT(
      new NextRequest('http://localhost/api/admin/projects/project-1/reject', {
        method: 'POST',
        body: JSON.stringify({
          moderator_id: 'moderator-1',
          rejection_reason: 'коротко',
        }),
      }),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(400);
  });
});
