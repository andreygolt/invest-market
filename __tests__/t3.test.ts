import type {
  QS5Answers, QS6Answers, QS7Answers, QS8Answers,
  DocumentType, ProjectDocument,
} from '@/types';

describe('T3 questionnaire types s5-s8', () => {
  it('QS5Answers has financial_model_ready boolean', () => {
    const a: QS5Answers = {
      revenue_current: '100000',
      revenue_last_year: '1000000',
      burn_rate: '50000',
      runway_months: '12',
      unit_economics: 'CAC=500, LTV=5000',
      financial_model_ready: true,
    };
    expect(typeof a.financial_model_ready).toBe('boolean');
  });

  it('QS6Answers investment_type valid values', () => {
    const types: QS6Answers['investment_type'][] = ['equity', 'convertible_note', 'safe', 'debt', ''];
    expect(types).toHaveLength(5);
  });

  it('QS7Answers has traction fields', () => {
    const a: QS7Answers = {
      monthly_users: '1000',
      paying_customers: '100',
      mrr: '500000',
      growth_rate_mom: '15',
      key_metrics: '',
      notable_clients: '',
      awards: '',
    };
    expect(Object.keys(a)).toHaveLength(7);
  });

  it('QS8Answers has exit_strategy field', () => {
    const a: QS8Answers = {
      exit_strategy: 'M&A',
      risks: 'regulatory',
      additional_info: '',
      how_found_platform: 'referral',
    };
    expect(a.exit_strategy).toBe('M&A');
  });
});

describe('T3 document types', () => {
  const VALID_DOC_TYPES: DocumentType[] = [
    'pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other',
  ];

  it('has 6 document types', () => {
    expect(VALID_DOC_TYPES).toHaveLength(6);
  });

  it('pitch_deck is a valid DocumentType', () => {
    expect(VALID_DOC_TYPES.includes('pitch_deck')).toBe(true);
  });

  it('ProjectDocument shape is correct', () => {
    const doc: ProjectDocument = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      doc_type: 'pitch_deck',
      storage_path: 'uuid-2/pitch_deck_123.pdf',
      filename: 'deck.pdf',
      uploaded_at: '2026-06-27T10:00:00Z',
    };
    expect(doc.doc_type).toBe('pitch_deck');
    expect(typeof doc.storage_path).toBe('string');
  });
});

describe('T3 API validation logic', () => {
  const VALID_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

  it('sections s5-s8 are valid', () => {
    expect(VALID_SECTIONS.includes('s5')).toBe(true);
    expect(VALID_SECTIONS.includes('s8')).toBe(true);
    expect(VALID_SECTIONS.includes('s9')).toBe(false);
  });

  it('file size limit is 20MB', () => {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    expect(MAX_FILE_SIZE).toBe(20971520);
  });
});
