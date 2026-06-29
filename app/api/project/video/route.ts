import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json({ error: 'file too large (max 200MB)' }, { status: 400 });
  }
  if (!ALLOWED_VIDEO_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported format (mp4, mov only)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'mp4';
  const storagePath = `${project.id}/pitch_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('project-videos')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from('projects')
    .update({ video_path: storagePath })
    .eq('id', project.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ video_path: storagePath }, { status: 200 });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, video_path')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  if (!project.video_path) return NextResponse.json({ error: 'no video' }, { status: 404 });

  await supabase.storage.from('project-videos').remove([project.video_path]);

  await supabase
    .from('projects')
    .update({ video_path: null })
    .eq('id', project.id);

  return NextResponse.json({ ok: true });
}
