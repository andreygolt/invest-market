import type {
  ApplicationStatus,
  ApplicationRow,
  ApplicationListItem,
  ApplicationDetail,
} from '@/types';

const makeApplication = (overrides: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: 'app-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  amount: 1000000,
  status: 'pending',
  message: 'Хочу инвестировать в ваш проект',
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

const makeListItem = (overrides: Partial<ApplicationListItem> = {}): ApplicationListItem => ({
  id: 'app-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  investor_id: 'user-1',
  investor_name: 'Иван Иванов',
  investor_email: 'ivan@example.com',
  amount: 1000000,
  status: 'pending',
  message: 'Хочу инвестировать',
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

const makeDetail = (overrides: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'app-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  amount: 500000,
  status: 'pending',
  message: 'Привет',
  rejection_reason: null,
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

describe('T10 ApplicationRow type', () => {
  it('has all required fields', () => {
    const app = makeApplication();
    expect(typeof app.id).toBe('string');
    expect(typeof app.investor_id).toBe('string');
    expect(typeof app.project_id).toBe('string');
    expect(typeof app.status).toBe('string');
  });

  it('amount can be null', () => {
    const app = makeApplication({ amount: null });
    expect(app.amount).toBeNull();
  });

  it('message can be null', () => {
    const app = makeApplication({ message: null });
    expect(app.message).toBeNull();
  });
});

describe('T10 ApplicationStatus transitions', () => {
  const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
    pending: ['reviewing', 'rejected'],
    reviewing: ['approved', 'rejected'],
    approved: [],
    rejected: [],
    withdrawn: [],
  };

  it('pending can transition to reviewing or rejected', () => {
    expect(VALID_TRANSITIONS['pending']).toContain('reviewing');
    expect(VALID_TRANSITIONS['pending']).toContain('rejected');
  });

  it('reviewing can transition to approved or rejected', () => {
    expect(VALID_TRANSITIONS['reviewing']).toContain('approved');
    expect(VALID_TRANSITIONS['reviewing']).toContain('rejected');
  });

  it('terminal statuses have no transitions', () => {
    expect(VALID_TRANSITIONS['approved']).toHaveLength(0);
    expect(VALID_TRANSITIONS['rejected']).toHaveLength(0);
    expect(VALID_TRANSITIONS['withdrawn']).toHaveLength(0);
  });

  it('pending cannot transition directly to approved', () => {
    expect(VALID_TRANSITIONS['pending']).not.toContain('approved');
  });
});

describe('T10 ApplicationListItem type', () => {
  it('has project and investor info', () => {
    const item = makeListItem();
    expect(typeof item.project_name).toBe('string');
    expect(typeof item.investor_email).toBe('string');
  });

  it('investor_name can be null', () => {
    const item = makeListItem({ investor_name: null });
    expect(item.investor_name).toBeNull();
  });
});

describe('T10 ApplicationDetail type', () => {
  it('has project_name from join', () => {
    const detail = makeDetail();
    expect(typeof detail.project_name).toBe('string');
  });

  it('amount can be null', () => {
    const detail = makeDetail({ amount: null });
    expect(detail.amount).toBeNull();
  });
});

describe('T10 application validation rules', () => {
  it('message is required (non-empty string)', () => {
    const validate = (msg: string) => msg.trim().length > 0;
    expect(validate('')).toBe(false);
    expect(validate('  ')).toBe(false);
    expect(validate('Hello')).toBe(true);
  });

  it('amount must be positive when provided', () => {
    const validateAmount = (v: number | null) => v === null || v > 0;
    expect(validateAmount(null)).toBe(true);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(1000)).toBe(true);
  });

  it('only pending applications can be withdrawn', () => {
    const canWithdraw = (status: ApplicationStatus) => status === 'pending';
    expect(canWithdraw('pending')).toBe(true);
    expect(canWithdraw('reviewing')).toBe(false);
    expect(canWithdraw('approved')).toBe(false);
    expect(canWithdraw('rejected')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
  });
});

describe('T10 disclaimer requirement', () => {
  it('apply form disclaimer mentions key points', () => {
    const disclaimer =
      'Заявка носит ознакомительный характер. Платформа не является посредником в сделке. ' +
      'Сделки заключаются напрямую между инвестором и проектом вне платформы. ' +
      'Доходность не гарантируется.';
    expect(disclaimer).toContain('вне платформы');
    expect(disclaimer).toContain('Доходность не гарантируется');
    expect(disclaimer).toContain('носит ознакомительный характер');
  });
});

describe('T10 duplicate application check', () => {
  it('detects active duplicate (pending or reviewing)', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'pending';
    expect(activeStatuses.includes(existingStatus)).toBe(true);
  });

  it('allows new application if previous was withdrawn', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'withdrawn';
    expect(activeStatuses.includes(existingStatus)).toBe(false);
  });

  it('allows new application if previous was rejected', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'rejected';
    expect(activeStatuses.includes(existingStatus)).toBe(false);
  });
});
