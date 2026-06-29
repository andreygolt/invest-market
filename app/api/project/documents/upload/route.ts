import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { DocumentType } from '@/types';

const VALID_DOC_TYPES: DocumentType[] = [
  'pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const docType = formData.get('doc_type') as string | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!docType || !VALID_DOC_TYPES.includes(docType as DocumentType)) {
    return NextResponse.json({ error: 'invalid doc_type' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'file too large (max 20MB)' }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'bin';
  const storagePath = `${project.id}/${docType}_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('project-docs')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: doc, error: dbError } = await supabase
    .from('project_documents')
    .insert({
      project_id: project.id,
      doc_type: docType,
      storage_path: storagePath,
      filename: file.name,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ document: doc }, { status: 201 });
}
