import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { UserProfile, UserRole } from '@/types';

type AdminRole = 'superadmin' | 'admin';

const USER_ROLES: UserRole[] = [
  'superadmin',
  'admin',
  'moderator',
  'manager',
  'investor',
  'project',
];

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'superadmin' || role === 'admin';
}

function isUserRole(value: string | null): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

function normalizeLimit(value: string | null) {
  const limit = Number(value ?? 20);
  if (!Number.isInteger(limit) || limit < 1) return 20;
  return Math.min(limit, 100);
}

function normalizePage(value: string | null) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1) return 1;
  return page;
}

function sanitizeSearch(value: string) {
  return value.replaceAll('%', '\\%').replaceAll('_', '\\_').replaceAll(',', ' ');
}

export async function requireUsersAdmin() {
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

  if (!isAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user, role: profile.role };
}

export async function GET(request: NextRequest) {
  const auth = await requireUsersAdmin();
  if (auth.error) return auth.error;

  const page = normalizePage(request.nextUrl.searchParams.get('page'));
  const limit = normalizeLimit(request.nextUrl.searchParams.get('limit'));
  const search = request.nextUrl.searchParams.get('search')?.trim() ?? '';
  const role = request.nextUrl.searchParams.get('role');
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createAdminClient();
  let query = supabase
    .from('users')
    .select('id, email, role, full_name, is_active, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    const term = sanitizeSearch(search);
    query = query.or(`email.ilike.%${term}%,full_name.ilike.%${term}%`);
  }

  if (isUserRole(role)) {
    query = query.eq('role', role);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ users: (data ?? []) as UserProfile[], total: count ?? 0 });
}
