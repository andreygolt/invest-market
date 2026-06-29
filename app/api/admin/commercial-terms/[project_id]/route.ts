import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CommercialTermsRow } from '@/types';

function isAdminRole(role: string | null | undefined) {
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ project_id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const { project_id } = await params;
  const { data, error } = await supabase
    .from('commercial_terms')
    .select('id, project_id, success_fee_pct, fixed_fee, notes, created_by, created_at, updated_at')
    .eq('project_id', project_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ? (data as CommercialTermsRow) : { terms: null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ project_id: string }> }
) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const { project_id } = await params;
  const { error } = await supabase
    .from('commercial_terms')
    .delete()
    .eq('project_id', project_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
