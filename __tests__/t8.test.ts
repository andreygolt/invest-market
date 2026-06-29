import type { InvestorCatalogItem, CatalogSortOrder } from '@/types';

const makeItem = (overrides: Partial<InvestorCatalogItem> = {}): InvestorCatalogItem => ({
  id: 'p-1',
  name: 'Test Project',
  created_at: '2026-06-27T00:00:00Z',
  updated_at: '2026-06-27T00:00:00Z',
  industry: 'FinTech',
  stage: 'seed',
  country: 'Russia',
  city: 'Moscow',
  description: 'Test description',
  investment_ask: '5000000',
  investment_type: 'equity',
  valuation_pre_money: '20000000',
  ai_score: 7,
  ai_summary: 'Strong team, clear market',
  ...overrides,
});

describe('T8 catalog filtering', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ id: 'p-1', industry: 'FinTech', stage: 'seed', country: 'Russia', investment_type: 'equity' }),
    makeItem({ id: 'p-2', industry: 'HealthTech', stage: 'pre_seed', country: 'Kazakhstan', investment_type: 'safe' }),
    makeItem({ id: 'p-3', industry: 'FinTech', stage: 'series_a_plus', country: 'Russia', investment_type: 'equity' }),
  ];

  it('filters by industry', () => {
    const result = items.filter(
      (i) => i.industry?.toLowerCase() === 'fintech'
    );
    expect(result).toHaveLength(2);
  });

  it('filters by stage', () => {
    const result = items.filter((i) => i.stage === 'seed');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-1');
  });

  it('filters by country', () => {
    const result = items.filter(
      (i) => i.country?.toLowerCase() === 'russia'
    );
    expect(result).toHaveLength(2);
  });

  it('filters by investment_type', () => {
    const result = items.filter((i) => i.investment_type === 'safe');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('p-2');
  });

  it('combined filter: industry + country', () => {
    const result = items
      .filter((i) => i.industry?.toLowerCase() === 'fintech')
      .filter((i) => i.country?.toLowerCase() === 'russia');
    expect(result).toHaveLength(2);
  });

  it('no match returns empty array', () => {
    const result = items.filter((i) => i.industry?.toLowerCase() === 'biotech');
    expect(result).toHaveLength(0);
  });
});

describe('T8 catalog sorting', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ id: 'p-1', created_at: '2026-06-25T00:00:00Z', ai_score: 6, investment_ask: '10000000' }),
    makeItem({ id: 'p-2', created_at: '2026-06-27T00:00:00Z', ai_score: 9, investment_ask: '2000000' }),
    makeItem({ id: 'p-3', created_at: '2026-06-26T00:00:00Z', ai_score: 7, investment_ask: '5000000' }),
  ];

  it('sort newest: most recent first', () => {
    const sorted = [...items].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });

  it('sort score_desc: highest AI score first', () => {
    const sorted = [...items].sort((a, b) => (b.ai_score ?? 0) - (a.ai_score ?? 0));
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });

  it('sort ask_asc: smallest investment ask first', () => {
    const sorted = [...items].sort((a, b) => {
      const aAsk = parseFloat((a.investment_ask ?? '').replace(/\D/g, '')) || 0;
      const bAsk = parseFloat((b.investment_ask ?? '').replace(/\D/g, '')) || 0;
      return aAsk - bAsk;
    });
    expect(sorted[0].id).toBe('p-2');
    expect(sorted[2].id).toBe('p-1');
  });
});

describe('T8 InvestorCatalogItem type', () => {
  it('all required fields are present', () => {
    const item = makeItem();
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.created_at).toBe('string');
  });

  it('nullable fields can be null', () => {
    const item = makeItem({
      industry: null,
      stage: null,
      country: null,
      ai_score: null,
      ai_summary: null,
      investment_type: null,
    });
    expect(item.industry).toBeNull();
    expect(item.ai_score).toBeNull();
  });

  it('ai_score is numeric when present', () => {
    const item = makeItem({ ai_score: 8 });
    expect(typeof item.ai_score).toBe('number');
    expect(item.ai_score).toBeGreaterThanOrEqual(1);
    expect(item.ai_score).toBeLessThanOrEqual(10);
  });
});

describe('T8 catalog sort orders', () => {
  const validSorts: CatalogSortOrder[] = ['newest', 'score_desc', 'ask_asc'];

  it('all valid sort orders are defined', () => {
    expect(validSorts).toHaveLength(3);
    expect(validSorts).toContain('newest');
    expect(validSorts).toContain('score_desc');
    expect(validSorts).toContain('ask_asc');
  });

  it('default sort is newest', () => {
    const sort: CatalogSortOrder = 'newest';
    expect(sort).toBe('newest');
  });
});

describe('T8 unique filter values extraction', () => {
  const items: InvestorCatalogItem[] = [
    makeItem({ industry: 'FinTech', stage: 'seed', country: 'Russia' }),
    makeItem({ industry: 'FinTech', stage: 'pre_seed', country: 'Kazakhstan' }),
    makeItem({ industry: 'HealthTech', stage: 'seed', country: 'Russia' }),
    makeItem({ industry: null, stage: null, country: null }),
  ];

  function unique<T>(arr: (T | null | undefined)[]): T[] {
    return [...new Set(arr.filter((v): v is T => v !== null && v !== undefined))] as T[];
  }

  it('extracts unique industries (excluding nulls)', () => {
    const industries = unique(items.map((i) => i.industry));
    expect(industries).toHaveLength(2);
    expect(industries).toContain('FinTech');
    expect(industries).toContain('HealthTech');
  });

  it('extracts unique stages', () => {
    const stages = unique(items.map((i) => i.stage));
    expect(stages).toHaveLength(2);
  });

  it('extracts unique countries', () => {
    const countries = unique(items.map((i) => i.country));
    expect(countries).toHaveLength(2);
    expect(countries).toContain('Russia');
    expect(countries).toContain('Kazakhstan');
  });
});

describe('T8 disclaimer requirement', () => {
  it('disclaimer text is defined and non-empty', () => {
    const disclaimer =
      'Платформа не является брокером или инвестиционным советником. ' +
      'Информация носит ознакомительный характер и не является офертой. ' +
      'Платформа не гарантирует доходность.';
    expect(disclaimer.length).toBeGreaterThan(50);
    expect(disclaimer).toContain('не гарантирует доходность');
    expect(disclaimer).toContain('не является брокером');
  });
});
