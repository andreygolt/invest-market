import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import BroadcastFormClient from './broadcast-form-client';

function isNotificationsAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

export default async function AdminNotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isNotificationsAdmin(profile?.role)) redirect('/');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Отправить объявление</h1>
      <BroadcastFormClient />
    </div>
  );
}
