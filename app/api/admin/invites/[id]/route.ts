import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type AdminRole = 'superadmin' | 'admin';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'superadmin' || role === 'admin';
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

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const { id } = await context.params;
  const { data, error } = await supabase
    .from('invites')
    .select('used_by')
    .eq('id', id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data?.used_by) {
    return NextResponse.json({ error: 'invite already used' }, { status: 400 });
  }

  const { error: deleteError } = await supabase.from('invites').delete().eq('id', id);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
