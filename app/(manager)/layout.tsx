import { redirect } from 'next/navigation';

import { MobileNav, type MobileNavItem } from '@/components/mobile-nav';
import { NavLink } from '@/components/nav-link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

type ManagerRole = Extract<UserRole, 'manager' | 'admin' | 'superadmin'>;

const MANAGER_ROLES: ManagerRole[] = ['manager', 'admin', 'superadmin'];

const MANAGER_NAV_ITEMS: MobileNavItem[] = [
  { href: '/manager/dashboard', label: 'Dashboard' },
  { href: '/manager/applications', label: 'Заявки' },
  { href: '/profile', label: 'Профиль' },
];

function isManagerRole(role: string | null | undefined): role is ManagerRole {
  return MANAGER_ROLES.includes(role as ManagerRole);
}

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, full_name, email')
    .eq('id', user.id)
    .single();

  if (!isManagerRole(profile?.role)) redirect('/login');

  const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-slate-900">Invest Market - Менеджер</span>
          <div className="hidden md:flex items-center gap-6">
            <NavLink
              href="/manager/dashboard"
              className="text-sm text-slate-600 hover:text-slate-900"
              activeClassName="font-medium text-slate-900"
            >
              Dashboard
            </NavLink>
            <NavLink
              href="/manager/applications"
              className="text-sm text-slate-600 hover:text-slate-900"
              activeClassName="font-medium text-slate-900"
            >
              Заявки
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {userId && <NotificationBell initialUnread={unread} userId={userId} />}
          <NavLink
            href="/profile"
            className="hidden md:inline text-sm text-slate-600 hover:text-slate-900"
            activeClassName="font-medium text-slate-900"
          >
            Профиль
          </NavLink>
          <MobileNav items={MANAGER_NAV_ITEMS} />
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
