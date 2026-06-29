import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type {
  DealRoomProject,
  DealRoomDocument,
  QS1Answers,
  QS2Answers,
  QS3Answers,
  QS4Answers,
  QS5Answers,
  QS6Answers,
  QS7Answers,
  QS8Answers,
  AIAnalysisReport,
  DocumentType,
} from '@/types';

// GET /api/investor/deals/[id]
// Возвращает полные данные проекта для Deal Room.
// Только approved проекты; 404 если не найден или не approved.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const supabase = createAdminClient();

  // Получаем проект
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, name, status, video_path, created_at')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Получаем анкету, AI-отчёт, документы параллельно
  const [questionnaireResult, aiResult, documentsResult] = await Promise.all([
    supabase
      .from('project_questionnaire')
      .select('section, answers')
      .eq('project_id', projectId),
    supabase
      .from('ai_reports')
      .select('status, report')
      .eq('project_id', projectId)
      .maybeSingle(),
    supabase
      .from('project_documents')
      .select('id, doc_type, filename, storage_path')
      .eq('project_id', projectId),
  ]);

  // Индексируем секции анкеты
  const sections: Record<string, Record<string, unknown>> = {};
  for (const row of questionnaireResult.data ?? []) {
    sections[row.section] = row.answers as Record<string, unknown>;
  }

  const s1 = (sections['s1'] ?? {}) as Partial<QS1Answers>;
  const s2 = (sections['s2'] ?? {}) as Partial<QS2Answers>;
  const s3 = (sections['s3'] ?? {}) as Partial<QS3Answers>;
  const s4 = (sections['s4'] ?? {}) as Partial<QS4Answers>;
  const s5 = (sections['s5'] ?? {}) as Partial<QS5Answers>;
  const s6 = (sections['s6'] ?? {}) as Partial<QS6Answers>;
  const s7 = (sections['s7'] ?? {}) as Partial<QS7Answers>;
  const s8 = (sections['s8'] ?? {}) as Partial<QS8Answers>;

  // AI данные (только summary и score, НЕ red_flags)
  let ai_score: number | null = null;
  let ai_summary: string | null = null;
  if (aiResult.data?.status === 'done') {
    const report = aiResult.data.report as Partial<AIAnalysisReport>;
    ai_score = typeof report.ai_score === 'number' ? report.ai_score : null;
    ai_summary = report.summary ?? null;
  }

  // Signed URLs для документов (1 час)
  const documents: DealRoomDocument[] = [];
  for (const doc of documentsResult.data ?? []) {
    const { data: signedData } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.storage_path, 3600);
    documents.push({
      id: doc.id,
      doc_type: doc.doc_type as DocumentType,
      filename: doc.filename,
      signed_url: signedData?.signedUrl ?? '',
    });
  }

  // Signed URL для видео (1 час)
  let video_signed_url: string | null = null;
  if (project.video_path) {
    const { data: videoData } = await supabase.storage
      .from('videos')
      .createSignedUrl(project.video_path, 3600);
    video_signed_url = videoData?.signedUrl ?? null;
  }

  const dealRoom: DealRoomProject = {
    id: project.id,
    name: project.name,
    created_at: project.created_at,
    video_signed_url,
    description: s1.description ?? null,
    industry: s1.industry ?? null,
    stage: s1.stage ?? null,
    legal_form: s1.legal_form ?? null,
    country: s1.country ?? null,
    city: s1.city ?? null,
    founding_year: s1.founding_year ?? null,
    founders: s2.founders ?? null,
    team_size: s2.team_size ?? null,
    key_skills: s2.key_skills ?? null,
    problem: s3.problem ?? null,
    solution: s3.solution ?? null,
    usp: s3.usp ?? null,
    product_stage: s3.product_stage ?? null,
    target_audience: s4.target_audience ?? null,
    tam_description: s4.tam_description ?? null,
    competitors: s4.competitors ?? null,
    competitive_advantage: s4.competitive_advantage ?? null,
    revenue_current: s5.revenue_current ?? null,
    revenue_last_year: s5.revenue_last_year ?? null,
    burn_rate: s5.burn_rate ?? null,
    runway_months: s5.runway_months ?? null,
    unit_economics: s5.unit_economics ?? null,
    investment_ask: s6.investment_ask ?? null,
    valuation_pre_money: s6.valuation_pre_money ?? null,
    investment_type: s6.investment_type ?? null,
    use_of_funds: s6.use_of_funds ?? null,
    previous_rounds: s6.previous_rounds ?? null,
    total_raised: s6.total_raised ?? null,
    monthly_users: s7.monthly_users ?? null,
    paying_customers: s7.paying_customers ?? null,
    mrr: s7.mrr ?? null,
    growth_rate_mom: s7.growth_rate_mom ?? null,
    key_metrics: s7.key_metrics ?? null,
    notable_clients: s7.notable_clients ?? null,
    exit_strategy: s8.exit_strategy ?? null,
    ai_score,
    ai_summary,
    documents,
  };

  return NextResponse.json(dealRoom);
}
