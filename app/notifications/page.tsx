import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

import NotificationsPageClient from './notifications-page-client';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="mb-6 text-3xl font-bold text-white">Уведомления</h1>
        <NotificationsPageClient />
      </div>
    </div>
  );
}
