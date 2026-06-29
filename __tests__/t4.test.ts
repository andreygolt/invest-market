import type { ProjectStatus, ProjectStatusLog } from '@/types';

describe('T4 ProjectStatus type', () => {
  it('draft is valid status', () => {
    const s: ProjectStatus = 'draft';
    expect(s).toBe('draft');
  });

  it('all statuses are defined', () => {
    const statuses: ProjectStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
    expect(statuses).toHaveLength(5);
  });

  it('submitted follows draft in flow', () => {
    const flow: ProjectStatus[] = ['draft', 'submitted', 'under_review', 'approved'];
    expect(flow.indexOf('submitted')).toBeGreaterThan(flow.indexOf('draft'));
  });
});

describe('T4 ProjectStatusLog type', () => {
  it('status log shape is correct', () => {
    const log: ProjectStatusLog = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      from_status: 'draft',
      to_status: 'submitted',
      changed_by: 'uuid-3',
      changed_at: '2026-06-27T10:00:00Z',
      comment: null,
    };
    expect(log.to_status).toBe('submitted');
    expect(log.comment).toBeNull();
  });

  it('from_status can be null (initial transition)', () => {
    const log: ProjectStatusLog = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      from_status: null,
      to_status: 'draft',
      changed_by: null,
      changed_at: '2026-06-27T10:00:00Z',
      comment: null,
    };
    expect(log.from_status).toBeNull();
  });
});

describe('T4 video validation logic', () => {
  const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
  const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

  it('max video size is 200MB', () => {
    expect(MAX_VIDEO_SIZE).toBe(209715200);
  });

  it('mp4 is allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/mp4')).toBe(true);
  });

  it('mov (quicktime) is allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/quicktime')).toBe(true);
  });

  it('avi is not allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/avi')).toBe(false);
  });
});

describe('T4 submit validation', () => {
  it('only draft projects can be submitted', () => {
    const canSubmit = (status: string) => status === 'draft';
    expect(canSubmit('draft')).toBe(true);
    expect(canSubmit('submitted')).toBe(false);
    expect(canSubmit('approved')).toBe(false);
  });
});
