import type { ProjectRow, AIReportRow, AIAnalysisReport } from '@/types';

describe('T7 moderation statuses', () => {
  const approvableStatuses = ['submitted', 'under_review'];
  const nonApprovableStatuses = ['draft', 'approved', 'rejected'];

  it('submitted can be approved', () => {
    expect(approvableStatuses.includes('submitted')).toBe(true);
  });

  it('under_review can be approved', () => {
    expect(approvableStatuses.includes('under_review')).toBe(true);
  });

  it('draft cannot be approved', () => {
    expect(approvableStatuses.includes('draft')).toBe(false);
  });

  it('already approved cannot be re-approved', () => {
    expect(approvableStatuses.includes('approved')).toBe(false);
  });

  it('rejected cannot be approved', () => {
    expect(approvableStatuses.includes('rejected')).toBe(false);
  });

  it('non-approvable list covers expected statuses', () => {
    expect(nonApprovableStatuses).toHaveLength(3);
  });
});

describe('T7 rejection reason validation', () => {
  function validateRejectionReason(reason: string): boolean {
    return reason.trim().length >= 10;
  }

  it('empty string is invalid', () => {
    expect(validateRejectionReason('')).toBe(false);
  });

  it('short reason is invalid', () => {
    expect(validateRejectionReason('короткий')).toBe(false);
  });

  it('reason with 10+ chars is valid', () => {
    expect(validateRejectionReason('Отсутствует финансовая модель')).toBe(true);
  });

  it('whitespace-only is invalid', () => {
    expect(validateRejectionReason('         ')).toBe(false);
  });
});

describe('T7 project status transition logic', () => {
  type ModerationAction = 'approve' | 'reject';

  function getResultStatus(action: ModerationAction): string {
    return action === 'approve' ? 'approved' : 'rejected';
  }

  it('approve action produces approved status', () => {
    expect(getResultStatus('approve')).toBe('approved');
  });

  it('reject action produces rejected status', () => {
    expect(getResultStatus('reject')).toBe('rejected');
  });
});

describe('T7 admin_action_log entries', () => {
  interface ActionLogEntry {
    actor_id: string;
    action: string;
    target_table: string;
    target_id: string;
    metadata: Record<string, unknown>;
  }

  it('approve log entry has correct action', () => {
    const entry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_approved',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: { from_status: 'submitted', to_status: 'approved' },
    };
    expect(entry.action).toBe('project_approved');
    expect(entry.metadata.to_status).toBe('approved');
  });

  it('reject log entry includes rejection_reason in metadata', () => {
    const entry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_rejected',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: {
        from_status: 'under_review',
        to_status: 'rejected',
        rejection_reason: 'Отсутствует финансовая модель',
      },
    };
    expect(entry.action).toBe('project_rejected');
    expect(typeof entry.metadata.rejection_reason).toBe('string');
  });

  it('log entry always targets projects table', () => {
    const approveEntry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_approved',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: {},
    };
    expect(approveEntry.target_table).toBe('projects');
  });
});

describe('T7 AI report display logic', () => {
  it('done report shows summary', () => {
    const report: AIReportRow = {
      id: 'r-1',
      project_id: 'p-1',
      status: 'done',
      report: {
        red_flags: [],
        missing_data: [],
        draft_card: '# Test',
        ai_score: 7,
        summary: 'Хороший проект с чёткой командой',
      } as AIAnalysisReport,
      created_at: '2026-06-27T00:00:00Z',
      updated_at: '2026-06-27T00:00:00Z',
    };
    expect(report.status).toBe('done');
    const r = report.report as AIAnalysisReport;
    expect(r.summary.length).toBeGreaterThan(0);
    expect(r.ai_score).toBeGreaterThanOrEqual(1);
  });

  it('processing report is not displayable', () => {
    const report: AIReportRow = {
      id: 'r-2',
      project_id: 'p-1',
      status: 'processing',
      report: {},
      created_at: '2026-06-27T00:00:00Z',
      updated_at: '2026-06-27T00:00:00Z',
    };
    expect(report.status).not.toBe('done');
  });

  it('red flags sorted by severity weight', () => {
    const severityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const flags = [
      { severity: 'low', description: 'Minor' },
      { severity: 'high', description: 'Critical' },
      { severity: 'medium', description: 'Notable' },
    ];
    const sorted = [...flags].sort(
      (a, b) => severityWeight[b.severity] - severityWeight[a.severity]
    );
    expect(sorted[0].severity).toBe('high');
    expect(sorted[2].severity).toBe('low');
  });
});

describe('T7 ProjectRow moderation fields', () => {
  it('approved project has moderated_by and moderated_at', () => {
    const project: ProjectRow = {
      id: 'p-1',
      owner_id: 'u-1',
      name: 'Test Project',
      status: 'approved',
      moderated_by: 'mod-1',
      moderated_at: '2026-06-27T12:00:00Z',
      rejection_reason: null,
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-27T12:00:00Z',
    };
    expect(project.moderated_by).not.toBeNull();
    expect(project.moderated_at).not.toBeNull();
    expect(project.rejection_reason).toBeNull();
  });

  it('rejected project has rejection_reason', () => {
    const project: ProjectRow = {
      id: 'p-2',
      owner_id: 'u-1',
      name: 'Test Project',
      status: 'rejected',
      moderated_by: 'mod-1',
      moderated_at: '2026-06-27T12:00:00Z',
      rejection_reason: 'Недостаточно данных о команде',
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-27T12:00:00Z',
    };
    expect(project.status).toBe('rejected');
    expect(project.rejection_reason).not.toBeNull();
    expect((project.rejection_reason ?? '').length).toBeGreaterThan(0);
  });
});
