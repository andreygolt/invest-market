import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { AdminApplicationItem, UserRole } from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;
type UserJoin = { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
type ApplicationAdminRole = Extract<UserRole, 'superadmin' | 'admin' | 'moderator' | 'manager'>;
type ApplicationStatus = AdminApplicationItem['status'];
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
type AdminApplicationRow = ApplicationRow & { status: ApplicationStatus };

const APPLICATION_ADMIN_ROLES: ApplicationAdminRole[] = [
  'superadmin',
  'admin',
  'moderator',
  'manager',
];

function isApplicationAdminRole(role: string | null | undefined): role is ApplicationAdminRole {
  return APPLICATION_ADMIN_ROLES.includes(role as ApplicationAdminRole);
}

function isApplicationStatus(value: string | null): value is ApplicationStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'cancelled';
}

function isAdminApplicationRow(row: ApplicationRow): row is AdminApplicationRow {
  return isApplicationStatus(row.status);
}

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? null;
}

function getUser(users: UserJoin) {
  return Array.isArray(users) ? users[0] ?? null : users;
}

export async function requireApplicationsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!isApplicationAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role };
}

// GET /api/admin/applications?status=pending&project_id=xxx
// Список всех заявок для менеджера/администратора
export async function GET(request: NextRequest) {
  const auth = await requireApplicationsAdmin();
  if (auth.error) return auth.error;

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const projectFilter = searchParams.get('project_id');

  let query = supabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, instrument, status, message, rejection_reason, created_at, updated_at, projects(name), users(full_name, email)'
    )
    .order('created_at', { ascending: false });

  if (isApplicationStatus(statusFilter)) {
    query = query.eq('status', statusFilter);
  }
  if (projectFilter) {
    query = query.eq('project_id', projectFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications: AdminApplicationItem[] = ((data ?? []) as ApplicationRow[])
    .filter(isAdminApplicationRow)
    .map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    investor_id: row.investor_id,
    investor_email: getUser(row.users as UserJoin)?.email ?? null,
    amount: row.amount,
    instrument: row.instrument,
    status: row.status,
    comment: row.message,
    rejection_reason: row.rejection_reason,
    created_at: row.created_at,
  }));

  return NextResponse.json({ applications });
}
