import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { NextRequest } from 'next/server';
import { isEmailEnabled } from '@/lib/email/preferences';
import { GET, PATCH } from '@/app/api/profile/notification-preferences/route';
import { POST } from '@/app/api/notifications/dispatch-email/route';
import { sendEmail } from '@/lib/email/send';
import { NotificationPrefsSection } from '@/app/profile/notification-prefs-section';

const mockPrefSingle = jest.fn();
const mockNotifSingle = jest.fn();
const mockProfileSingle = jest.fn();
const mockUpsert = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockGetUser = jest.fn();

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'notification_preferences') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockPrefSingle,
          upsert: mockUpsert,
        };
      }

      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockNotifSingle,
          update: mockUpdate,
        };
      }

      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockProfileSingle,
        };
      }

      return {};
    }),
  })),
}));

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}));

jest.mock('@/lib/email/send', () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/profile/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeInvalidJsonPatchRequest(): NextRequest {
  return new NextRequest('http://localhost/api/profile/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
}

function makeDispatchRequest(body: Record<string, unknown>, secret = 'test-secret'): NextRequest {
  return new NextRequest('http://localhost/api/notifications/dispatch-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
  });
}

describe('T61 isEmailEnabled', () => {
  beforeEach(() => {
    mockPrefSingle.mockReset();
  });

  it('returns true when there is no preferences row', async () => {
    mockPrefSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    await expect(isEmailEnabled('user-1')).resolves.toBe(true);
  });

  it('returns true when email_enabled is true', async () => {
    mockPrefSingle.mockResolvedValue({ data: { email_enabled: true }, error: null });

    await expect(isEmailEnabled('user-1')).resolves.toBe(true);
  });

  it('returns false when email_enabled is false', async () => {
    mockPrefSingle.mockResolvedValue({ data: { email_enabled: false }, error: null });

    await expect(isEmailEnabled('user-1')).resolves.toBe(false);
  });

  it('returns true on database error', async () => {
    mockPrefSingle.mockRejectedValue(new Error('db down'));

    await expect(isEmailEnabled('user-1')).resolves.toBe(true);
  });
});

describe('T61 GET /api/profile/notification-preferences', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockPrefSingle.mockReset();
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns email_enabled true when row is missing', async () => {
    mockPrefSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ email_enabled: true });
  });

  it('returns email_enabled false when user opted out', async () => {
    mockPrefSingle.mockResolvedValue({ data: { email_enabled: false }, error: null });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ email_enabled: false });
  });
});

describe('T61 PATCH /api/profile/notification-preferences', () => {
  beforeEach(() => {
    mockGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockUpsert.mockReset().mockResolvedValue({ error: null });
  });

  it('returns 401 without auth', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const response = await PATCH(makePatchRequest({ email_enabled: false }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when email_enabled is a string', async () => {
    const response = await PATCH(makePatchRequest({ email_enabled: 'false' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'email_enabled must be boolean' });
  });

  it('returns 400 when email_enabled is a number', async () => {
    const response = await PATCH(makePatchRequest({ email_enabled: 0 }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'email_enabled must be boolean' });
  });

  it('returns 400 when JSON is invalid', async () => {
    const response = await PATCH(makeInvalidJsonPatchRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Invalid JSON' });
  });

  it('returns 400 when email_enabled is missing', async () => {
    const response = await PATCH(makePatchRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'email_enabled must be boolean' });
  });

  it('returns 200 on opt-out', async () => {
    const response = await PATCH(makePatchRequest({ email_enabled: false }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, email_enabled: false });
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', email_enabled: false }),
      { onConflict: 'user_id' }
    );
  });

  it('returns 200 on opt-in', async () => {
    const response = await PATCH(makePatchRequest({ email_enabled: true }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, email_enabled: true });
  });

  it('returns 500 when upsert fails', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'upsert failed' } });

    const response = await PATCH(makePatchRequest({ email_enabled: true }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'upsert failed' });
  });
});

describe('T61 POST /api/notifications/dispatch-email', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.INTERNAL_API_SECRET = 'test-secret';
    mockPrefSingle.mockReset();
    mockNotifSingle.mockReset().mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: false },
      error: null,
    });
    mockProfileSingle.mockReset().mockResolvedValue({
      data: { email: 'user@test.ru', full_name: 'User' },
      error: null,
    });
    mockUpdate.mockClear();
    mockUpdateEq.mockReset().mockResolvedValue({ error: null });
    jest.mocked(sendEmail).mockClear().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    restoreEnv();
  });

  it('skips sending email when isEmailEnabled returns false', async () => {
    mockPrefSingle.mockResolvedValue({ data: { email_enabled: false }, error: null });

    const response = await POST(makeDispatchRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      skipped: true,
      reason: 'email_disabled',
    });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('sends email when isEmailEnabled returns true', async () => {
    mockPrefSingle.mockResolvedValue({ data: { email_enabled: true }, error: null });

    const response = await POST(makeDispatchRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@test.ru', subject: 'Title' })
    );
  });
});

describe('T61 NotificationPrefsSection', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, email_enabled: false }),
    }) as jest.Mock;
  });

  it('renders with initialEmailEnabled=true', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationPrefsSection, { initialEmailEnabled: true })
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Email-уведомления');
  });

  it('renders with initialEmailEnabled=false', () => {
    const html = renderToStaticMarkup(
      createElement(NotificationPrefsSection, { initialEmailEnabled: false })
    );

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
  });

  it('toggle handler sends PATCH to notification preferences endpoint', () => {
    const componentSource = NotificationPrefsSection.toString();

    expect(componentSource).toContain("fetch('/api/profile/notification-preferences'");
    expect(componentSource).toContain("method: 'PATCH'");
    expect(componentSource).toContain('email_enabled');
  });
});
