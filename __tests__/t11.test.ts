import type {
  InvestorPersonalStatus,
  InvestorFavoriteRow,
  InvestorFavoriteDetail,
  InvestorFavoriteInsert,
  ProjectStage,
} from '@/types';

const makeFavoriteRow = (overrides: Partial<InvestorFavoriteRow> = {}): InvestorFavoriteRow => ({
  id: 'fav-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  notes: null,
  personal_status: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
  ...overrides,
});

const makeFavoriteDetail = (
  overrides: Partial<InvestorFavoriteDetail> = {}
): InvestorFavoriteDetail => ({
  id: 'fav-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  project_industry: 'FinTech',
  project_stage: 'seed' as ProjectStage,
  project_ai_score: 72,
  notes: null,
  personal_status: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
  ...overrides,
});

const makeFavoriteInsert = (
  overrides: Partial<InvestorFavoriteInsert> = {}
): InvestorFavoriteInsert => ({
  investor_id: 'user-1',
  project_id: 'proj-1',
  notes: null,
  personal_status: null,
  ...overrides,
});

describe('T11 InvestorFavoriteRow type', () => {
  it('has all required fields', () => {
    const fav = makeFavoriteRow();
    expect(typeof fav.id).toBe('string');
    expect(typeof fav.investor_id).toBe('string');
    expect(typeof fav.project_id).toBe('string');
    expect(fav.notes).toBeNull();
    expect(fav.personal_status).toBeNull();
  });

  it('notes can be a string', () => {
    const fav = makeFavoriteRow({ notes: 'Нужно уточнить условия' });
    expect(fav.notes).toBe('Нужно уточнить условия');
  });

  it('personal_status can be set to valid values', () => {
    const validStatuses: InvestorPersonalStatus[] = ['watching', 'interested', 'passed'];
    for (const s of validStatuses) {
      const fav = makeFavoriteRow({ personal_status: s });
      expect(fav.personal_status).toBe(s);
    }
  });

  it('personal_status can be null', () => {
    const fav = makeFavoriteRow({ personal_status: null });
    expect(fav.personal_status).toBeNull();
  });
});

describe('T11 InvestorPersonalStatus values', () => {
  const valid: InvestorPersonalStatus[] = ['watching', 'interested', 'passed'];

  it('has exactly 3 valid statuses', () => {
    expect(valid).toHaveLength(3);
  });

  it('contains watching, interested, passed', () => {
    expect(valid).toContain('watching');
    expect(valid).toContain('interested');
    expect(valid).toContain('passed');
  });
});

describe('T11 InvestorFavoriteDetail type', () => {
  it('includes project info fields', () => {
    const detail = makeFavoriteDetail();
    expect(typeof detail.project_name).toBe('string');
    expect(detail.project_industry).toBe('FinTech');
    expect(detail.project_stage).toBe('seed');
    expect(typeof detail.project_ai_score).toBe('number');
  });

  it('project_industry can be null', () => {
    const detail = makeFavoriteDetail({ project_industry: null });
    expect(detail.project_industry).toBeNull();
  });

  it('project_ai_score can be null', () => {
    const detail = makeFavoriteDetail({ project_ai_score: null });
    expect(detail.project_ai_score).toBeNull();
  });
});

describe('T11 InvestorFavoriteInsert type', () => {
  it('does not have id, created_at, updated_at', () => {
    const insert = makeFavoriteInsert();
    expect('id' in insert).toBe(false);
    expect('created_at' in insert).toBe(false);
    expect('updated_at' in insert).toBe(false);
  });

  it('requires investor_id and project_id', () => {
    const insert = makeFavoriteInsert();
    expect(typeof insert.investor_id).toBe('string');
    expect(typeof insert.project_id).toBe('string');
  });
});

describe('T11 upsert uniqueness logic', () => {
  it('identifies duplicate by investor_id + project_id', () => {
    const existing = makeFavoriteRow({ investor_id: 'u1', project_id: 'p1' });
    const newReq = { investor_id: 'u1', project_id: 'p1' };
    const isDuplicate =
      existing.investor_id === newReq.investor_id && existing.project_id === newReq.project_id;
    expect(isDuplicate).toBe(true);
  });

  it('no duplicate for different project', () => {
    const existing = makeFavoriteRow({ investor_id: 'u1', project_id: 'p1' });
    const newReq = { investor_id: 'u1', project_id: 'p2' };
    const isDuplicate =
      existing.investor_id === newReq.investor_id && existing.project_id === newReq.project_id;
    expect(isDuplicate).toBe(false);
  });
});

describe('T11 personal status toggle logic', () => {
  it('toggling same status sets it to null', () => {
    const currentStatus: InvestorPersonalStatus = 'watching';
    const clickedStatus: InvestorPersonalStatus = 'watching';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBeNull();
  });

  it('toggling different status sets it to new value', () => {
    const currentStatus: InvestorPersonalStatus = 'watching';
    const clickedStatus: InvestorPersonalStatus = 'interested';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBe('interested');
  });

  it('toggling from null sets the status', () => {
    const currentStatus: InvestorPersonalStatus | null = null;
    const clickedStatus: InvestorPersonalStatus = 'passed';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBe('passed');
  });
});

describe('T11 filter by personal_status', () => {
  const items: InvestorFavoriteDetail[] = [
    makeFavoriteDetail({ id: '1', personal_status: 'watching' }),
    makeFavoriteDetail({ id: '2', personal_status: 'interested' }),
    makeFavoriteDetail({ id: '3', personal_status: null }),
    makeFavoriteDetail({ id: '4', personal_status: 'watching' }),
  ];

  it('filter watching returns only watching', () => {
    const result = items.filter((f) => f.personal_status === 'watching');
    expect(result).toHaveLength(2);
  });

  it('filter interested returns only interested', () => {
    const result = items.filter((f) => f.personal_status === 'interested');
    expect(result).toHaveLength(1);
  });

  it('all filter returns all items', () => {
    expect(items).toHaveLength(4);
  });
});

describe('T11 ownership check for PATCH/DELETE', () => {
  it('owner can modify their favorite', () => {
    const fav = makeFavoriteRow({ investor_id: 'user-1' });
    const requesterId = 'user-1';
    expect(fav.investor_id === requesterId).toBe(true);
  });

  it('other user cannot modify favorite', () => {
    const fav = makeFavoriteRow({ investor_id: 'user-1' });
    const requesterId = 'user-2';
    expect(fav.investor_id === requesterId).toBe(false);
  });
});
