import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { DocumentType, InvestorDocumentItem, ProjectStatus } from '@/types';

type ProjectAccessRow = {
  id: string;
  status: ProjectStatus;
};

type ProjectDocumentRow = {
  id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
};

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

  const adminSupabase = createAdminClient();
  const { data: project } = await adminSupabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .maybeSingle<ProjectAccessRow>();

  if (!project || project.status !== 'approved') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: docs } = await adminSupabase
    .from('project_documents')
    .select('id, document_type, file_name, file_path, file_size, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });

  const items: InvestorDocumentItem[] = [];
  for (const doc of (docs ?? []) as ProjectDocumentRow[]) {
    const { data: urlData } = await adminSupabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 3600);

    if (urlData?.signedUrl) {
      items.push({
        id: doc.id,
        document_type: doc.document_type as DocumentType,
        file_name: doc.file_name,
        file_size: doc.file_size,
        created_at: doc.created_at,
        download_url: urlData.signedUrl,
      });
    }
  }

  return NextResponse.json(items);
}
