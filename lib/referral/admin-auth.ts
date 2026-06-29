import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type AdminRole = 'superadmin' | 'admin';

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'superadmin' || role === 'admin';
}

export async function requireReferralAdmin() {
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

  return { user };
}
