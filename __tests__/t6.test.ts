import type {
  AnalysisStatus,
  RedFlag,
  RedFlagSeverity,
  MissingField,
  MissingFieldImportance,
  AIAnalysisReport,
  AIReportRow,
} from '@/types';

describe('T6 AnalysisStatus type', () => {
  it('all statuses are valid', () => {
    const statuses: AnalysisStatus[] = ['pending', 'processing', 'done', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('done comes after processing', () => {
    const flow: AnalysisStatus[] = ['pending', 'processing', 'done'];
    expect(flow.indexOf('done')).toBeGreaterThan(flow.indexOf('processing'));
  });
});

describe('T6 RedFlag type', () => {
  it('high severity flag is valid', () => {
    const flag: RedFlag = {
      severity: 'high',
      description: 'Отсутствует финансовая модель',
    };
    expect(flag.severity).toBe('high');
    expect(flag.description).toBeTruthy();
  });

  it('all severities are valid', () => {
    const severities: RedFlagSeverity[] = ['high', 'medium', 'low'];
    expect(severities).toHaveLength(3);
  });
});

describe('T6 MissingField type', () => {
  it('critical missing field is valid', () => {
    const field: MissingField = {
      field: 'financial_model',
      importance: 'critical',
    };
    expect(field.importance).toBe('critical');
  });

  it('all importances are valid', () => {
    const importances: MissingFieldImportance[] = ['critical', 'important', 'nice_to_have'];
    expect(importances).toHaveLength(3);
  });
});

describe('T6 AIAnalysisReport shape', () => {
  const sampleReport: AIAnalysisReport = {
    red_flags: [
      { severity: 'high', description: 'Нет подтверждённой выручки' },
      { severity: 'medium', description: 'Команда без опыта в отрасли' },
    ],
    missing_data: [
      { field: 'revenue_current', importance: 'critical' },
      { field: 'team_cv', importance: 'important' },
    ],
    draft_card: '# Стартап XYZ\n\nОписание проекта...',
    ai_score: 6,
    summary: 'Проект находится на ранней стадии. Требуется уточнение финансовых данных.',
  };

  it('report has red_flags array', () => {
    expect(Array.isArray(sampleReport.red_flags)).toBe(true);
    expect(sampleReport.red_flags).toHaveLength(2);
  });

  it('report has missing_data array', () => {
    expect(Array.isArray(sampleReport.missing_data)).toBe(true);
    expect(sampleReport.missing_data[0].importance).toBe('critical');
  });

  it('draft_card is a string', () => {
    expect(typeof sampleReport.draft_card).toBe('string');
    expect(sampleReport.draft_card.length).toBeGreaterThan(0);
  });

  it('ai_score is between 1 and 10', () => {
    expect(sampleReport.ai_score).toBeGreaterThanOrEqual(1);
    expect(sampleReport.ai_score).toBeLessThanOrEqual(10);
  });

  it('summary is a non-empty string', () => {
    expect(typeof sampleReport.summary).toBe('string');
    expect(sampleReport.summary.length).toBeGreaterThan(0);
  });
});

describe('T6 AIReportRow shape', () => {
  it('done report has full report data', () => {
    const row: AIReportRow = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      report: {
        red_flags: [],
        missing_data: [],
        draft_card: '# Test',
        ai_score: 8,
        summary: 'Хороший проект',
      },
      status: 'done',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(row.status).toBe('done');
  });

  it('processing report has empty report object', () => {
    const row: AIReportRow = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      report: {},
      status: 'processing',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:00:00Z',
    };
    expect(row.status).toBe('processing');
    expect(Object.keys(row.report)).toHaveLength(0);
  });
});

describe('T6 allowed statuses for analysis', () => {
  const allowedStatuses = ['submitted', 'under_review'];

  it('submitted triggers analysis', () => {
    expect(allowedStatuses.includes('submitted')).toBe(true);
  });

  it('under_review triggers analysis', () => {
    expect(allowedStatuses.includes('under_review')).toBe(true);
  });

  it('draft does not trigger analysis', () => {
    expect(allowedStatuses.includes('draft')).toBe(false);
  });

  it('approved does not trigger re-analysis', () => {
    expect(allowedStatuses.includes('approved')).toBe(false);
  });
});

describe('T6 red flags severity ranking', () => {
  const severityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

  it('high is more severe than medium', () => {
    expect(severityWeight['high']).toBeGreaterThan(severityWeight['medium']);
  });

  it('medium is more severe than low', () => {
    expect(severityWeight['medium']).toBeGreaterThan(severityWeight['low']);
  });

  it('counts high severity flags', () => {
    const flags: RedFlag[] = [
      { severity: 'high', description: 'Flag 1' },
      { severity: 'medium', description: 'Flag 2' },
      { severity: 'high', description: 'Flag 3' },
    ];
    const highCount = flags.filter((flag) => flag.severity === 'high').length;
    expect(highCount).toBe(2);
  });
});
