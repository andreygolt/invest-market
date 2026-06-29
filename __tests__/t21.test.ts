import { NextRequest } from 'next/server';
import { GET, POST, validateInviteInsert } from '@/app/api/admin/invites/route';
import { DELETE } from '@/app/api/admin/invites/[id]/route';
import { getInviteStatus } from '@/app/(admin)/invites/invites-client';
import type { Invite, InviteInsert } from '@/types';

const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
};

function makeRoleQuery(role: string) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => ({ data: { role }, error: null })),
      })),
    })),
  };
}

function makeInvitesListQuery(data: Invite[], count = data.length) {
  return {
    select: jest.fn(() => ({
      order: jest.fn(() => ({
        range: jest.fn(async () => ({ data, error: null, count })),
      })),
    })),
  };
}

function makeInsertQuery(data: Invite) {
  return {
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn(async () => ({ data, error: null })),
      })),
    })),
  };
}

function makeDeleteQuery(selectResult: QueryResult, deleteResult: QueryResult) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => selectResult),
      })),
    })),
    delete: jest.fn(() => ({
      eq: jest.fn(async () => deleteResult),
    })),
  };
}

const sampleInvite: Invite = {
  id: 'invite-1',
  code: 'abcd1234',
  role: 'investor',
  email: 'investor@example.com',
  used_by: null,
  used_at: null,
  created_by: 'admin-1',
  created_at: '2026-06-28T10:00:00Z',
  expires_at: null,
  note: 'Тестовый инвайт',
};

describe('T21 invites admin', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockFrom.mockReset();
  });

  it('InviteInsert validates role', () => {
    const valid: InviteInsert = { role: 'investor' };
    expect(validateInviteInsert(valid)).toBe(true);
    expect(validateInviteInsert({ role: 'superadmin' })).toBe(false);
  });

  it('GET /api/admin/invites returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new NextRequest('http://localhost/api/admin/invites'));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET /api/admin/invites returns 403 for role=investor', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'investor-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('investor');
      return makeInvitesListQuery([]);
    });

    const response = await GET(new NextRequest('http://localhost/api/admin/invites'));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('POST /api/admin/invites creates invite', async () => {
    const insertQuery = makeInsertQuery(sampleInvite);
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'invites') return insertQuery;
      return makeInvitesListQuery([]);
    });

    const response = await POST(
      new NextRequest('http://localhost/api/admin/invites', {
        method: 'POST',
        body: JSON.stringify({ role: 'investor', email: 'investor@example.com' }),
      })
    );
    const body = (await response.json()) as Invite;

    expect(response.status).toBe(201);
    expect(insertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'investor',
        email: 'investor@example.com',
        created_by: 'admin-1',
      })
    );
    expect(body.id).toBe('invite-1');
  });

  it('DELETE /api/admin/invites/[id] returns 400 if invite is already used', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'invites') {
        return makeDeleteQuery(
          { data: { used_by: 'user-1' }, error: null },
          { data: null, error: null }
        );
      }
      return makeInvitesListQuery([]);
    });

    const response = await DELETE(new NextRequest('http://localhost/api/admin/invites/invite-1'), {
      params: Promise.resolve({ id: 'invite-1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe('invite already used');
  });

  it('DELETE /api/admin/invites/[id] returns 204 if unused', async () => {
    const deleteQuery = makeDeleteQuery(
      { data: { used_by: null }, error: null },
      { data: null, error: null }
    );
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') return makeRoleQuery('admin');
      if (table === 'invites') return deleteQuery;
      return makeInvitesListQuery([]);
    });

    const response = await DELETE(new NextRequest('http://localhost/api/admin/invites/invite-1'), {
      params: Promise.resolve({ id: 'invite-1' }),
    });

    expect(response.status).toBe(204);
    expect(deleteQuery.delete).toHaveBeenCalled();
  });

  it("expired invite has status 'expired'", () => {
    const expired = {
      used_by: null,
      expires_at: '2020-01-01T00:00:00Z',
    };

    expect(getInviteStatus(expired)).toBe('expired');
  });
});
