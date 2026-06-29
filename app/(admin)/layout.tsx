import Link from 'next/link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold">Invest Market - Панель модератора</span>
          <nav className="flex gap-4 text-sm text-gray-500">
            <Link href="/admin/search" className="hover:text-foreground">
              Поиск
            </Link>
            <Link href="/admin/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
            <Link href="/" className="hover:text-foreground">
              Дашборд
            </Link>
            <Link href="/moderation" className="hover:text-foreground">
              Модерация
            </Link>
            <Link href="/admin/referral-rewards" className="hover:text-foreground">
              Реферальные вознаграждения
            </Link>
            <Link href="/admin/notifications" className="hover:text-foreground">
              Объявления
            </Link>
            <Link href="/admin/export" className="hover:text-foreground">
              Экспорт
            </Link>
            <Link href="/admin/audit-log" className="hover:text-foreground">
              Журнал
            </Link>
            <Link href="/admin/funnel" className="hover:text-foreground">
              Воронка
            </Link>
            <Link href="/admin/investors-activity" className="hover:text-foreground">
              Инвесторы
            </Link>
            <Link href="/admin/analytics" className="hover:text-foreground">
              Аналитика
            </Link>
            <Link href="/admin/invites" className="hover:text-foreground">
              Инвайты
            </Link>
            <Link href="/users" className="hover:text-foreground">
              Пользователи
            </Link>
            <Link href="/admin/applications" className="hover:text-foreground">
              Заявки
            </Link>
            <Link href="/settings" className="hover:text-foreground">
              Настройки
            </Link>
            <Link href="/profile" className="hover:text-foreground">
              Профиль
            </Link>
          </nav>
          <div className="ml-auto">
            {userId && <NotificationBell initialUnread={unread} userId={userId} />}
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
