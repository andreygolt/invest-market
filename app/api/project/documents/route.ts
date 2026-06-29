import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ documents: [] });

  const { data: documents } = await supabase
    .from('project_documents')
    .select('*')
    .eq('project_id', project.id)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({ documents: documents ?? [] });
}
