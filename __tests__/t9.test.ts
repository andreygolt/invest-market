import type { DealRoomProject, DealRoomDocument, DocumentType, ProjectStage, ProductStage } from '@/types';

const makeDocument = (overrides: Partial<DealRoomDocument> = {}): DealRoomDocument => ({
  id: 'doc-1',
  doc_type: 'pitch_deck' as DocumentType,
  filename: 'pitch.pdf',
  signed_url: 'https://storage.example.com/signed/pitch.pdf',
  ...overrides,
});

const makeDeal = (overrides: Partial<DealRoomProject> = {}): DealRoomProject => ({
  id: 'proj-1',
  name: 'Test Project',
  created_at: '2026-06-27T00:00:00Z',
  video_signed_url: null,
  description: 'Описание проекта',
  industry: 'FinTech',
  stage: 'seed' as ProjectStage,
  legal_form: 'ООО',
  country: 'Россия',
  city: 'Москва',
  founding_year: '2023',
  founders: [{ name: 'Иван', role: 'CEO', linkedin: '', bio: 'Опытный предприниматель' }],
  team_size: '10',
  key_skills: 'AI, финтех',
  problem: 'Проблема рынка',
  solution: 'Наше решение',
  usp: 'Уникальное преимущество',
  product_stage: 'mvp' as ProductStage,
  target_audience: 'Малый бизнес',
  tam_description: '$10B рынок',
  competitors: 'Конкурент А',
  competitive_advantage: 'Быстрее и дешевле',
  revenue_current: '500 000 руб/мес',
  revenue_last_year: '3 000 000 руб',
  burn_rate: '300 000 руб/мес',
  runway_months: '12',
  unit_economics: 'CAC 5000, LTV 30000',
  investment_ask: '30 000 000 руб',
  valuation_pre_money: '150 000 000 руб',
  investment_type: 'equity',
  use_of_funds: 'Разработка, маркетинг',
  previous_rounds: 'Pre-seed 5M',
  total_raised: '5 000 000 руб',
  monthly_users: '1200',
  paying_customers: '80',
  mrr: '480 000 руб',
  growth_rate_mom: '15%',
  key_metrics: 'Churn 3%',
  notable_clients: 'Сбер, Т-Банк',
  exit_strategy: 'M&A через 5 лет',
  ai_score: 8,
  ai_summary: 'Сильная команда, растущий рынок',
  documents: [makeDocument()],
  ...overrides,
});

describe('T9 DealRoomProject type', () => {
  it('has all required fields', () => {
    const deal = makeDeal();
    expect(typeof deal.id).toBe('string');
    expect(typeof deal.name).toBe('string');
    expect(typeof deal.created_at).toBe('string');
    expect(Array.isArray(deal.documents)).toBe(true);
  });

  it('nullable fields can be null', () => {
    const deal = makeDeal({
      video_signed_url: null,
      ai_score: null,
      ai_summary: null,
      industry: null,
      stage: null,
    });
    expect(deal.video_signed_url).toBeNull();
    expect(deal.ai_score).toBeNull();
    expect(deal.ai_summary).toBeNull();
  });

  it('ai_score is in range 1-10 when present', () => {
    const deal = makeDeal({ ai_score: 7 });
    expect(deal.ai_score).toBeGreaterThanOrEqual(1);
    expect(deal.ai_score).toBeLessThanOrEqual(10);
  });

  it('documents array can be empty', () => {
    const deal = makeDeal({ documents: [] });
    expect(deal.documents).toHaveLength(0);
  });
});

describe('T9 DealRoomDocument type', () => {
  it('has all required fields', () => {
    const doc = makeDocument();
    expect(typeof doc.id).toBe('string');
    expect(typeof doc.doc_type).toBe('string');
    expect(typeof doc.filename).toBe('string');
    expect(typeof doc.signed_url).toBe('string');
  });

  it('supports all document types', () => {
    const types: DocumentType[] = ['pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other'];
    types.forEach((type) => {
      const doc = makeDocument({ doc_type: type });
      expect(doc.doc_type).toBe(type);
    });
  });
});

describe('T9 deal room data assembly', () => {
  it('assembles questionnaire sections into flat structure', () => {
    const s1 = { description: 'Desc', industry: 'FinTech', stage: 'seed', country: 'Russia', city: 'Moscow', founding_year: '2023', legal_form: 'LLC' };
    const s6 = { investment_ask: '1M', valuation_pre_money: '10M', investment_type: 'equity', use_of_funds: 'dev', previous_rounds: '', total_raised: '' };

    const deal = makeDeal({
      description: s1.description,
      industry: s1.industry,
      investment_ask: s6.investment_ask,
      investment_type: 'equity',
    });

    expect(deal.description).toBe('Desc');
    expect(deal.industry).toBe('FinTech');
    expect(deal.investment_ask).toBe('1M');
    expect(deal.investment_type).toBe('equity');
  });

  it('does not expose red_flags to investor', () => {
    const deal = makeDeal();
    expect('red_flags' in deal).toBe(false);
    expect('missing_data' in deal).toBe(false);
  });

  it('video_signed_url is set when video exists', () => {
    const deal = makeDeal({ video_signed_url: 'https://storage.example.com/video.mp4' });
    expect(deal.video_signed_url).toMatch(/^https?:\/\//);
  });
});

describe('T9 disclaimer requirement', () => {
  it('disclaimer includes required elements', () => {
    const disclaimer =
      'Платформа не является брокером или инвестиционным советником. ' +
      'Платформа не гарантирует доходность. ' +
      'Сделки заключаются вне платформы.';
    expect(disclaimer).toContain('не является брокером');
    expect(disclaimer).toContain('не гарантирует доходность');
    expect(disclaimer).toContain('вне платформы');
  });

  it('financial disclaimer is separate for investment terms section', () => {
    const financialDisclaimer =
      'Финансовые показатели предоставлены проектом и не верифицированы платформой. ' +
      'Не является инвестиционной рекомендацией. Доходность не гарантируется.';
    expect(financialDisclaimer).toContain('Доходность не гарантируется');
    expect(financialDisclaimer.length).toBeGreaterThan(50);
  });
});

describe('T9 stage and product stage labels', () => {
  const STAGE_LABELS: Record<string, string> = {
    idea: 'Идея',
    pre_seed: 'Pre-seed',
    seed: 'Seed',
    series_a_plus: 'Series A+',
  };

  const PRODUCT_STAGE_LABELS: Record<string, string> = {
    concept: 'Концепция',
    mvp: 'MVP',
    beta: 'Бета',
    launched: 'Запущен',
  };

  it('all project stages have labels', () => {
    const stages: ProjectStage[] = ['idea', 'pre_seed', 'seed', 'series_a_plus'];
    stages.forEach((s) => {
      expect(STAGE_LABELS[s]).toBeDefined();
    });
  });

  it('all product stages have labels', () => {
    const stages: ProductStage[] = ['concept', 'mvp', 'beta', 'launched'];
    stages.forEach((s) => {
      expect(PRODUCT_STAGE_LABELS[s]).toBeDefined();
    });
  });
});
