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

  // Получить инвайт чтобы узнать роль и email
  const { data: invite } = await supabase
    .from('invites')
    .select('id, role, email')
    .eq('code', code)
    .is('used_by', null)
    .maybeSingle<{ id: string; role: string; email: string | null }>();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found or already used' }, { status: 400 });
  }

  // Получить email из auth.users если не задан в инвайте
  const { data: authUser } = await supabase.auth.admin.getUserById(body.userId);
  const email = invite.email ?? authUser?.user?.email ?? '';

  // Создать запись в public.users (требуется до обновления invites из-за FK)
  const { error: userError } = await supabase
    .from('users')
    .upsert({ id: body.userId, email, role: invite.role }, { onConflict: 'id' });

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  // Пометить инвайт использованным
  const { data, error } = await supabase
    .from('invites')
    .update({ used_by: body.userId, used_at: new Date().toISOString() })
    .eq('code', code)
    .select('id')
    .maybeSingle<UsedInviteRow>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: 'Failed to mark invite used' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
