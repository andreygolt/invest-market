import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAnalysisPipeline } from '@/lib/ai/analyze';

// Вызывается внутренне (из extract pipeline) или вручную модератором.
export async function POST(request: NextRequest) {
  const body = (await request.json()) as { project_id?: string };
  const projectId = body.project_id;

  if (!projectId) {
    return NextResponse.json({ error: 'project_id required' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: project, error } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .maybeSingle();

  if (error || !project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const allowedStatuses = ['submitted', 'under_review'];
  if (!allowedStatuses.includes(project.status as string)) {
    return NextResponse.json({ error: 'project must be submitted first' }, { status: 400 });
  }

  runAnalysisPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Analyze] pipeline error:', err);
  });

  return NextResponse.json({ ok: true, message: 'analysis started' });
}
