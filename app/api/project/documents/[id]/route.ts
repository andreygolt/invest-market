import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fetch doc and verify ownership via RLS
  const { data: doc } = await supabase
    .from('project_documents')
    .select('storage_path, project_id')
    .eq('id', id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Remove from storage
  await supabase.storage.from('project-docs').remove([doc.storage_path]);

  // Remove from DB (RLS enforces ownership)
  const { error } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
