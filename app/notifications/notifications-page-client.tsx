'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { NotificationRow, NotificationsResponse } from '@/types';

export default function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number, unread: boolean) => {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(p),
      per_page: '20',
      ...(unread ? { unread_only: 'true' } : {}),
    });
    const res = await fetch(`/api/notifications?${params.toString()}`);
    if (res.ok) {
      const data = (await res.json()) as NotificationsResponse;
      setNotifications(data.notifications);
      setTotalPages(data.total_pages);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load(page, unreadOnly);
    });
  }, [page, unreadOnly, load]);

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    void load(page, unreadOnly);
  }

  async function markAllAsRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    void load(page, unreadOnly);
  }

  function toggleUnreadOnly() {
    setUnreadOnly((prev) => !prev);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant={unreadOnly ? 'outline' : 'default'}
            size="sm"
            onClick={() => {
              if (unreadOnly) {
                toggleUnreadOnly();
              }
            }}
          >
            Все
          </Button>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              if (!unreadOnly) {
                toggleUnreadOnly();
              }
            }}
          >
            Непрочитанные
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllAsRead()}>
          Прочитать все
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Загрузка...</div>
      ) : notifications.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Нет уведомлений</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const card = (
              <div
                className={`rounded-md border bg-white p-4 ${
                  notification.is_read ? '' : 'border-l-4 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div
                      className={`text-sm ${
                        notification.is_read ? 'font-medium' : 'font-semibold'
                      }`}
                    >
                      {notification.title}
                    </div>
                    <div className="text-sm leading-5 text-gray-600">{notification.body}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(notification.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  {!notification.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void markAsRead(notification.id);
                      }}
                    >
                      x
                    </Button>
                  )}
                </div>
              </div>
            );

            return notification.link ? (
              <Link key={notification.id} href={notification.link} className="block">
                {card}
              </Link>
            ) : (
              <div key={notification.id}>{card}</div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((currentPage) => currentPage - 1)}
          >
            ← Назад
          </Button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((currentPage) => currentPage + 1)}
          >
            Вперёд →
          </Button>
        </div>
      )}
    </div>
  );
}
