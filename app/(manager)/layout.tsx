import Link from 'next/link';
import { redirect } from 'next/navigation';

import { NotificationsBell } from '@/components/notifications-bell';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

type ManagerRole = Extract<UserRole, 'manager' | 'admin' | 'superadmin'>;

const MANAGER_ROLES: ManagerRole[] = ['manager', 'admin', 'superadmin'];

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

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900">Invest Market - Менеджер</span>
          <Link href="/manager/applications" className="text-sm text-gray-600 hover:text-gray-900">
            Заявки
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell />
          <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900">
            {profile.full_name ?? profile.email ?? user.email}
          </Link>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
