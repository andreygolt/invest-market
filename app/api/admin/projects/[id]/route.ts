import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: projectId } = await params;

  const [projectResult, questionnaireResult, aiReportResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, created_at, updated_at, moderated_by, moderated_at, rejection_reason, owner_id')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_questionnaire')
      .select('section, answers')
      .eq('project_id', projectId)
      .order('section'),
    supabase
      .from('ai_reports')
      .select('id, status, report, updated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  if (projectResult.error || !projectResult.data) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  return NextResponse.json({
    project: projectResult.data,
    questionnaire: questionnaireResult.data ?? [],
    ai_report: aiReportResult.data ?? null,
  });
}
