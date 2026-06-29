import { NextRequest } from 'next/server';

import { GET as GET_AUDIT_LOG } from '@/app/api/admin/audit-log/route';
import { writeAuditLog } from '@/lib/audit/log';
import type { AuditAction, AuditLogInsert, AuditLogRow } from '@/types';

type MockRole = 'admin' | 'superadmin' | 'investor';
type MockUser = { id: string; email?: string } | null;
type MockError = { message: string } | null;
type AuditQueryResult = { data: AuditLogRow[]; error: MockError; count: number | null };
type AuditQuery = PromiseLike<AuditQueryResult> & {
  select: jest.Mock<AuditQuery, [string, { count: 'exact' }]>;
  order: jest.Mock<AuditQuery, [string, { ascending: boolean }]>;
  range: jest.Mock<AuditQuery, [number, number]>;
  eq: jest.Mock<AuditQuery, [string, string]>;
};

const mockGetUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockInsert = jest.fn();
const mockRange = jest.fn();
const mockEq = jest.fn();

let mockUser: MockUser = { id: 'admin-1', email: 'admin@test.com' };
let mockRole: MockRole = 'admin';
let auditRows: AuditLogRow[] = [];
let auditCount = 0;

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockServerFrom,
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

function makeAuditQuery(): AuditQuery {
  let filteredRows = auditRows;
  const query: AuditQuery = {
    select: jest.fn(() => query),
    order: jest.fn(() => query),
    range: jest.fn((from: number, to: number) => {
      mockRange(from, to);
      return query;
    }),
    eq: jest.fn((column: string, value: string) => {
      mockEq(column, value);
      if (column === 'action') {
        filteredRows = auditRows.filter((row) => row.action === value);
      }
      return query;
    }),
    then: (resolve, reject) =>
      Promise.resolve({ data: filteredRows, error: null, count: auditCount }).then(resolve, reject),
  };
  return query;
}

function setupAuth(role: MockRole = 'admin', user: MockUser = { id: 'admin-1', email: 'admin@test.com' }) {
  mockRole = role;
  mockUser = user;
  mockGetUser.mockResolvedValue({ data: { user: mockUser } });
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: mockRole ? { role: mockRole } : null,
      error: null,
    })),
  });
}

function setupAdmin() {
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'admin_audit_log') {
      const query = makeAuditQuery();
      return {
        ...query,
        insert: mockInsert,
      };
    }
    return { insert: mockInsert };
  });
}

function makeRequest(search = '') {
  return new NextRequest(`http://localhost/api/admin/audit-log${search}`);
}

describe('T50 admin audit log', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockServerFrom.mockReset();
    mockAdminFrom.mockReset();
    mockInsert.mockReset();
    mockRange.mockReset();
    mockEq.mockReset();
    auditRows = [];
    auditCount = 0;
    mockUser = { id: 'admin-1', email: 'admin@test.com' };
    mockInsert.mockResolvedValue({ error: null });
    setupAuth();
    setupAdmin();
  });

  it('writeAuditLog calls adminClient insert with entry', async () => {
    const entry: AuditLogInsert = {
      actor_id: 'admin-1',
      action: 'project_approved',
      entity_type: 'project',
      entity_id: 'project-1',
    };

    await writeAuditLog(entry);

    expect(mockAdminFrom).toHaveBeenCalledWith('admin_audit_log');
    expect(mockInsert).toHaveBeenCalledWith(entry);
  });

  it('writeAuditLog does not throw when DB insert fails', async () => {
    mockInsert.mockRejectedValue(new Error('db error'));

    await expect(
      writeAuditLog({
        actor_id: 'admin-1',
        action: 'broadcast_sent',
        entity_type: 'notification',
      })
    ).resolves.toBeUndefined();
  });

  it('GET /api/admin/audit-log returns 401 without auth', async () => {
    setupAuth('admin', null);

    const response = await GET_AUDIT_LOG(makeRequest());

    expect(response.status).toBe(401);
  });

  it('GET /api/admin/audit-log returns 403 for investor role', async () => {
    setupAuth('investor');

    const response = await GET_AUDIT_LOG(makeRequest());

    expect(response.status).toBe(403);
  });

  it('GET /api/admin/audit-log returns rows, total, page, limit for admin', async () => {
    auditRows = [
      {
        id: 'log-1',
        actor_id: 'admin-1',
        actor_email: 'admin@test.com',
        action: 'project_approved',
        entity_type: 'project',
        entity_id: 'project-1',
        meta: null,
        created_at: '2026-06-28T10:00:00Z',
      },
    ];
    auditCount = 1;

    const response = await GET_AUDIT_LOG(makeRequest());
    const body = (await response.json()) as { rows: AuditLogRow[]; total: number; page: number; limit: number };

    expect(response.status).toBe(200);
    expect(body).toEqual({ rows: auditRows, total: 1, page: 1, limit: 20 });
  });

  it('GET /api/admin/audit-log returns 200 for superadmin', async () => {
    setupAuth('superadmin');

    const response = await GET_AUDIT_LOG(makeRequest());

    expect(response.status).toBe(200);
  });

  it('GET /api/admin/audit-log passes action filter to DB query', async () => {
    await GET_AUDIT_LOG(makeRequest('?action=project_approved'));

    expect(mockEq).toHaveBeenCalledWith('action', 'project_approved');
  });

  it('GET /api/admin/audit-log uses offset 20 for page 2', async () => {
    await GET_AUDIT_LOG(makeRequest('?page=2'));

    expect(mockRange).toHaveBeenCalledWith(20, 39);
  });

  it('GET /api/admin/audit-log caps limit at 100', async () => {
    const response = await GET_AUDIT_LOG(makeRequest('?limit=500'));
    const body = (await response.json()) as { limit: number };

    expect(body.limit).toBe(100);
    expect(mockRange).toHaveBeenCalledWith(0, 99);
  });

  it('GET /api/admin/audit-log keeps page above zero', async () => {
    const response = await GET_AUDIT_LOG(makeRequest('?page=-2'));
    const body = (await response.json()) as { page: number };

    expect(body.page).toBe(1);
  });

  it('AuditLogRow contains required fields', () => {
    const row: Pick<AuditLogRow, 'id' | 'actor_id' | 'action' | 'entity_type' | 'created_at'> = {
      id: 'log-1',
      actor_id: 'admin-1',
      action: 'project_approved',
      entity_type: 'project',
      created_at: '2026-06-28T10:00:00Z',
    };

    expect(row.action).toBe('project_approved');
  });

  it("AuditAction contains 'project_approved'", () => {
    const action: AuditAction = 'project_approved';

    expect(action).toBe('project_approved');
  });

  it("AuditAction contains 'broadcast_sent'", () => {
    const action: AuditAction = 'broadcast_sent';

    expect(action).toBe('broadcast_sent');
  });

  it('AuditLogInsert does not require entity_id and meta', () => {
    const entry: AuditLogInsert = {
      actor_id: 'admin-1',
      action: 'invite_created',
      entity_type: 'invite',
    };

    expect(entry.entity_type).toBe('invite');
  });

  it('GET /api/admin/audit-log returns empty rows array when there is no data', async () => {
    const response = await GET_AUDIT_LOG(makeRequest());
    const body = (await response.json()) as { rows: AuditLogRow[]; total: number };

    expect(body.rows).toEqual([]);
    expect(body.total).toBe(0);
  });
});
