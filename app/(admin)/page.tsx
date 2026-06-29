import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AdminStats } from '@/types';
import { AdminDashboardClient } from './admin-dashboard-client';

export const dynamic = 'force-dynamic';

const emptyStats: AdminStats = {
  projects: { draft: 0, submitted: 0, approved: 0, rejected: 0, total: 0 },
  users: { investor: 0, project: 0, admin: 0, moderator: 0, manager: 0, total: 0 },
  applications: { pending: 0, approved: 0, rejected: 0, total: 0 },
  portfolio: { total_records: 0 },
  invites: { total: 0, used: 0, unused: 0 },
  recent_activity: [],
};

function isDashboardAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

async function getBaseUrl() {
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getStats(): Promise<AdminStats> {
  const cookieStore = await cookies();
  const response = await fetch(`${await getBaseUrl()}/api/admin/stats`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return emptyStats;
  return (await response.json()) as AdminStats;
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

  const stats = await getStats();

  return <AdminDashboardClient stats={stats} />;
}
