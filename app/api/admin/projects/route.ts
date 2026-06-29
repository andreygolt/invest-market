import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, created_at, updated_at, moderated_at, rejection_reason, owner_id')
    .in('status', ['submitted', 'under_review'])
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] });
}
