import { redirect } from 'next/navigation';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ManagerDashboardData } from '@/types';
import { ManagerDashboardClient } from './manager-dashboard-client';

export const dynamic = 'force-dynamic';

type RecentRow = {
  id: string;
  status: string;
  amount: number | null;
  instrument: string | null;
  created_at: string;
  projects: { name: string | null } | { name: string | null }[] | null;
  users: { email: string | null } | { email: string | null }[] | null;
};

function getName(p: RecentRow['projects']): string | null {
  return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null;
}

function getEmail(u: RecentRow['users']): string | null {
  return (Array.isArray(u) ? u[0]?.email : u?.email) ?? null;
}

export default async function ManagerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();

  const [
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
    { count: cancelledCount },
  ] = await Promise.all([
    adminClient
      .from('investor_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    adminClient
      .from('investor_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved'),
    adminClient
      .from('investor_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'rejected'),
    adminClient
      .from('investor_applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'cancelled'),
  ]);

  const { data: recentRows } = await adminClient
    .from('investor_applications')
    .select('id, status, amount, instrument, created_at, projects(name), users(email)')
    .order('created_at', { ascending: false })
    .limit(5);

  const recentApplications = ((recentRows ?? []) as RecentRow[]).map((r) => ({
    id: r.id,
    status: r.status,
    amount: r.amount,
    instrument: r.instrument,
    created_at: r.created_at,
    project_name: getName(r.projects),
    investor_email: getEmail(r.users),
  }));

  const dashboardData: ManagerDashboardData = {
    stats: {
      pending: pendingCount ?? 0,
      approved: approvedCount ?? 0,
      rejected: rejectedCount ?? 0,
      cancelled: cancelledCount ?? 0,
    },
    recentApplications,
  };

  return <ManagerDashboardClient data={dashboardData} />;
}
