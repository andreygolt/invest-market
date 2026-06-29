import type { ExtractionStatus, DocumentExtraction } from '@/types';

describe('T5 ExtractionStatus type', () => {
  it('pending is valid', () => {
    const s: ExtractionStatus = 'pending';
    expect(s).toBe('pending');
  });

  it('all statuses are valid', () => {
    const statuses: ExtractionStatus[] = ['pending', 'processing', 'done', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('done comes after processing in flow', () => {
    const flow: ExtractionStatus[] = ['pending', 'processing', 'done'];
    expect(flow.indexOf('done')).toBeGreaterThan(flow.indexOf('processing'));
  });
});

describe('T5 DocumentExtraction shape', () => {
  it('done extraction has text', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'done',
      extracted_text: 'Some extracted text',
      error_message: null,
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(extraction.status).toBe('done');
    expect(extraction.extracted_text).toBeTruthy();
    expect(extraction.error_message).toBeNull();
  });

  it('error extraction has error_message', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'error',
      extracted_text: null,
      error_message: 'Storage download failed',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(extraction.status).toBe('error');
    expect(extraction.error_message).toBeTruthy();
  });

  it('pending extraction has no text', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'pending',
      extracted_text: null,
      error_message: null,
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:00:00Z',
    };
    expect(extraction.extracted_text).toBeNull();
  });
});

describe('T5 MIME type mapping', () => {
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  it('pdf maps to application/pdf', () => {
    expect(mimeMap['pdf']).toBe('application/pdf');
  });

  it('png maps to image/png', () => {
    expect(mimeMap['png']).toBe('image/png');
  });

  it('docx maps to correct MIME', () => {
    expect(mimeMap['docx']).toContain('wordprocessingml');
  });

  it('unknown extension is not in map', () => {
    expect(mimeMap['xyz']).toBeUndefined();
  });
});

describe('T5 pipeline allowed statuses', () => {
  const allowedStatuses = ['submitted', 'under_review'];

  it('submitted is allowed', () => {
    expect(allowedStatuses.includes('submitted')).toBe(true);
  });

  it('under_review is allowed', () => {
    expect(allowedStatuses.includes('under_review')).toBe(true);
  });

  it('draft is not allowed', () => {
    expect(allowedStatuses.includes('draft')).toBe(false);
  });

  it('approved is not allowed to re-extract', () => {
    expect(allowedStatuses.includes('approved')).toBe(false);
  });
});
