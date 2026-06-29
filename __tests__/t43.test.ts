import { NextRequest } from 'next/server';
import { GET as getInvestorDocuments } from '@/app/api/investor/deals/[id]/documents/route';
import type { DocumentType, InvestorDocumentItem, ProjectStatus } from '@/types';

const mockGetUser = jest.fn();
const mockAdminFrom = jest.fn();
const mockCreateSignedUrl = jest.fn();
const mockProjectMaybeSingle = jest.fn();
const mockDocsOrder = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: jest.fn(() => ({
        createSignedUrl: mockCreateSignedUrl,
      })),
    },
  })),
}));

type QueryError = {
  message: string;
};

type ProjectRow = {
  id: string;
  status: ProjectStatus;
};

type DocumentRow = {
  id: string;
  document_type: DocumentType;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
};

type JsonError = {
  error: string;
};

const mockDocs: DocumentRow[] = [
  {
    id: 'doc-1',
    document_type: 'pitch_deck',
    file_name: 'pitch.pdf',
    file_path: 'proj-1/pitch.pdf',
    file_size: 102400,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'doc-2',
    document_type: 'financial_model',
    file_name: 'model.xlsx',
    file_path: 'proj-1/model.xlsx',
    file_size: null,
    created_at: '2026-01-02T00:00:00Z',
  },
];

function mockUser(userId: string | null) {
  mockGetUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
    error: null,
  });
}

function makeProjectQuery() {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    maybeSingle: mockProjectMaybeSingle,
  };

  return query;
}

function makeDocumentsQuery() {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: mockDocsOrder,
  };

  return query;
}

function setupRoute(options: {
  userId?: string | null;
  project?: ProjectRow | null;
  docs?: DocumentRow[];
  signedUrl?: string;
  signedUrlError?: QueryError | null;
} = {}) {
  mockUser(options.userId === undefined ? 'user-1' : options.userId);
  mockProjectMaybeSingle.mockResolvedValue({
    data: options.project === undefined ? { id: 'proj-1', status: 'approved' } : options.project,
    error: null,
  });
  mockDocsOrder.mockResolvedValue({
    data: options.docs ?? mockDocs,
    error: null,
  });
  mockCreateSignedUrl.mockResolvedValue({
    data: { signedUrl: options.signedUrl ?? 'https://storage.example.com/signed?token=abc' },
    error: options.signedUrlError ?? null,
  });

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'projects') return makeProjectQuery();
    if (table === 'project_documents') return makeDocumentsQuery();
    return {};
  });
}

async function requestDocuments() {
  const response = await getInvestorDocuments(
    new NextRequest('http://localhost/api/investor/deals/proj-1/documents'),
    { params: Promise.resolve({ id: 'proj-1' }) }
  );
  const body = (await response.json()) as InvestorDocumentItem[] | JsonError;

  return { response, body };
}

describe('T43 investor deal documents API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupRoute();
  });

  it('GET /api/investor/deals/[id]/documents returns 401 without auth', async () => {
    setupRoute({ userId: null });

    const { response } = await requestDocuments();

    expect(response.status).toBe(401);
  });

  it('GET /api/investor/deals/[id]/documents returns 404 if project is not found', async () => {
    setupRoute({ project: null });

    const { response } = await requestDocuments();

    expect(response.status).toBe(404);
  });

  it("GET /api/investor/deals/[id]/documents returns 404 if project.status is not 'approved'", async () => {
    setupRoute({ project: { id: 'proj-1', status: 'draft' } });

    const { response } = await requestDocuments();

    expect(response.status).toBe(404);
  });

  it('GET /api/investor/deals/[id]/documents returns InvestorDocumentItem array', async () => {
    const { response, body } = await requestDocuments();

    expect(response.status).toBe(200);
    expect(body).toEqual([
      {
        id: 'doc-1',
        document_type: 'pitch_deck',
        file_name: 'pitch.pdf',
        file_size: 102400,
        created_at: '2026-01-01T00:00:00Z',
        download_url: 'https://storage.example.com/signed?token=abc',
      },
      {
        id: 'doc-2',
        document_type: 'financial_model',
        file_name: 'model.xlsx',
        file_size: null,
        created_at: '2026-01-02T00:00:00Z',
        download_url: 'https://storage.example.com/signed?token=abc',
      },
    ]);
  });

  it('GET /api/investor/deals/[id]/documents each item contains required fields', async () => {
    const { body } = await requestDocuments();
    const first = (body as InvestorDocumentItem[])[0];

    expect(first).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        document_type: expect.any(String),
        file_name: expect.any(String),
        file_size: expect.any(Number),
        created_at: expect.any(String),
        download_url: expect.any(String),
      })
    );
  });

  it('GET /api/investor/deals/[id]/documents calls createSignedUrl for every document', async () => {
    await requestDocuments();

    expect(mockCreateSignedUrl).toHaveBeenCalledTimes(2);
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(1, 'proj-1/pitch.pdf', 3600);
    expect(mockCreateSignedUrl).toHaveBeenNthCalledWith(2, 'proj-1/model.xlsx', 3600);
  });

  it('GET /api/investor/deals/[id]/documents skips documents without signedUrl', async () => {
    mockCreateSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'error' } })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://storage.example.com/model-signed' },
        error: null,
      });

    const { body } = await requestDocuments();

    expect(body).toHaveLength(1);
    expect((body as InvestorDocumentItem[])[0].id).toBe('doc-2');
  });

  it('GET /api/investor/deals/[id]/documents returns empty array if no documents', async () => {
    setupRoute({ docs: [] });

    const { response, body } = await requestDocuments();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });

  it('GET /api/investor/deals/[id]/documents download_url equals createSignedUrl result', async () => {
    setupRoute({ signedUrl: 'https://storage.example.com/custom-signed-url' });

    const { body } = await requestDocuments();

    expect((body as InvestorDocumentItem[])[0].download_url).toBe(
      'https://storage.example.com/custom-signed-url'
    );
  });

  it('GET /api/investor/deals/[id]/documents orders documents by created_at ascending', async () => {
    await requestDocuments();

    expect(mockDocsOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('InvestorDocumentItem type contains download_url: string', () => {
    const item: InvestorDocumentItem = {
      id: 'doc-1',
      document_type: 'pitch_deck',
      file_name: 'pitch.pdf',
      file_size: 102400,
      created_at: '2026-01-01T00:00:00Z',
      download_url: 'https://storage.example.com/signed',
    };

    expect(typeof item.download_url).toBe('string');
  });

  it('GET /api/investor/deals/[id]/documents file_size can be null', async () => {
    const { body } = await requestDocuments();

    expect((body as InvestorDocumentItem[])[1].file_size).toBeNull();
  });
});
