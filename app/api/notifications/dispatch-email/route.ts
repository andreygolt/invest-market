import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/send';
import { notificationEmailTemplate } from '@/lib/email/templates';
import { isEmailEnabled } from '@/lib/email/preferences';

/**
 * POST /api/notifications/dispatch-email
 * Body: { notification_id: string }
 * Защищён заголовком x-internal-secret.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { notification_id?: string };
  try {
    body = (await request.json()) as { notification_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { notification_id } = body;
  if (!notification_id) {
    return NextResponse.json({ error: 'notification_id required' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: notification, error: notifError } = await admin
    .from('notifications')
    .select('id, title, body, user_id, email_sent')
    .eq('id', notification_id)
    .single();

  if (notifError || !notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
  }

  if (notification.email_sent) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', notification.user_id)
    .single();

  if (!profile?.email) {
    return NextResponse.json({ error: 'User email not found' }, { status: 404 });
  }

  const emailEnabled = await isEmailEnabled(notification.user_id as string);
  if (!emailEnabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'email_disabled' });
  }

  const html = notificationEmailTemplate({
    recipientName: profile.full_name ?? 'Пользователь',
    subject: notification.title,
    message: notification.body,
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/notifications`,
    ctaLabel: 'Перейти к уведомлениям',
  });

  const result = await sendEmail({
    to: profile.email,
    subject: notification.title,
    html,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  await admin
    .from('notifications')
    .update({ email_sent: true, email_sent_at: new Date().toISOString() })
    .eq('id', notification_id);

  return NextResponse.json({ ok: true });
}
