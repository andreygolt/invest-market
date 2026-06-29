import { NextRequest } from 'next/server';
import { GET, PUT } from '@/app/api/admin/settings/route';
import type { PlatformSettings, UserRole } from '@/types';

const mockSuperadminId = 'superadmin-1';
const mockGetAuthUser = jest.fn();
const mockServerFrom = jest.fn();
const mockAdminFrom = jest.fn();
const mockSelectSettings = jest.fn();
const mockUpsertSettings = jest.fn();

type Role = UserRole | null;

const mockSettingsData = [
  { key: 'platform_name', value: 'Invest Market', updated_at: '2026-01-01T00:00:00Z', updated_by: null },
  { key: 'success_fee_default', value: '5', updated_at: '2026-01-01T00:00:00Z', updated_by: null },
];

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

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockAuthUser(userId: string | null) {
  mockGetAuthUser.mockResolvedValue({
    data: { user: userId === null ? null : { id: userId } },
  });
}

function mockActorRole(role: Role) {
  mockServerFrom.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(async () => ({
      data: role === null ? null : { role },
      error: null,
    })),
  });
}

function mockAdminSettings() {
  mockAdminFrom.mockReturnValue({
    select: mockSelectSettings,
    upsert: mockUpsertSettings,
  });
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('T57 /api/admin/settings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthUser(mockSuperadminId);
    mockActorRole('superadmin');
    mockSelectSettings.mockResolvedValue({ data: mockSettingsData, error: null });
    mockUpsertSettings.mockResolvedValue({ error: null });
    mockAdminSettings();
  });

  it('GET returns 401 without auth', async () => {
    mockAuthUser(null);

    const response = await GET();
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('GET returns 403 for investor role', async () => {
    mockActorRole('investor');

    const response = await GET();
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET returns 403 for moderator role', async () => {
    mockActorRole('moderator');

    const response = await GET();
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('GET returns 200 for admin role', async () => {
    mockActorRole('admin');

    const response = await GET();

    expect(response.status).toBe(200);
  });

  it('GET returns 200 for superadmin role', async () => {
    mockActorRole('superadmin');

    const response = await GET();

    expect(response.status).toBe(200);
  });

  it('GET returns settings object', async () => {
    const response = await GET();
    const body = await readJson<{ settings: Partial<PlatformSettings> }>(response);

    expect(body.settings).toEqual({
      platform_name: 'Invest Market',
      success_fee_default: '5',
    });
  });

  it('GET returns 500 on database error', async () => {
    mockSelectSettings.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const response = await GET();
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('DB error');
  });

  it('PUT returns 401 without auth', async () => {
    mockAuthUser(null);

    const response = await PUT(makePutRequest({ platform_name: 'New Name' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('PUT returns 403 for admin role', async () => {
    mockActorRole('admin');

    const response = await PUT(makePutRequest({ platform_name: 'New Name' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('PUT returns 403 for manager role', async () => {
    mockActorRole('manager');

    const response = await PUT(makePutRequest({ platform_name: 'New Name' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('PUT returns 400 for empty body', async () => {
    const response = await PUT(makePutRequest({}));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('No settings provided');
  });

  it('PUT returns 400 for unknown setting key', async () => {
    const response = await PUT(makePutRequest({ unknown_key: 'value' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Unknown setting key: unknown_key');
  });

  it('PUT returns 400 when numeric field is not a number', async () => {
    const response = await PUT(makePutRequest({ success_fee_default: 'abc' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Setting "success_fee_default" must be a non-negative number');
  });

  it('PUT returns 400 when numeric field is negative', async () => {
    const response = await PUT(makePutRequest({ min_investment_amount: '-1' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(400);
    expect(body.error).toBe('Setting "min_investment_amount" must be a non-negative number');
  });

  it('PUT returns 200 when superadmin updates one setting', async () => {
    const response = await PUT(makePutRequest({ contact_email: 'help@test.com' }));
    const body = await readJson<{ ok: boolean }>(response);

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockUpsertSettings).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'contact_email', value: 'help@test.com', updated_by: mockSuperadminId })],
      { onConflict: 'key' }
    );
  });

  it('PUT returns 200 when superadmin updates multiple settings', async () => {
    const response = await PUT(
      makePutRequest({
        platform_name: 'Invest Market Pro',
        catalog_page_size: '24',
      })
    );

    expect(response.status).toBe(200);
    expect(mockUpsertSettings).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ key: 'platform_name', value: 'Invest Market Pro' }),
        expect.objectContaining({ key: 'catalog_page_size', value: '24' }),
      ]),
      { onConflict: 'key' }
    );
  });

  it('PUT returns 200 for numeric setting update', async () => {
    const response = await PUT(makePutRequest({ success_fee_default: '7' }));

    expect(response.status).toBe(200);
    expect(mockUpsertSettings).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'success_fee_default', value: '7' })],
      { onConflict: 'key' }
    );
  });

  it('PUT returns 200 for string setting update', async () => {
    const response = await PUT(makePutRequest({ platform_name: 'New Platform' }));

    expect(response.status).toBe(200);
    expect(mockUpsertSettings).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'platform_name', value: 'New Platform' })],
      { onConflict: 'key' }
    );
  });

  it('PUT returns 500 on database upsert error', async () => {
    mockUpsertSettings.mockResolvedValue({ error: { message: 'Upsert failed' } });

    const response = await PUT(makePutRequest({ platform_name: 'New Platform' }));
    const body = await readJson<{ error: string }>(response);

    expect(response.status).toBe(500);
    expect(body.error).toBe('Upsert failed');
  });

  it('PUT accepts numeric values as numbers', async () => {
    const response = await PUT(makePutRequest({ catalog_page_size: 30 }));

    expect(response.status).toBe(200);
    expect(mockUpsertSettings).toHaveBeenCalledWith(
      [expect.objectContaining({ key: 'catalog_page_size', value: '30' })],
      { onConflict: 'key' }
    );
  });
});
