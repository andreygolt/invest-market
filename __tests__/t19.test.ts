import { NextRequest } from 'next/server';
import { GET, POST } from '@/app/api/admin/projects/[id]/ai-report/route';
import { runAnalysisPipeline } from '@/lib/ai/analyze';
import type { AdminAIReportResponse, AdminReportDocument, AIReportRow } from '@/types';

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();

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

jest.mock('@/lib/ai/analyze', () => ({
  runAnalysisPipeline: jest.fn(),
}));

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeMaybeSingleByProjectQuery(data: unknown) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        maybeSingle: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function makeRowsByProjectQuery(data: unknown[]) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(async () => ({ data, error: null })),
    })),
  };
}

const context = {
  params: Promise.resolve({ id: 'project-1' }),
};

describe('T19 admin AI report API', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    jest.mocked(runAnalysisPipeline).mockReset();
  });

  it('GET /api/admin/projects/[id]/ai-report returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/admin/projects/[id]/ai-report returns 403 for investor role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeRowsByProjectQuery([]);
    });

    const response = await GET(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET /api/admin/projects/[id]/ai-report returns 200 with report and documents for admin', async () => {
    const report: AIReportRow = {
      id: 'report-1',
      project_id: 'project-1',
      report: {
        red_flags: [],
        missing_data: [],
        draft_card: 'Draft',
        ai_score: 7,
        summary: 'Summary',
      },
      status: 'done',
      created_at: '2026-06-28T00:00:00Z',
      updated_at: '2026-06-28T00:00:00Z',
    };

    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      return makeRowsByProjectQuery([]);
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'ai_reports') return makeMaybeSingleByProjectQuery(report);
      if (table === 'project_documents') {
        return makeRowsByProjectQuery([
          { id: 'doc-1', filename: 'deck.pdf', doc_type: 'pitch_deck' },
        ]);
      }
      if (table === 'document_extractions') {
        return makeRowsByProjectQuery([{ document_id: 'doc-1', status: 'done' }]);
      }
      return makeRowsByProjectQuery([]);
    });

    const response = await GET(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = (await response.json()) as AdminAIReportResponse;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      report,
      documents: [
        {
          id: 'doc-1',
          file_name: 'deck.pdf',
          document_type: 'pitch_deck',
          extraction_status: 'done',
        },
      ],
    });
  });

  it('POST /api/admin/projects/[id]/ai-report returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('POST /api/admin/projects/[id]/ai-report returns 403 for moderator role', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'moderator-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('moderator');
      return makeRowsByProjectQuery([]);
    });

    const response = await POST(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('POST /api/admin/projects/[id]/ai-report returns 404 when project is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      return makeRowsByProjectQuery([]);
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeMaybeSingleByProjectQuery(null);
      return makeRowsByProjectQuery([]);
    });

    const response = await POST(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Project not found');
  });

  it('POST /api/admin/projects/[id]/ai-report returns 202 for admin and found project', async () => {
    jest.mocked(runAnalysisPipeline).mockResolvedValue();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockServerFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      return makeRowsByProjectQuery([]);
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeMaybeSingleByProjectQuery({ id: 'project-1' });
      return makeRowsByProjectQuery([]);
    });

    const response = await POST(new NextRequest('http://localhost/api/admin/projects/project-1/ai-report'), context);
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ message: 'AI-анализ запущен' });
    expect(runAnalysisPipeline).toHaveBeenCalledWith('project-1');
  });
});

describe('T19 admin AI report types', () => {
  it('AdminReportDocument has required fields', () => {
    const document: AdminReportDocument = {
      id: 'doc-1',
      file_name: 'deck.pdf',
      document_type: 'pitch_deck',
      extraction_status: 'done',
    };

    expect(document.id).toBe('doc-1');
    expect(document.file_name).toBe('deck.pdf');
    expect(document.document_type).toBe('pitch_deck');
    expect(document.extraction_status).toBe('done');
  });

  it('AdminAIReportResponse has report and documents fields', () => {
    const response: AdminAIReportResponse = {
      report: null,
      documents: [],
    };

    expect(response.report).toBeNull();
    expect(Array.isArray(response.documents)).toBe(true);
  });
});
