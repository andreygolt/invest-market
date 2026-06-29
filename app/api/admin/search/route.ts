import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  GlobalSearchResponse,
  SearchApplicationResult,
  SearchInvestorResult,
  SearchProjectResult,
} from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin'];
const MAX_RESULTS = 10;

type ProjectRow = {
  id: string;
  name: string;
  category: string;
  status: string;
};

type InvestorRow = {
  id: string;
  full_name: string | null;
  email: string;
  created_at: string;
};

type ProjectJoin = { name?: string } | { name?: string }[] | null;
type ProfileJoin = { email?: string } | { email?: string }[] | null;

type ApplicationRow = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  status: string;
  projects?: ProjectJoin;
  profiles?: ProfileJoin;
};

type QueryResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

function getProjectName(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? null;
}

function getInvestorEmail(profiles: ProfileJoin) {
  return (Array.isArray(profiles) ? profiles[0]?.email : profiles?.email) ?? '';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    const empty: GlobalSearchResponse = {
      query: q,
      projects: [],
      investors: [],
      applications: [],
    };
    return NextResponse.json(empty);
  }

  const pattern = `%${q}%`;
  const admin = createAdminClient();

  const [projRes, invRes, appRes] = (await Promise.all([
    admin
      .from('projects')
      .select('id, name, category, status')
      .or(`name.ilike.${pattern},category.ilike.${pattern}`)
      .limit(MAX_RESULTS),
    admin
      .from('profiles')
      .select('id, full_name, email, created_at')
      .eq('role', 'investor')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(MAX_RESULTS),
    admin
      .from('investor_applications')
      .select('id, project_id, investor_id, amount, status, projects(name), profiles(email)')
      .ilike('projects.name', pattern)
      .limit(MAX_RESULTS),
  ])) as [
    QueryResult<ProjectRow>,
    QueryResult<InvestorRow>,
    QueryResult<ApplicationRow>,
  ];

  const firstError = projRes.error ?? invRes.error ?? appRes.error;
  if (firstError) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }

  const projects: SearchProjectResult[] = (projRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    status: p.status,
  }));

  const investors: SearchInvestorResult[] = (invRes.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    created_at: p.created_at,
  }));

  const applications: SearchApplicationResult[] = (appRes.data ?? [])
    .filter((a) => getProjectName(a.projects ?? null))
    .map((a) => ({
      id: a.id,
      project_id: a.project_id,
      project_name: getProjectName(a.projects ?? null) ?? '',
      investor_id: a.investor_id,
      investor_email: getInvestorEmail(a.profiles ?? null),
      amount: a.amount,
      status: a.status,
    }));

  const response: GlobalSearchResponse = { query: q, projects, investors, applications };
  return NextResponse.json(response);
}
