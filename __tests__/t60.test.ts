import { NextRequest } from 'next/server';
import { sendEmail } from '@/lib/email/send';
import { notificationEmailTemplate } from '@/lib/email/templates';
import { POST } from '@/app/api/notifications/dispatch-email/route';

const mockFetch = jest.fn();
const mockNotifSingle = jest.fn();
const mockProfileSingle = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
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

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function restoreEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function makeRequest(body: Record<string, unknown>, secret = 'test-secret'): NextRequest {
  return new NextRequest('http://localhost/api/notifications/dispatch-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
  });
}

describe('T60 sendEmail', () => {
  beforeEach(() => {
    restoreEnv();
    mockFetch.mockReset();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('returns ok true when RESEND_API_KEY is not set', async () => {
    delete process.env.RESEND_API_KEY;
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(sendEmail({ to: 'user@test.ru', subject: 'Subject', html: '<p>Hello</p>' }))
      .resolves.toEqual({ ok: true });
    expect(logSpy).toHaveBeenCalledWith(
      '[email] Mock send to:',
      'user@test.ru',
      '| subject:',
      'Subject'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('calls fetch with Authorization header', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    mockFetch.mockResolvedValue({ ok: true });

    await sendEmail({ to: 'user@test.ru', subject: 'Subject', html: '<p>Hello</p>' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer resend-key' }),
      })
    );
  });

  it('calls fetch with from, to, subject and html body', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    process.env.EMAIL_FROM = 'notify@test.ru';
    mockFetch.mockResolvedValue({ ok: true });

    await sendEmail({ to: 'user@test.ru', subject: 'Subject', html: '<p>Hello</p>' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'notify@test.ru',
      to: ['user@test.ru'],
      subject: 'Subject',
      html: '<p>Hello</p>',
    });
  });

  it('returns ok true on HTTP 200 from Resend', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    mockFetch.mockResolvedValue({ ok: true });

    await expect(sendEmail({ to: 'user@test.ru', subject: 'Subject', html: '<p>Hello</p>' }))
      .resolves.toEqual({ ok: true });
  });

  it('returns ok false and error on HTTP 422 from Resend', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    mockFetch.mockResolvedValue({ ok: false, text: jest.fn().mockResolvedValue('invalid email') });

    await expect(sendEmail({ to: 'bad', subject: 'Subject', html: '<p>Hello</p>' })).resolves.toEqual({
      ok: false,
      error: 'invalid email',
    });
  });

  it('returns ok false and error on network error', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    mockFetch.mockRejectedValue(new Error('network down'));

    await expect(sendEmail({ to: 'user@test.ru', subject: 'Subject', html: '<p>Hello</p>' }))
      .resolves.toEqual({ ok: false, error: 'Error: network down' });
  });
});

describe('T60 notificationEmailTemplate', () => {
  it('contains subject in title tag', () => {
    const html = notificationEmailTemplate({
      recipientName: 'Андрей',
      subject: 'Новый статус',
      message: 'Статус изменён',
    });

    expect(html).toContain('<title>Новый статус</title>');
  });

  it('contains message in email body', () => {
    const html = notificationEmailTemplate({
      recipientName: 'Андрей',
      subject: 'Новый статус',
      message: 'Статус изменён',
    });

    expect(html).toContain('Статус изменён');
  });

  it('contains CTA link when ctaUrl is provided', () => {
    const html = notificationEmailTemplate({
      recipientName: 'Андрей',
      subject: 'Новый статус',
      message: 'Статус изменён',
      ctaUrl: 'https://invest-market.ru/notifications',
      ctaLabel: 'Открыть',
    });

    expect(html).toContain('<a href="https://invest-market.ru/notifications"');
  });

  it('does not contain anchor tag when ctaUrl is not provided', () => {
    const html = notificationEmailTemplate({
      recipientName: 'Андрей',
      subject: 'Новый статус',
      message: 'Статус изменён',
    });

    expect(html).not.toContain('<a ');
  });

  it('contains recipientName in greeting', () => {
    const html = notificationEmailTemplate({
      recipientName: 'Андрей',
      subject: 'Новый статус',
      message: 'Статус изменён',
    });

    expect(html).toContain('Здравствуйте, Андрей!');
  });
});

describe('T60 POST /api/notifications/dispatch-email', () => {
  beforeEach(() => {
    restoreEnv();
    process.env.INTERNAL_API_SECRET = 'test-secret';
    delete process.env.RESEND_API_KEY;
    mockFetch.mockReset();
    mockNotifSingle.mockReset();
    mockProfileSingle.mockReset();
    mockUpdate.mockClear();
    mockUpdateEq.mockReset().mockResolvedValue({ error: null });
    global.fetch = mockFetch as unknown as typeof fetch;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    restoreEnv();
    global.fetch = ORIGINAL_FETCH;
    jest.restoreAllMocks();
  });

  it('returns 401 with invalid x-internal-secret', async () => {
    const response = await POST(makeRequest({ notification_id: 'notif-1' }, 'wrong'));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when notification_id is missing', async () => {
    const response = await POST(makeRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'notification_id required' });
  });

  it('returns 404 when notification is not found', async () => {
    mockNotifSingle.mockResolvedValue({ data: null, error: { message: 'not found' } });

    const response = await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Notification not found' });
  });

  it('returns ok skipped when email_sent is already true', async () => {
    mockNotifSingle.mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: true },
      error: null,
    });

    const response = await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
    expect(mockProfileSingle).not.toHaveBeenCalled();
  });

  it('returns 404 when profile.email is missing', async () => {
    mockNotifSingle.mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: false },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({ data: { email: null, full_name: 'User' }, error: null });

    const response = await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'User email not found' });
  });

  it('returns 200 ok on successful send', async () => {
    mockNotifSingle.mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: false },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { email: 'user@test.ru', full_name: 'User' },
      error: null,
    });

    const response = await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('marks email_sent true and email_sent_at after successful send', async () => {
    mockNotifSingle.mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: false },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { email: 'user@test.ru', full_name: 'User' },
      error: null,
    });

    await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(mockUpdate).toHaveBeenCalledWith({
      email_sent: true,
      email_sent_at: expect.any(String),
    });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'notif-1');
  });

  it('returns 500 when sendEmail returns ok false', async () => {
    process.env.RESEND_API_KEY = 'resend-key';
    mockFetch.mockResolvedValue({ ok: false, text: jest.fn().mockResolvedValue('resend error') });
    mockNotifSingle.mockResolvedValue({
      data: { id: 'notif-1', title: 'Title', body: 'Body', user_id: 'user-1', email_sent: false },
      error: null,
    });
    mockProfileSingle.mockResolvedValue({
      data: { email: 'user@test.ru', full_name: 'User' },
      error: null,
    });

    const response = await POST(makeRequest({ notification_id: 'notif-1' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'resend error' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
