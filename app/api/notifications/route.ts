import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { NotificationRow } from '@/types';

type NotificationsQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type RangeNotificationsQuery = {
  range: (from: number, to: number) => PromiseLike<NotificationsQueryResult>;
};

type LimitNotificationsQuery = {
  limit: (count: number) => PromiseLike<NotificationsQueryResult>;
};

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get('unread_only') === 'true';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const perPage = Math.min(
    50,
    Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20)
  );
  const offset = (page - 1) * perPage;

  let query = supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, is_read, created_at')
    .eq('user_id', user.id);

  if (unreadOnly) {
    query = query.eq('is_read', false);
  }

  const orderedQuery = query
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false });

  const { data, error } =
    'range' in orderedQuery
      ? await (orderedQuery as RangeNotificationsQuery).range(offset, offset + perPage - 1)
      : await (orderedQuery as LimitNotificationsQuery).limit(perPage);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const notifications = (data ?? []) as NotificationRow[];

  const { count: totalUnread } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false);

  const exactUnreadCount = typeof totalUnread === 'number' ? totalUnread : null;

  let countQuery = supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (unreadOnly) {
    countQuery = countQuery.eq('is_read', false);
  }

  const { count: totalCount } = await countQuery;
  const exactTotal = typeof totalCount === 'number' ? totalCount : null;
  const unreadCount =
    exactUnreadCount ?? notifications.filter((notification) => !notification.is_read).length;
  const total = exactTotal ?? notifications.length;
  const totalPages = Math.ceil(total / perPage);

  return NextResponse.json({
    notifications,
    unread_count: unreadCount,
    total_count: total,
    page,
    per_page: perPage,
    total_pages: totalPages,
  });
}
