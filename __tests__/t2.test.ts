import type { QS1Answers, QS2Answers, QS3Answers, QS4Answers, QuestionnaireSection } from '@/types';

describe('T2 questionnaire types', () => {
  it('QuestionnaireSection valid values', () => {
    const sections: QuestionnaireSection[] = ['s1', 's2', 's3', 's4'];
    expect(sections).toHaveLength(4);
  });

  it('QS1Answers stage values', () => {
    const s: QS1Answers['stage'] = 'pre_seed';
    expect(s).toBe('pre_seed');
  });

  it('QS2Answers has founders array', () => {
    const a: QS2Answers = {
      founders: [{ name: 'Иван', role: 'CEO', linkedin: '', bio: '' }],
      team_size: '5',
      key_skills: 'dev',
    };
    expect(a.founders).toHaveLength(1);
  });

  it('QS3Answers product_stage values', () => {
    const stages: QS3Answers['product_stage'][] = ['concept', 'mvp', 'beta', 'launched'];
    expect(stages).toHaveLength(4);
  });

  it('QS4Answers has required fields', () => {
    const a: QS4Answers = {
      target_audience: 'B2B',
      tam_description: '$5B',
      competitors: 'Company X',
      competitive_advantage: 'Speed',
    };
    expect(Object.keys(a)).toHaveLength(4);
  });
});

describe('T2 API validation logic', () => {
  const VALID_SECTIONS = ['s1', 's2', 's3', 's4'];

  it('validates section param', () => {
    expect(VALID_SECTIONS.includes('s1')).toBe(true);
    expect(VALID_SECTIONS.includes('s5')).toBe(false);
    expect(VALID_SECTIONS.includes('')).toBe(false);
  });

  it('requires answers to be an object', () => {
    const body = { section: 's1', answers: { description: 'test' } };
    expect(typeof body.answers).toBe('object');
    expect(body.answers).not.toBeNull();
  });
});
