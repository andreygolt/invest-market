import { computePortfolioStats } from '@/lib/portfolio/stats';
import type {
  PortfolioRow,
  PortfolioStats,
  PortfolioDetail,
  PortfolioInstrument,
  PortfolioDealStatus,
} from '@/types';

// --- helpers ---

function makeRow(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    id: 'port-1',
    investor_id: 'inv-1',
    project_id: 'proj-1',
    amount_invested: 1_000_000,
    date_invested: '2026-01-15',
    instrument: 'equity',
    deal_status: 'active',
    notes: null,
    exit_amount: null,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PortfolioDetail> = {}): PortfolioDetail {
  return {
    ...makeRow(),
    project_name: 'Test Project',
    project_industry: 'FinTech',
    project_stage: 'seed',
    ...overrides,
  };
}

// --- type tests ---

describe('T13 PortfolioRow type', () => {
  it('has all required fields', () => {
    const row = makeRow();
    expect(typeof row.id).toBe('string');
    expect(typeof row.investor_id).toBe('string');
    expect(typeof row.project_id).toBe('string');
    expect(typeof row.amount_invested).toBe('number');
    expect(typeof row.date_invested).toBe('string');
    expect(typeof row.instrument).toBe('string');
    expect(typeof row.deal_status).toBe('string');
  });

  it('notes and exit_amount can be null', () => {
    const row = makeRow({ notes: null, exit_amount: null });
    expect(row.notes).toBeNull();
    expect(row.exit_amount).toBeNull();
  });

  it('exit_amount can be a number', () => {
    const row = makeRow({ exit_amount: 2_000_000 });
    expect(row.exit_amount).toBe(2_000_000);
  });
});

describe('T13 PortfolioDetail type', () => {
  it('extends PortfolioRow with project fields', () => {
    const detail = makeDetail();
    expect(typeof detail.project_name).toBe('string');
    expect(detail.project_industry).toBe('FinTech');
    expect(detail.project_stage).toBe('seed');
  });

  it('project_industry and project_stage can be null', () => {
    const detail = makeDetail({ project_industry: null, project_stage: null });
    expect(detail.project_industry).toBeNull();
    expect(detail.project_stage).toBeNull();
  });
});

describe('T13 PortfolioInstrument values', () => {
  const instruments: PortfolioInstrument[] = [
    'equity',
    'convertible_note',
    'safe',
    'debt',
    'other',
  ];

  it('all instrument values are strings', () => {
    for (const inst of instruments) {
      expect(typeof inst).toBe('string');
    }
  });
});

describe('T13 PortfolioDealStatus values', () => {
  const statuses: PortfolioDealStatus[] = ['active', 'exited', 'written_off'];

  it('all status values are strings', () => {
    for (const s of statuses) {
      expect(typeof s).toBe('string');
    }
  });
});

// --- computePortfolioStats tests ---

describe('T13 computePortfolioStats — empty portfolio', () => {
  const stats = computePortfolioStats([]);

  it('total_entries = 0', () => {
    expect(stats.total_entries).toBe(0);
  });

  it('total_invested = 0', () => {
    expect(stats.total_invested).toBe(0);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });

  it('total_exited = 0', () => {
    expect(stats.total_exited).toBe(0);
  });

  it('total_written_off = 0', () => {
    expect(stats.total_written_off).toBe(0);
  });

  it('total_exit_amount = 0', () => {
    expect(stats.total_exit_amount).toBe(0);
  });
});

describe('T13 computePortfolioStats — single active entry', () => {
  const entries = [makeRow({ amount_invested: 500_000, deal_status: 'active' })];
  const stats = computePortfolioStats(entries);

  it('total_entries = 1', () => {
    expect(stats.total_entries).toBe(1);
  });

  it('total_invested = 500_000', () => {
    expect(stats.total_invested).toBe(500_000);
  });

  it('total_active = 1', () => {
    expect(stats.total_active).toBe(1);
  });

  it('total_exited = 0', () => {
    expect(stats.total_exited).toBe(0);
  });

  it('total_written_off = 0', () => {
    expect(stats.total_written_off).toBe(0);
  });

  it('total_exit_amount = 0 (no exit)', () => {
    expect(stats.total_exit_amount).toBe(0);
  });
});

describe('T13 computePortfolioStats — mixed entries', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', amount_invested: 1_000_000, deal_status: 'active', exit_amount: null }),
    makeRow({ id: '2', amount_invested: 500_000, deal_status: 'exited', exit_amount: 1_200_000 }),
    makeRow({ id: '3', amount_invested: 200_000, deal_status: 'written_off', exit_amount: null }),
    makeRow({ id: '4', amount_invested: 300_000, deal_status: 'active', exit_amount: null }),
  ];
  const stats = computePortfolioStats(entries);

  it('total_entries = 4', () => {
    expect(stats.total_entries).toBe(4);
  });

  it('total_invested = sum of all', () => {
    expect(stats.total_invested).toBe(2_000_000);
  });

  it('total_active = 2', () => {
    expect(stats.total_active).toBe(2);
  });

  it('total_exited = 1', () => {
    expect(stats.total_exited).toBe(1);
  });

  it('total_written_off = 1', () => {
    expect(stats.total_written_off).toBe(1);
  });

  it('total_exit_amount = 1_200_000', () => {
    expect(stats.total_exit_amount).toBe(1_200_000);
  });
});

describe('T13 computePortfolioStats — multiple exits', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', amount_invested: 1_000_000, deal_status: 'exited', exit_amount: 3_000_000 }),
    makeRow({ id: '2', amount_invested: 500_000, deal_status: 'exited', exit_amount: 800_000 }),
  ];
  const stats = computePortfolioStats(entries);

  it('total_exit_amount = 3_800_000', () => {
    expect(stats.total_exit_amount).toBe(3_800_000);
  });

  it('total_exited = 2', () => {
    expect(stats.total_exited).toBe(2);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });
});

describe('T13 computePortfolioStats — exit_amount null not counted', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', deal_status: 'exited', exit_amount: null }),
    makeRow({ id: '2', deal_status: 'exited', exit_amount: 500_000 }),
  ];
  const stats = computePortfolioStats(entries);

  it('null exit_amount treated as 0', () => {
    expect(stats.total_exit_amount).toBe(500_000);
  });
});

describe('T13 PortfolioStats type completeness', () => {
  it('stats has all required fields', () => {
    const stats: PortfolioStats = computePortfolioStats([]);
    expect(typeof stats.total_entries).toBe('number');
    expect(typeof stats.total_invested).toBe('number');
    expect(typeof stats.total_active).toBe('number');
    expect(typeof stats.total_exited).toBe('number');
    expect(typeof stats.total_written_off).toBe('number');
    expect(typeof stats.total_exit_amount).toBe('number');
  });
});

describe('T13 computePortfolioStats — single written_off entry', () => {
  const entries = [makeRow({ amount_invested: 750_000, deal_status: 'written_off' })];
  const stats = computePortfolioStats(entries);

  it('total_written_off = 1', () => {
    expect(stats.total_written_off).toBe(1);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });

  it('total_invested includes written_off amount', () => {
    expect(stats.total_invested).toBe(750_000);
  });
});
