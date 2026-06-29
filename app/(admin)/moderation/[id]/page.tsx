import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminReportDocument, AIAnalysisReport, AIReportRow, ProjectRow } from '@/types';
import { ModerationActions } from './moderation-actions';
import { RerunAnalysisButton } from './rerun-analysis-button';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface QuestionnaireSectionRow {
  section: string;
  answers: unknown;
}

interface ProjectDocumentRow {
  id: string;
  filename: string;
  doc_type: string;
}

interface DocumentExtractionRow {
  document_id: string;
  status: string;
}

function getExtractionBadgeVariant(status: string | null) {
  if (status === 'done') return 'default';
  if (status === 'processing') return 'secondary';
  if (status === 'error') return 'destructive';
  return 'outline';
}

export default async function ModerationDetailPage({ params }: PageProps) {
  const supabase = createAdminClient();
  const { id: projectId } = await params;

  const [
    projectResult,
    questionnaireResult,
    aiReportResult,
    documentsResult,
    extractionsResult,
  ] = await Promise.all([
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
    supabase
      .from('project_documents')
      .select('id, filename, doc_type')
      .eq('project_id', projectId),
    supabase
      .from('document_extractions')
      .select('document_id, status')
      .eq('project_id', projectId),
  ]);

  if (!projectResult.data) notFound();

  const project = projectResult.data as ProjectRow;
  const questionnaire = (questionnaireResult.data ?? []) as QuestionnaireSectionRow[];
  const aiReport = aiReportResult.data as AIReportRow | null;
  const report = aiReport?.report as Partial<AIAnalysisReport> | undefined;
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

  const canModerate = ['submitted', 'under_review'].includes(project.status);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link href="/moderation">Назад к очереди</Link>
          </Button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{project.status}</Badge>
            <span className="text-sm text-slate-500">ID: {project.id}</span>
          </div>
        </div>
      </div>

      {aiReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              AI-анализ
              <Badge variant={aiReport.status === 'done' ? 'default' : 'secondary'}>
                {aiReport.status}
              </Badge>
              {aiReport.status === 'done' && typeof report?.ai_score === 'number' && (
                <Badge variant="outline">Оценка: {report.ai_score}/10</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiReport.status === 'done' && report?.summary && (
              <div>
                <h3 className="font-semibold mb-1">Резюме для модератора</h3>
                <p className="text-sm">{report.summary}</p>
              </div>
            )}

            {aiReport.status === 'done' && report?.red_flags && (
              <div>
                <h3 className="font-semibold mb-2">Красные флаги ({report.red_flags.length})</h3>
                <div className="space-y-1">
                  {report.red_flags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant={
                          flag.severity === 'high'
                            ? 'destructive'
                            : flag.severity === 'medium'
                              ? 'default'
                              : 'secondary'
                        }
                        className="shrink-0 mt-0.5"
                      >
                        {flag.severity}
                      </Badge>
                      <span>{flag.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiReport.status === 'done' && report?.missing_data && (
              <div>
                <h3 className="font-semibold mb-2">
                  Отсутствующие данные ({report.missing_data.length})
                </h3>
                <div className="space-y-1">
                  {report.missing_data.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant={item.importance === 'critical' ? 'destructive' : 'secondary'}
                        className="shrink-0 mt-0.5"
                      >
                        {item.importance}
                      </Badge>
                      <span>{item.field}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiReport.status !== 'done' && (
              <p className="text-sm text-slate-500">
                {aiReport.status === 'processing'
                  ? 'AI-анализ выполняется...'
                  : aiReport.status === 'error'
                    ? 'Ошибка AI-анализа'
                    : 'Анализ не начат'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!aiReport && (
        <Card>
          <CardContent className="py-6 text-center text-slate-500 text-sm">
            AI-анализ ещё не выполнен
          </CardContent>
        </Card>
      )}

      {aiReport?.status === 'done' && report?.draft_card && (
        <Card>
          <CardHeader>
            <CardTitle>Черновик карточки для инвесторов</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-500">
              Автоматически сгенерировано AI на основе анкеты и документов
            </p>
            <pre className="bg-slate-100 rounded p-3 text-xs overflow-auto whitespace-pre-wrap">
              {report.draft_card}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Загруженные документы</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 && (
            <p className="text-sm text-slate-500">Документы не загружены</p>
          )}

          {documents.length > 0 && (
            <div className="space-y-3">
              {documents.map((document) => (
                <div
                  key={document.id}
                  className="flex flex-col gap-2 rounded border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{document.file_name}</p>
                    <p className="text-xs text-slate-500">{document.document_type}</p>
                  </div>
                  <Badge
                    variant={getExtractionBadgeVariant(document.extraction_status)}
                    className={document.extraction_status === 'done' ? 'bg-green-600 text-white' : ''}
                  >
                    {document.extraction_status ?? 'pending'}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RerunAnalysisButton projectId={project.id} />

      {questionnaire.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Анкета проекта ({questionnaire.length} секций)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questionnaire.map((section) => (
              <div key={section.section}>
                <h3 className="font-semibold text-sm uppercase tracking-wide mb-2">
                  Секция {section.section.toUpperCase()}
                </h3>
                <pre className="bg-slate-100 rounded p-3 text-xs overflow-auto max-h-48">
                  {JSON.stringify(section.answers, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {canModerate && <ModerationActions projectId={project.id} projectName={project.name} />}

      {!canModerate && (
        <Card>
          <CardContent className="py-6 text-center text-slate-500 text-sm">
            Проект уже обработан: статус <strong>{project.status}</strong>
            {project.rejection_reason && (
              <p className="mt-2">Причина отклонения: {project.rejection_reason}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
