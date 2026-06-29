import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Invite, InviteInsert } from '@/types';

type AdminRole = 'superadmin' | 'admin';

const INVITE_ROLES = ['investor', 'project', 'moderator', 'manager'] as const;
type AdminInviteRole = (typeof INVITE_ROLES)[number];

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'superadmin' || role === 'admin';
}

function isInviteRole(value: unknown): value is AdminInviteRole {
  return typeof value === 'string' && INVITE_ROLES.includes(value as AdminInviteRole);
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

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
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

  return { user };
}

export function validateInviteInsert(value: unknown): value is InviteInsert {
  if (!value || typeof value !== 'object') return false;
  const body = value as { role?: unknown };
  return isInviteRole(body.role);
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
}

function createInviteCode() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

function getExpiresAt(expiresInDays: unknown) {
  if (expiresInDays === undefined || expiresInDays === null) return null;
  if (typeof expiresInDays !== 'number' || !Number.isInteger(expiresInDays)) return undefined;
  if (expiresInDays <= 0) return undefined;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);
  return expiresAt.toISOString();
}

function getAdminClient(fallback: Awaited<ReturnType<typeof createClient>>) {
  try {
    return createAdminClient();
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const page = normalizePage(request.nextUrl.searchParams.get('page'));
  const limit = normalizeLimit(request.nextUrl.searchParams.get('limit') ?? '50');
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const admin = getAdminClient(supabase);

  const { data, error, count } = await admin
    .from('invites')
    .select('id, code, role, email, used_by, used_at, created_by, created_at, expires_at, note', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ invites: (data ?? []) as Invite[], total: count ?? 0 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const body = (await request.json()) as unknown;
  if (!validateInviteInsert(body)) {
    return NextResponse.json({ error: 'Invalid invite' }, { status: 400 });
  }

  const expiresAt = getExpiresAt((body as { expiresInDays?: unknown }).expiresInDays);
  if (expiresAt === undefined) {
    return NextResponse.json({ error: 'Invalid expiresInDays' }, { status: 400 });
  }

  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null;
  const payload = {
    code: createInviteCode(),
    role: body.role,
    email,
    expires_at: expiresAt,
    created_by: auth.user.id,
  };

  const admin = getAdminClient(supabase);
  const { data, error } = await admin
    .from('invites')
    .insert(payload)
    .select('id, code, role, email, used_by, used_at, created_by, created_at, expires_at, note')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  void writeAuditLog({
    actor_id: auth.user.id,
    actor_email: auth.user.email,
    action: 'invite_created',
    entity_type: 'invite',
    entity_id: data?.id,
    meta: { role: body.role, email },
  });

  return NextResponse.json(
    {
      ...(data as Invite),
      code: data.code,
      url: `${getAppUrl()}/invite/${data.code}`,
    },
    { status: 201 }
  );
}
