import { NextRequest } from 'next/server';
import { GET as projectUpdatesGet, POST as projectUpdatesPost } from '@/app/api/project/updates/route';
import { DELETE as projectUpdateDelete } from '@/app/api/project/updates/[id]/route';
import { GET as investorUpdatesGet } from '@/app/api/investor/deals/[id]/updates/route';
import { generateUpdateSummary } from '@/lib/ai/updates';
import type { ProjectUpdate } from '@/types';

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

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockFrom,
  })),
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function makeQuery(result: QueryResult) {
  const query = {
    select: jest.fn(() => query),
    eq: jest.fn(() => query),
    order: jest.fn(() => query),
    limit: jest.fn(() => Promise.resolve(result)),
    maybeSingle: jest.fn(() => Promise.resolve(result)),
    single: jest.fn(() => Promise.resolve(result)),
    insert: jest.fn(() => query),
    update: jest.fn(() => query),
    delete: jest.fn(() => query),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason?: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return query;
}

const sampleUpdate: ProjectUpdate = {
  id: 'update-1',
  project_id: 'project-1',
  title: 'Новый релиз',
  body: 'Запустили новую версию продукта.',
  ai_summary: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
};

describe('T18 project updates', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
    process.env.OPENAI_API_KEY = 'test-key';
    global.fetch = jest.fn(async () =>
      Response.json({
        choices: [{ message: { content: 'Краткое резюме обновления.' } }],
      })
    ) as jest.Mock;
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it('POST /api/project/updates returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const request = new NextRequest('http://localhost/api/project/updates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Title', body: 'Body' }),
    });

    const response = await projectUpdatesPost(request);

    expect(response.status).toBe(401);
  });

  it('POST /api/project/updates returns 400 when title is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const request = new NextRequest('http://localhost/api/project/updates', {
      method: 'POST',
      body: JSON.stringify({ title: '', body: 'Body' }),
    });

    const response = await projectUpdatesPost(request);

    expect(response.status).toBe(400);
  });

  it('POST /api/project/updates returns 400 when body is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    const request = new NextRequest('http://localhost/api/project/updates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Title', body: '' }),
    });

    const response = await projectUpdatesPost(request);

    expect(response.status).toBe(400);
  });

  it('POST /api/project/updates returns 201 with valid data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeQuery({ data: { id: 'project-1' }, error: null });
      if (table === 'project_updates') {
        return makeQuery({ data: sampleUpdate, error: null });
      }
      return makeQuery({ data: null, error: null });
    });
    const request = new NextRequest('http://localhost/api/project/updates', {
      method: 'POST',
      body: JSON.stringify({ title: 'Новый релиз', body: 'Запустили новую версию продукта.' }),
    });

    const response = await projectUpdatesPost(request);
    const body = (await response.json()) as ProjectUpdate;

    expect(response.status).toBe(201);
    expect(body.id).toBe('update-1');
  });

  it('GET /api/project/updates returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await projectUpdatesGet();

    expect(response.status).toBe(401);
  });

  it('GET /api/project/updates returns ProjectUpdate[]', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeQuery({ data: { id: 'project-1' }, error: null });
      if (table === 'project_updates') return makeQuery({ data: [sampleUpdate], error: null });
      return makeQuery({ data: null, error: null });
    });

    const response = await projectUpdatesGet();
    const body = (await response.json()) as ProjectUpdate[];

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('Новый релиз');
  });

  it('DELETE /api/project/updates/[id] returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await projectUpdateDelete(
      new NextRequest('http://localhost/api/project/updates/update-1'),
      { params: Promise.resolve({ id: 'update-1' }) }
    );

    expect(response.status).toBe(401);
  });

  it('DELETE /api/project/updates/[id] returns 200 on successful delete', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'projects') return makeQuery({ data: { id: 'project-1' }, error: null });
      if (table === 'project_updates') return makeQuery({ data: sampleUpdate, error: null });
      return makeQuery({ data: null, error: null });
    });

    const response = await projectUpdateDelete(
      new NextRequest('http://localhost/api/project/updates/update-1'),
      { params: Promise.resolve({ id: 'update-1' }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
  });

  it('GET /api/investor/deals/[id]/updates returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await investorUpdatesGet(
      new NextRequest('http://localhost/api/investor/deals/project-1/updates'),
      { params: Promise.resolve({ id: 'project-1' }) }
    );

    expect(response.status).toBe(401);
  });

  it('GET /api/investor/deals/[id]/updates returns project updates', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeQuery({ data: { role: 'investor' }, error: null });
      if (table === 'project_updates') return makeQuery({ data: [sampleUpdate], error: null });
      return makeQuery({ data: null, error: null });
    });

    const response = await investorUpdatesGet(
      new NextRequest('http://localhost/api/investor/deals/project-1/updates'),
      { params: Promise.resolve({ id: 'project-1' }) }
    );
    const body = (await response.json()) as ProjectUpdate[];

    expect(response.status).toBe(200);
    expect(body[0].project_id).toBe('project-1');
  });

  it('ProjectUpdate type has required fields', () => {
    const update: ProjectUpdate = sampleUpdate;

    expect(update.id).toBeTruthy();
    expect(update.project_id).toBeTruthy();
    expect(update.title).toBeTruthy();
    expect(update.body).toBeTruthy();
    expect(update.ai_summary).toBeNull();
    expect(update.created_at).toBeTruthy();
  });

  it('generateUpdateSummary calls OpenAI and saves ai_summary', async () => {
    const updateQuery = makeQuery({ data: { title: sampleUpdate.title, body: sampleUpdate.body }, error: null });
    mockFrom.mockReturnValue(updateQuery);

    await generateUpdateSummary('update-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' })
    );
    expect(updateQuery.update).toHaveBeenCalledWith(
      expect.objectContaining({ ai_summary: 'Краткое резюме обновления.' })
    );
  });
});
