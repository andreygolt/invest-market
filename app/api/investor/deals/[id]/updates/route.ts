import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProjectUpdate } from '@/types';

const ALLOWED_ROLES = ['investor', 'admin', 'superadmin', 'moderator'] as const;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });
  if (!ALLOWED_ROLES.includes(profile?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('project_updates')
    .select('id, project_id, title, body, ai_summary, created_at, updated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json((data ?? []) as ProjectUpdate[]);
}
