import Link from 'next/link';

import { Disclaimer } from '@/components/disclaimer';
import { MobileNav, type MobileNavItem } from '@/components/mobile-nav';
import { NavLink } from '@/components/nav-link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

const INVESTOR_NAV_ITEMS: MobileNavItem[] = [
  { href: '/dashboard', label: 'Главная', exact: true },
  { href: '/catalog', label: 'Каталог' },
  { href: '/portfolio', label: 'Портфель' },
  { href: '/favorites', label: 'Избранное' },
  { href: '/applications', label: 'Заявки' },
  { href: '/referral', label: 'Партнёрская программа' },
  { href: '/notifications', label: 'Уведомления' },
  { href: '/profile', label: 'Профиль' },
];

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <Link href="/dashboard" className="font-semibold text-slate-900 shrink-0 hover:text-slate-700 transition-colors">
            Invest Market
          </Link>
          <nav className="hidden md:flex gap-4 text-sm flex-wrap">
            <NavLink
              href="/dashboard"
              exact
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Главная
            </NavLink>
            <NavLink
              href="/catalog"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Каталог
            </NavLink>
            <NavLink
              href="/portfolio"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Портфель
            </NavLink>
            <NavLink
              href="/favorites"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Избранное
            </NavLink>
            <NavLink
              href="/applications"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Заявки
            </NavLink>
            <NavLink
              href="/referral"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Партнёрская программа
            </NavLink>
            <NavLink
              href="/notifications"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Уведомления
            </NavLink>
            <NavLink
              href="/profile"
              className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              activeClassName="!text-slate-900 font-medium"
            >
              Профиль
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {userId && <NotificationBell initialUnread={unread} userId={userId} />}
            <MobileNav items={INVESTOR_NAV_ITEMS} />
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
