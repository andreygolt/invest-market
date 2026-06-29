import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { AdminApplicationItem, UserRole } from '@/types';
import { ApplicationsClient } from './applications-client';

export const dynamic = 'force-dynamic';

type ApplicationAdminRole = Extract<UserRole, 'superadmin' | 'admin' | 'moderator' | 'manager'>;

const APPLICATION_ADMIN_ROLES: ApplicationAdminRole[] = [
  'superadmin',
  'admin',
  'moderator',
  'manager',
];

type ProjectJoin = { name: string | null } | { name: string | null }[] | null;
type UserJoin = { email: string | null } | { email: string | null }[] | null;
type ApplicationRow = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  instrument: string | null;
  status: string;
  message: string | null;
  rejection_reason: string | null;
  created_at: string;
  projects: ProjectJoin;
  users: UserJoin;
};
type AdminApplicationRow = ApplicationRow & { status: AdminApplicationItem['status'] };

function isApplicationAdminRole(role: string | null | undefined): role is ApplicationAdminRole {
  return APPLICATION_ADMIN_ROLES.includes(role as ApplicationAdminRole);
}

function isAdminApplicationStatus(value: string): value is AdminApplicationItem['status'] {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'cancelled';
}

function isAdminApplicationRow(row: ApplicationRow): row is AdminApplicationRow {
  return isAdminApplicationStatus(row.status);
}

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? null;
}

function getInvestorEmail(users: UserJoin) {
  return (Array.isArray(users) ? users[0]?.email : users?.email) ?? null;
}

async function getApplications(): Promise<AdminApplicationItem[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, instrument, status, message, rejection_reason, created_at, projects(name), users(email)'
    )
    .order('created_at', { ascending: false });

  return ((data ?? []) as ApplicationRow[])
    .filter(isAdminApplicationRow)
    .map((row) => ({
      id: row.id,
      project_id: row.project_id,
      project_name: getProjectName(row.projects),
      investor_id: row.investor_id,
      investor_email: getInvestorEmail(row.users),
      amount: row.amount,
      instrument: row.instrument,
      comment: row.message,
      status: row.status,
      rejection_reason: row.rejection_reason,
      created_at: row.created_at,
    }));
}

export default async function ApplicationsPage() {
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

  if (!isApplicationAdminRole(profile?.role)) redirect('/login');

  const applications = await getApplications();

  return <ApplicationsClient applications={applications} />;
}
