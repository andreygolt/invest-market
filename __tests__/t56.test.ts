import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/admin/users/[id]/route';
import type { UserProfile, UserRole } from '@/types';

const mockUserId = 'user-123';
const mockAdminId = 'admin-1';

const mockGetAuthUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockGetUser = jest.fn();
const mockPatchUser = jest.fn();
const mockUpdate = jest.fn();

type MockDbError = { message: string } | null;
type Role = UserRole | null;
type RouteContext = { params: Promise<{ id: string }> };

const baseUserProfile: UserProfile = {
  id: mockUserId,
  email: 'user@test.com',
  role: 'investor',
  full_name: 'Test User',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetAuthUser,
    },
    from: mockServerFrom,
  })),
}));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: mockAdminFrom,
  })),
}));

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`);
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeContext(id: string): RouteContext {
  return {
    params: Promise.resolve({ id }),
  };
}

function mockAuthUser(userId: string | null) {
  mockGetAuthUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function mockActorRole(role: Role, error: MockDbError = null) {
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: role === null ? null : { role },
      error,
    })),
  });
}

function setupAdminQuery() {
  mockAdminFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: mockUpdate.mockReturnThis(),
    single: jest.fn(async () => {
      if (mockUpdate.mock.calls.length > 0) {
        return mockPatchUser();
      }

      return mockGetUser();
    }),
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('T56 /api/admin/users/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser(mockAdminId);
    mockActorRole('admin');
    mockGetUser.mockResolvedValue({ data: baseUserProfile, error: null });
    mockPatchUser.mockResolvedValue({ data: baseUserProfile, error: null });
    setupAdminQuery();
  });

  it('GET returns 401 without auth', async () => {
    mockAuthUser(null);

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET returns 403 for investor role', async () => {
    mockActorRole('investor');

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET returns 403 for moderator role', async () => {
    mockActorRole('moderator');

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET returns 200 for admin role', async () => {
    mockActorRole('admin');

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));

    expect(response.status).toBe(200);
  });

  it('GET returns 200 for superadmin role', async () => {
    mockActorRole('superadmin');

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));

    expect(response.status).toBe(200);
  });

  it('GET returns UserProfile with id, email, role, is_active, created_at', async () => {
    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));
    const body = await readJson<UserProfile>(response);

    expect(body).toMatchObject({
      id: mockUserId,
      email: 'user@test.com',
      role: 'investor',
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
    });
  });

  it('GET returns 500 on database error', async () => {
    mockGetUser.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const response = await GET(makeGetRequest(mockUserId), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('DB error');
  });

  it('PATCH returns 401 without auth', async () => {
    mockAuthUser(null);

    const response = await PATCH(makePatchRequest(mockUserId, { role: 'manager' }), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('PATCH returns 403 for investor role', async () => {
    mockActorRole('investor');

    const response = await PATCH(makePatchRequest(mockUserId, { role: 'manager' }), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('PATCH returns 400 for invalid role', async () => {
    const response = await PATCH(makePatchRequest(mockUserId, { role: 'owner' }), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid user update');
  });

  it('PATCH returns 400 when is_active is not boolean', async () => {
    const response = await PATCH(
      makePatchRequest(mockUserId, { is_active: 'false' }),
      makeContext(mockUserId)
    );
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Invalid user update');
  });

  it('PATCH returns 400 when updating own account', async () => {
    const response = await PATCH(
      makePatchRequest(mockAdminId, { role: 'manager' }),
      makeContext(mockAdminId)
    );
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Cannot update own account');
  });

  it('PATCH returns 403 when admin assigns superadmin role', async () => {
    mockActorRole('admin');

    const response = await PATCH(
      makePatchRequest(mockUserId, { role: 'superadmin' }),
      makeContext(mockUserId)
    );
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Only superadmin can assign superadmin role');
  });

  it('PATCH allows superadmin to assign superadmin role', async () => {
    const updatedProfile: UserProfile = { ...baseUserProfile, role: 'superadmin' };
    mockActorRole('superadmin');
    mockPatchUser.mockResolvedValue({ data: updatedProfile, error: null });

    const response = await PATCH(
      makePatchRequest(mockUserId, { role: 'superadmin' }),
      makeContext(mockUserId)
    );
    const body = await readJson<UserProfile>(response);

    expect(response.status).toBe(200);
    expect(body.role).toBe('superadmin');
  });

  it('PATCH changes role successfully', async () => {
    const updatedProfile: UserProfile = { ...baseUserProfile, role: 'manager' };
    mockPatchUser.mockResolvedValue({ data: updatedProfile, error: null });

    const response = await PATCH(
      makePatchRequest(mockUserId, { role: 'manager' }),
      makeContext(mockUserId)
    );
    const body = await readJson<UserProfile>(response);

    expect(response.status).toBe(200);
    expect(body.role).toBe('manager');
    expect(mockUpdate).toHaveBeenCalledWith({ role: 'manager' });
  });

  it('PATCH blocks user with is_active false', async () => {
    const updatedProfile: UserProfile = { ...baseUserProfile, is_active: false };
    mockPatchUser.mockResolvedValue({ data: updatedProfile, error: null });

    const response = await PATCH(
      makePatchRequest(mockUserId, { is_active: false }),
      makeContext(mockUserId)
    );
    const body = await readJson<UserProfile>(response);

    expect(response.status).toBe(200);
    expect(body.is_active).toBe(false);
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false });
  });

  it('PATCH unblocks user with is_active true', async () => {
    const updatedProfile: UserProfile = { ...baseUserProfile, is_active: true };
    mockPatchUser.mockResolvedValue({ data: updatedProfile, error: null });

    const response = await PATCH(
      makePatchRequest(mockUserId, { is_active: true }),
      makeContext(mockUserId)
    );
    const body = await readJson<UserProfile>(response);

    expect(response.status).toBe(200);
    expect(body.is_active).toBe(true);
    expect(mockUpdate).toHaveBeenCalledWith({ is_active: true });
  });

  it('PATCH returns updated UserProfile', async () => {
    const updatedProfile: UserProfile = {
      ...baseUserProfile,
      role: 'moderator',
      is_active: false,
    };
    mockPatchUser.mockResolvedValue({ data: updatedProfile, error: null });

    const response = await PATCH(
      makePatchRequest(mockUserId, { role: 'moderator', is_active: false }),
      makeContext(mockUserId)
    );
    const body = await readJson<UserProfile>(response);

    expect(body).toEqual(updatedProfile);
  });

  it('PATCH returns 500 on database update error', async () => {
    mockPatchUser.mockResolvedValue({ data: null, error: { message: 'Update failed' } });

    const response = await PATCH(makePatchRequest(mockUserId, { role: 'manager' }), makeContext(mockUserId));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('Update failed');
  });

  it('PATCH can update role only and is_active only', async () => {
    await PATCH(makePatchRequest(mockUserId, { role: 'project' }), makeContext(mockUserId));
    expect(mockUpdate).toHaveBeenLastCalledWith({ role: 'project' });

    mockUpdate.mockClear();

    await PATCH(makePatchRequest(mockUserId, { is_active: false }), makeContext(mockUserId));
    expect(mockUpdate).toHaveBeenLastCalledWith({ is_active: false });
  });
});
