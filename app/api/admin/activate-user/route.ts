import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types';

const USER_ROLES: UserRole[] = [
  'superadmin',
  'admin',
  'moderator',
  'manager',
  'investor',
  'project',
];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

function isAdminRole(role: string | null | undefined) {
  return role === 'superadmin' || role === 'admin';
}

function validateBody(value: unknown) {
  if (!value || typeof value !== 'object') return null;

  const body = value as {
    userId?: unknown;
    email?: unknown;
    fullName?: unknown;
    role?: unknown;
  };

  if (
    typeof body.userId !== 'string' ||
    typeof body.email !== 'string' ||
    typeof body.fullName !== 'string' ||
    !isUserRole(body.role)
  ) {
    return null;
  }

  return {
    userId: body.userId,
    email: body.email,
    fullName: body.fullName,
    role: body.role,
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createAdminClient();
  const { data: profile, error: profileError } = await adminSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!isAdminRole(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = validateBody((await request.json()) as unknown);
  if (!body) {
    return NextResponse.json({ error: 'Invalid activation payload' }, { status: 400 });
  }

  const { error } = await adminSupabase.from('users').insert({
    id: body.userId,
    email: body.email,
    full_name: body.fullName,
    role: body.role,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
