import { createClient } from '@/lib/supabase/server';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getUnreadCount } from '@/lib/notifications/get-unread-count';
import Link from 'next/link';
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
      <nav className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">
          {navItems.filter(item => item.show).map(item => (
            <Link key={item.href} href={item.href} className="font-medium text-gray-900 hover:underline">
              {item.label}
            </Link>
          ))}
          <div className="ml-auto">
            <NotificationBell initialUnread={unread} userId={user.id} />
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
