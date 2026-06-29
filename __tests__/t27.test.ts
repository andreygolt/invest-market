import { NextRequest } from 'next/server';
import { GET, PATCH } from '@/app/api/profile/route';
import { POST } from '@/app/api/profile/password/route';
import type { UserProfile } from '@/types';

const mockGetUser = jest.fn();
const mockUpdateUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(async () => ({
    auth: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
    from: mockFrom,
  })),
}));

type QueryResult = {
  data: unknown;
  error: { message: string } | null;
};

function makeProfileQuery(result: QueryResult) {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single: jest.fn(async () => result),
      })),
    })),
  };
}

function makeUpdateProfileQuery(result: QueryResult) {
  return {
    update: jest.fn(() => ({
      eq: jest.fn(() => ({
        select: jest.fn(() => ({
          single: jest.fn(async () => result),
        })),
      })),
    })),
  };
}

const profile = {
  id: 'user-1',
  role: 'investor',
  full_name: 'Иван Иванов',
  is_active: true,
  created_at: '2026-06-28T10:00:00Z',
};

describe('T27 profile', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    mockUpdateUser.mockReset();
    mockFrom.mockReset();
  });

  it('GET /api/profile returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it('GET /api/profile returns profile for authorized user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
    });
    mockFrom.mockImplementation(() => makeProfileQuery({ data: profile, error: null }));

    const response = await GET();
    const body = (await response.json()) as UserProfile;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: 'user-1',
      email: 'user@example.com',
      role: 'investor',
      full_name: 'Иван Иванов',
    });
  });

  it('PATCH /api/profile returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(
      new NextRequest('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'Иван' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('PATCH /api/profile returns 400 for empty full_name', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await PATCH(
      new NextRequest('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: '   ' }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('PATCH /api/profile returns 400 for full_name longer than 100 characters', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await PATCH(
      new NextRequest('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'а'.repeat(101) }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('PATCH /api/profile updates full_name', async () => {
    const updateQuery = makeUpdateProfileQuery({
      data: { ...profile, full_name: 'Пётр Петров' },
      error: null,
    });
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'user@example.com' } },
    });
    mockFrom.mockImplementation(() => updateQuery);

    const response = await PATCH(
      new NextRequest('http://localhost/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ full_name: 'Пётр Петров' }),
      })
    );
    const body = (await response.json()) as UserProfile;

    expect(response.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ full_name: 'Пётр Петров' });
    expect(body.full_name).toBe('Пётр Петров');
  });

  it('POST /api/profile/password returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await POST(
      new NextRequest('http://localhost/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ new_password: 'password123' }),
      })
    );

    expect(response.status).toBe(401);
  });

  it('POST /api/profile/password returns 400 for short new_password', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await POST(
      new NextRequest('http://localhost/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ new_password: 'short' }),
      })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/profile/password returns 400 when new_password is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await POST(
      new NextRequest('http://localhost/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(response.status).toBe(400);
  });

  it('POST /api/profile/password changes password', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockUpdateUser.mockResolvedValue({ error: null });

    const response = await POST(
      new NextRequest('http://localhost/api/profile/password', {
        method: 'POST',
        body: JSON.stringify({ new_password: 'password123' }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'password123' });
  });
});
