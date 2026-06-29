import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/project/my/route';
import { buildChecklist } from '@/lib/project/checklist';
import type { ProjectDashboardData } from '@/types';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

const baseProject: ProjectDashboardData = {
  id: 'project-1',
  name: 'Project',
  status: 'draft',
  questionnaire_s1: null,
  questionnaire_s5: null,
  video_path: null,
  created_at: '2026-06-28T10:00:00Z',
  rejection_reason: null,
};

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function makeProjectSelectQuery(project: ProjectDashboardData | null) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: project, error: null })),
      })),
    })),
  };
}

function makeProjectInsertQuery(project: ProjectDashboardData | null, created: ProjectDashboardData) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data: project, error: null })),
      })),
    })),
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({ data: created, error: null })),
      })),
    })),
  };
}

describe('T25 project dashboard checklist', () => {
  it('ProjectChecklist: questionnaire14=true если questionnaire_s1 !== null', () => {
    const checklist = buildChecklist({ ...baseProject, questionnaire_s1: { description: 'x' } }, 0);

    expect(checklist.questionnaire14).toBe(true);
  });

  it('ProjectChecklist: questionnaire58=true если questionnaire_s5 !== null', () => {
    const checklist = buildChecklist({ ...baseProject, questionnaire_s5: { revenue_current: '1' } }, 0);

    expect(checklist.questionnaire58).toBe(true);
  });

  it("ProjectChecklist: submitted=true если status !== 'draft'", () => {
    const checklist = buildChecklist({ ...baseProject, status: 'submitted' }, 0);

    expect(checklist.submitted).toBe(true);
  });

  it('ProjectChecklist: все false для нового проекта', () => {
    expect(buildChecklist(baseProject, 0)).toEqual({
      questionnaire14: false,
      questionnaire58: false,
      hasDocuments: false,
      hasVideo: false,
      submitted: false,
    });
  });

  it('ProjectChecklist: все true для полностью заполненного проекта', () => {
    expect(buildChecklist({
      ...baseProject,
      status: 'approved',
      questionnaire_s1: { description: 'x' },
      questionnaire_s5: { revenue_current: '1' },
      video_path: 'videos/project-1.mp4',
    }, 1)).toEqual({
      questionnaire14: true,
      questionnaire58: true,
      hasDocuments: true,
      hasVideo: true,
      submitted: true,
    });
  });
});

describe('T25 /api/project/my', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/project/my — 401 без авторизации', async () => {
    mockUser(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('GET /api/project/my — возвращает null project если проект не создан', async () => {
    mockUser('user-1');
    mockFrom.mockReturnValue(makeProjectSelectQuery(null));

    const response = await GET();
    const body = (await response.json()) as { project: ProjectDashboardData | null };

    expect(response.status).toBe(200);
    expect(body.project).toBeNull();
  });

  it('GET /api/project/my — возвращает project с полями id, name, status', async () => {
    mockUser('user-1');
    mockFrom.mockReturnValue(makeProjectSelectQuery(baseProject));

    const response = await GET();
    const body = (await response.json()) as { project: ProjectDashboardData };

    expect(response.status).toBe(200);
    expect(body.project.id).toBe('project-1');
    expect(body.project.name).toBe('Project');
    expect(body.project.status).toBe('draft');
  });

  it('POST /api/project/my — 400 если name пустой', async () => {
    mockUser('user-1');

    const response = await POST(new NextRequest('http://localhost/api/project/my', {
      method: 'POST',
      body: JSON.stringify({ name: ' ' }),
    }));

    expect(response.status).toBe(400);
  });

  it('POST /api/project/my — 201 с новым проектом', async () => {
    const created = { ...baseProject, name: 'New Project' };
    mockUser('user-1');
    mockFrom.mockReturnValue(makeProjectInsertQuery(null, created));

    const response = await POST(new NextRequest('http://localhost/api/project/my', {
      method: 'POST',
      body: JSON.stringify({ name: ' New Project ' }),
    }));
    const body = (await response.json()) as { project: ProjectDashboardData };

    expect(response.status).toBe(201);
    expect(body.project.id).toBe('project-1');
    expect(body.project.name).toBe('New Project');
    expect(body.project.status).toBe('draft');
  });
});
