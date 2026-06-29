import { NextRequest, NextResponse } from 'next/server';
import { runAnalysisPipeline } from '@/lib/ai/analyze';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { AdminAIReportResponse, AdminReportDocument, AIReportRow, UserRole } from '@/types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ProjectDocumentRow = {
  id: string;
  filename: string;
  doc_type: string;
};

type DocumentExtractionRow = {
  document_id: string;
  status: string;
};

function canReadReport(role: UserRole | null | undefined) {
  return role === 'admin' || role === 'superadmin' || role === 'moderator';
}

function canRerunReport(role: UserRole | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

async function getUserRole() {
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

  return { role: profile?.role as UserRole | null };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await getUserRole();
  if (auth.error) return auth.error;
  if (!canReadReport(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: projectId } = await context.params;
  const supabase = createAdminClient();

  const [reportResult, documentsResult, extractionsResult] = await Promise.all([
    supabase
      .from('ai_reports')
      .select('id, project_id, report, status, created_at, updated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('project_documents')
      .select('id, filename, doc_type')
      .eq('project_id', projectId),
    supabase
      .from('document_extractions')
      .select('document_id, status')
      .eq('project_id', projectId),
  ]);

  if (reportResult.error) {
    return NextResponse.json({ error: reportResult.error.message }, { status: 500 });
  }
  if (documentsResult.error) {
    return NextResponse.json({ error: documentsResult.error.message }, { status: 500 });
  }
  if (extractionsResult.error) {
    return NextResponse.json({ error: extractionsResult.error.message }, { status: 500 });
  }

  const extractionStatusByDocument = new Map(
    ((extractionsResult.data ?? []) as DocumentExtractionRow[]).map((extraction) => [
      extraction.document_id,
      extraction.status,
    ])
  );

  const documents: AdminReportDocument[] = ((documentsResult.data ?? []) as ProjectDocumentRow[]).map(
    (document) => ({
      id: document.id,
      file_name: document.filename,
      document_type: document.doc_type,
      extraction_status: extractionStatusByDocument.get(document.id) ?? null,
    })
  );

  const response: AdminAIReportResponse = {
    report: (reportResult.data as AIReportRow | null) ?? null,
    documents,
  };

  return NextResponse.json(response);
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const auth = await getUserRole();
  if (auth.error) return auth.error;
  if (!canRerunReport(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: projectId } = await context.params;
  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  void runAnalysisPipeline(projectId).catch((err) => {
    console.error('[Admin AI Report] rerun error:', err);
  });

  return NextResponse.json({ message: 'AI-анализ запущен' }, { status: 202 });
}
