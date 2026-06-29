import { NextRequest, NextResponse } from 'next/server';
import { notifyUserAccountChange } from '@/lib/notifications/notify-user-account-change';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserProfile, UserProfileUpdate, UserRole } from '@/types';
import { requireUsersAdmin } from '../route';

type RouteContext = {
  params: Promise<{ id: string }>;
};

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

function validateUserUpdate(value: unknown): UserProfileUpdate | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as { role?: unknown; is_active?: unknown };
  const update: UserProfileUpdate = {};

  if (body.role !== undefined) {
    if (!isUserRole(body.role)) return null;
    update.role = body.role;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return null;
    update.is_active = body.is_active;
  }

  return update;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireUsersAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .select('id, email, role, full_name, is_active, created_at')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as UserProfile);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireUsersAdmin();
  if (auth.error) return auth.error;

  const { id } = await context.params;
  if (id === auth.user.id) {
    return NextResponse.json({ error: 'Cannot update own account' }, { status: 400 });
  }

  const update = validateUserUpdate((await request.json()) as unknown);
  if (!update) {
    return NextResponse.json({ error: 'Invalid user update' }, { status: 400 });
  }

  if (update.role === 'superadmin' && auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Only superadmin can assign superadmin role' }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', id)
    .select('id, email, role, full_name, is_active, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void notifyUserAccountChange({
    userId: id,
    newRole: update.role,
    newIsActive: update.is_active,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json(data as UserProfile);
}
