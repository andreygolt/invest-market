import Link from 'next/link';

import { Disclaimer } from '@/components/disclaimer';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold text-slate-900">Invest Market</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/catalog" className="text-slate-600 hover:text-slate-900 transition-colors">
              Каталог
            </Link>
            <Link href="/referral" className="text-slate-600 hover:text-slate-900 transition-colors">
              Партнёрская программа
            </Link>
            <Link href="/profile" className="text-slate-600 hover:text-slate-900 transition-colors">
              Профиль
            </Link>
          </nav>
          <div className="ml-auto">
            {userId && <NotificationBell initialUnread={unread} userId={userId} />}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-slate-200 bg-white mt-auto py-4">
        <div className="container mx-auto px-4">
          <Disclaimer variant="compact" />
        </div>
      </footer>
    </div>
  );
}
