import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { UserProfile } from '@/types';
import { ProfileClient } from './profile-client';

const BACK_LINKS: Record<string, string> = {
  investor: '/dashboard',
  project: '/project',
  manager: '/manager/dashboard',
  admin: '/admin/dashboard',
  superadmin: '/admin/dashboard',
  moderator: '/admin/dashboard',
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active, created_at')
    .eq('id', user.id)
    .single();

  if (!data) redirect('/login');

  const profile: UserProfile = {
    ...(data as Omit<UserProfile, 'email'>),
    email: user.email ?? '',
  };

  const backHref = BACK_LINKS[profile.role] ?? '/dashboard';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href={backHref}
            className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            ← Назад
          </Link>
          <span className="font-semibold text-slate-900">Профиль</span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Настройки профиля</h1>
          <ProfileClient profile={profile} />
        </div>
      </main>
    </div>
  );
}
