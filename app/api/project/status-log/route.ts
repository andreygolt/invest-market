import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const staffRoles = ['admin', 'superadmin', 'moderator', 'manager'];
  const isStaff = staffRoles.includes(profile.role);
  const isProject = profile.role === 'project';

  if (!isProject && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let projectId: string | null = null;
  if (isProject) {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!project) return NextResponse.json({ log: [] });
    projectId = project.id;
  }

  if (!projectId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await admin
    .from('project_status_log')
    .select('id, project_id, old_status:from_status, new_status:to_status, changed_at, changed_by')
    .eq('project_id', projectId)
    .order('changed_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ log: data ?? [] });
}
