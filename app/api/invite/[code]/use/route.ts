import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteContext = {
  params: Promise<{ code: string }>;
};

type UseInviteBody = {
  userId?: unknown;
};

type UsedInviteRow = {
  id: string;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { code } = await context.params;
  const body = (await request.json()) as UseInviteBody;

  if (typeof body.userId !== 'string' || body.userId.length === 0) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('invites')
    .update({ used_by: body.userId, used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_by', null)
    .select('id')
    .maybeSingle<UsedInviteRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Invite not found or already used' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
