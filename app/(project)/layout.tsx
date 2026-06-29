import { createClient } from '@/lib/supabase/server';
import { MobileNav } from '@/components/mobile-nav';
import { NavLink } from '@/components/nav-link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getUnreadCount } from '@/lib/notifications/get-unread-count';
import { redirect } from 'next/navigation';

export default async function ProjectLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'project') redirect('/dashboard');

  const { data: project } = await supabase
    .from('projects')
    .select('status')
    .eq('owner_id', user.id)
    .maybeSingle();

  const navItems = [
    { href: '/dashboard', label: 'Главная', show: true },
    { href: '/project', label: 'Мой проект', show: true },
    { href: '/questionnaire', label: 'Анкета', show: true },
    { href: '/documents', label: 'Документы', show: true },
    { href: '/submit', label: 'Отправить', show: true },
    { href: '/updates', label: 'Обновления', show: true },
    { href: '/commercial-terms', label: 'Условия', show: project?.status === 'approved' },
    { href: '/profile', label: 'Профиль', show: true },
  ];
  const unread = await getUnreadCount();

  return (
    <>
      <nav className="bg-white border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
          <div className="hidden md:flex items-center gap-4 flex-1">
            {navItems.filter(item => item.show).map(item => (
              <NavLink
                key={item.href}
                href={item.href}
                exact
                className="font-medium text-slate-600 hover:text-slate-900 transition-colors"
                activeClassName="!text-slate-900 underline underline-offset-4"
              >
                {item.label}
              </NavLink>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell initialUnread={unread} userId={user.id} />
            <MobileNav
              items={navItems
                .filter((item) => item.show)
                .map((item) => ({ href: item.href, label: item.label, exact: true as const }))}
            />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
