import { notFound, redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ApplicationStatus, UserProfile } from '@/types';
import UserDetailClient from './user-detail-client';

const ALLOWED_ROLES = ['admin', 'superadmin'];

interface PageProps {
  params: Promise<{ id: string }>;
}

export interface UserApplication {
  id: string;
  project_id: string;
  project_name: string;
  amount: number | null;
  status: ApplicationStatus;
  created_at: string;
}

export interface UserPortfolioEntry {
  id: string;
  project_id: string;
  project_name: string;
  amount: number;
  created_at: string;
}

type ProjectJoin = { name?: string } | { name?: string }[] | null;

type ApplicationRow = {
  id: string;
  project_id: string;
  amount: number | null;
  status: string;
  created_at: string;
  projects: ProjectJoin;
};

type PortfolioRow = {
  id: string;
  project_id: string;
  amount_invested: number;
  created_at: string;
  projects: ProjectJoin;
};

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '-';
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params;

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

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    redirect('/');
  }

  const actorRole = profile.role as string;
  const admin = createAdminClient();

  const { data: targetProfile, error: profileError } = await admin
    .from('users')
    .select('id, full_name, email, role, is_active, created_at')
    .eq('id', id)
    .single();

  if (profileError || !targetProfile) {
    notFound();
  }

  const userProfile = targetProfile as UserProfile;
  let applications: UserApplication[] = [];
  let portfolioEntries: UserPortfolioEntry[] = [];

  if (userProfile.role === 'investor') {
    const [appsResult, portResult] = await Promise.all([
      admin
        .from('investor_applications')
        .select('id, project_id, amount, status, created_at, projects(name)')
        .eq('investor_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('investor_portfolio')
        .select('id, project_id, amount_invested, created_at, projects(name)')
        .eq('investor_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    applications = ((appsResult.data ?? []) as ApplicationRow[]).map((application) => ({
      id: application.id,
      project_id: application.project_id,
      project_name: getProjectName(application.projects),
      amount: application.amount,
      status: application.status as ApplicationStatus,
      created_at: application.created_at,
    }));

    portfolioEntries = ((portResult.data ?? []) as PortfolioRow[]).map((entry) => ({
      id: entry.id,
      project_id: entry.project_id,
      project_name: getProjectName(entry.projects),
      amount: entry.amount_invested,
      created_at: entry.created_at,
    }));
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Профиль пользователя</h1>
      <UserDetailClient
        user={userProfile}
        actorRole={actorRole}
        applications={applications}
        portfolioEntries={portfolioEntries}
      />
    </div>
  );
}
