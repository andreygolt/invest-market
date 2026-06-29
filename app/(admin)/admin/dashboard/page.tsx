import { redirect } from 'next/navigation';
import { getAdminStats } from '@/lib/admin/stats';
import { createClient } from '@/lib/supabase/server';
import { AdminDashboardClient } from './admin-dashboard-client';

export const dynamic = 'force-dynamic';

function isDashboardAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

export default async function AdminDashboardPage() {
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

  if (!isDashboardAdmin(profile?.role)) redirect('/login');

  const stats = await getAdminStats(supabase);

  return <AdminDashboardClient stats={stats} />;
}
