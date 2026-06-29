import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { NotificationRow } from '@/types';
import { MarkAllReadButton } from './mark-all-read';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, is_read, created_at')
    .eq('user_id', user.id)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(20);

  const notifications = (data ?? []) as NotificationRow[];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Уведомления</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">{unreadCount} непрочитанных</p>
          )}
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500">Уведомлений нет</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {notifications.map((n) => (
            <div key={n.id} className={`p-4 ${n.is_read ? '' : 'bg-slate-50'}`}>
              <div className="flex items-start gap-3">
                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
                <div className={n.is_read ? 'pl-5' : ''}>
                  <div className="text-sm font-medium text-slate-900">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                  {n.link && (
                    <Link
                      href={n.link}
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      Перейти →
                    </Link>
                  )}
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(n.created_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
