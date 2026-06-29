'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { NotificationRow, NotificationsResponse } from '@/types';

async function fetchNotifications(unreadOnly = false): Promise<NotificationsResponse> {
  const response = await fetch(`/api/notifications${unreadOnly ? '?unread_only=true' : ''}`);

  if (!response.ok) {
    return {
      notifications: [],
      unread_count: 0,
      total_count: 0,
      page: 1,
      per_page: 20,
      total_pages: 0,
    };
  }

  return (await response.json()) as NotificationsResponse;
}

export function NotificationsBell() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    void fetchNotifications(true).then((data) => setUnreadCount(data.unread_count));
  }, []);

  async function loadNotifications() {
    const data = await fetchNotifications();
    setNotifications(data.notifications);
    setUnreadCount(data.unread_count);
  }

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' });
    await loadNotifications();
  }

  async function markAllAsRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' });
    setUnreadCount(0);
    await loadNotifications();
  }

  function renderNotification(notification: NotificationRow) {
    const content = (
      <div
        className={`rounded-md border bg-white p-3 ${
          notification.is_read ? '' : 'border-l-2 border-blue-500'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className={`text-sm ${notification.is_read ? 'font-medium' : 'font-semibold'}`}>
              {notification.title}
            </div>
            <div className="text-xs leading-5 text-slate-600">{notification.body}</div>
            <div className="text-xs text-slate-400">
              {new Date(notification.created_at).toLocaleDateString('ru-RU')}
            </div>
          </div>
          <Button
            aria-label="Прочитать"
            className="h-7 shrink-0 px-2"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void markAsRead(notification.id);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            x
          </Button>
        </div>
      </div>
    );

    if (!notification.link) {
      return <div key={notification.id}>{content}</div>;
    }

    return (
      <Link key={notification.id} href={notification.link} className="block">
        {content}
      </Link>
    );
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Уведомления"
        className="relative inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm"
        onClick={() => void loadNotifications()}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <Badge className="ml-2 min-w-5 justify-center px-1">{unreadCount}</Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="font-semibold">Уведомления</div>
          <Button onClick={() => void markAllAsRead()} size="sm" type="button" variant="outline">
            Прочитать все
          </Button>
        </div>
        <ScrollArea className="max-h-[400px] pr-1">
          <div className="space-y-2">
            {notifications.length === 0 ? (
              <div className="py-6 text-center text-sm text-slate-500">Нет уведомлений</div>
            ) : (
              notifications.map(renderNotification)
            )}
          </div>
        </ScrollArea>
        <div className="mt-3 border-t pt-3 text-center">
          <Link href="/notifications" className="text-sm text-blue-600 hover:underline">
            Посмотреть все уведомления
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
