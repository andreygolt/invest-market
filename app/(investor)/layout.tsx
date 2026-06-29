import Link from 'next/link';

import { Disclaimer } from '@/components/disclaimer';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold">Invest Market</span>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/catalog" className="hover:text-foreground">
              Каталог
            </Link>
            <Link href="/referral" className="hover:text-foreground">
              Партнёрская программа
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
      <footer className="border-t mt-auto py-4">
        <div className="container mx-auto px-4">
          <Disclaimer variant="compact" />
        </div>
      </footer>
    </div>
  );
}
