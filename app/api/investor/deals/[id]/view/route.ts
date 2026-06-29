import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: projectId } = await params;
  const admin = createAdminClient();

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    await admin
      .from('deal_room_views')
      .insert({ investor_id: user.id, project_id: projectId });
  } catch {
    // Tracking is fire-and-forget and must not block Deal Room loading.
  }

  return NextResponse.json({ ok: true });
}

