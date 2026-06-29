import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { writeAuditLog } from '@/lib/audit/log';
import { dispatchNotificationEmail } from '@/lib/email/dispatch';
import type { BroadcastRequest, BroadcastResult, BroadcastTargetRole, UserRole } from '@/types';

const VALID_ROLES: BroadcastTargetRole[] = [
  'all',
  'investor',
  'project',
  'manager',
  'moderator',
  'admin',
  'superadmin',
];

type NotificationInsertResult = {
  data?: { id?: string | null }[] | null;
  error: { message: string } | null;
};

type NotificationInsertQuery = PromiseLike<NotificationInsertResult> & {
  select?: (columns: string) => PromiseLike<NotificationInsertResult>;
};

function isBroadcastTargetRole(value: unknown): value is BroadcastTargetRole {
  return typeof value === 'string' && VALID_ROLES.includes(value as BroadcastTargetRole);
}

function isBroadcastAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isBroadcastAdmin(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await req.json()) as BroadcastRequest;
  const title = body.title?.trim();
  const message = body.body?.trim();

  if (!title || !message) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
  }

  if (title.length > 120) {
    return NextResponse.json({ error: 'title too long (max 120)' }, { status: 400 });
  }

  if (message.length > 1000) {
    return NextResponse.json({ error: 'body too long (max 1000)' }, { status: 400 });
  }

  if (!isBroadcastTargetRole(body.target_role)) {
    return NextResponse.json({ error: 'Invalid target_role' }, { status: 400 });
  }

  const admin = createAdminClient();
  let usersQuery = admin.from('users').select('id');

  if (body.target_role !== 'all') {
    usersQuery = usersQuery.eq('role', body.target_role as UserRole);
  }

  const { data: users, error: usersError } = await usersQuery;

  if (usersError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }

  if (!users || users.length === 0) {
    const result: BroadcastResult = { sent: 0, target_role: body.target_role };
    return NextResponse.json(result);
  }

  const notifications = (users as { id: string }[]).map((targetUser) => ({
    user_id: targetUser.id,
    type: 'announcement' as const,
    title,
    body: message,
    link: body.link?.trim() || null,
    is_read: false,
  }));

  const insertQuery = admin.from('notifications').insert(notifications) as NotificationInsertQuery;
  const { data, error: insertError } = await (typeof insertQuery.select === 'function'
    ? insertQuery.select('id')
    : insertQuery);

  if (insertError) {
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 });
  }

  for (const notif of data ?? []) {
    if (notif.id) dispatchNotificationEmail(notif.id as string);
  }

  void writeAuditLog({
    actor_id: user.id,
    actor_email: user.email,
    action: 'broadcast_sent',
    entity_type: 'notification',
    meta: { target_role: body.target_role, title, recipient_count: users.length },
  });

  const result: BroadcastResult = { sent: notifications.length, target_role: body.target_role };
  return NextResponse.json(result);
}
