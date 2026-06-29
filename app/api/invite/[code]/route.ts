import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InviteRole } from '@/types';

type RouteContext = {
  params: Promise<{ code: string }>;
};

type InviteCheckRow = {
  role: InviteRole;
  email: string | null;
  used_by: string | null;
  expires_at: string | null;
};

export async function GET(_request: Request, context: RouteContext) {
  const { code } = await context.params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('invites')
    .select('role,email,used_by,expires_at')
    .eq('code', code)
    .maybeSingle<InviteCheckRow>();

  if (error) {
    return NextResponse.json({ valid: false, reason: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ valid: false, reason: 'not_found' });
  }

  if (data.used_by) {
    return NextResponse.json({ valid: false, reason: 'used' });
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' });
  }

  return NextResponse.json({ valid: true, role: data.role, email: data.email });
}
