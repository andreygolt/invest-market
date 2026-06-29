const RESEND_API_URL = 'https://api.resend.com/emails';

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

interface SendEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Отправляет email через Resend REST API.
 * Если RESEND_API_KEY не задан — mock-режим (console.log, ok: true).
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM ?? 'noreply@invest-market.ru';

  if (!apiKey) {
    console.log('[email] Mock send to:', payload.to, '| subject:', payload.subject);
    return { ok: true };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
