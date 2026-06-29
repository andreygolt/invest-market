import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FavoritePanel } from './favorite-panel';
import { ViewTracker } from './view-tracker';
import { YieldCalculator } from './yield-calculator';
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
  InvestorDocumentItem,
  ProjectUpdate,
} from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

const STAGE_LABELS: Record<string, string> = {
  idea: 'Идея',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a_plus: 'Series A+',
};

const PRODUCT_STAGE_LABELS: Record<string, string> = {
  concept: 'Концепция',
  mvp: 'MVP',
  beta: 'Бета',
  launched: 'Запущен',
};

const INVESTMENT_TYPE_LABELS: Record<string, string> = {
  equity: 'Акции (Equity)',
  convertible_note: 'Конвертируемый займ',
  safe: 'SAFE',
  debt: 'Долг',
};

async function getDealRoom(projectId: string): Promise<DealRoomProject | null> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, video_path, created_at')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) return null;

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

  let ai_score: number | null = null;
  let ai_summary: string | null = null;
  if (aiResult.data?.status === 'done') {
    const report = aiResult.data.report as Partial<AIAnalysisReport>;
    ai_score = typeof report.ai_score === 'number' ? report.ai_score : null;
    ai_summary = report.summary ?? null;
  }

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

  let video_signed_url: string | null = null;
  if (project.video_path) {
    const { data: videoData } = await supabase.storage
      .from('videos')
      .createSignedUrl(project.video_path, 3600);
    video_signed_url = videoData?.signedUrl ?? null;
  }

  return {
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
}

async function getProjectUpdates(projectId: string): Promise<ProjectUpdate[]> {
  const headersList = await headers();
  const cookieStore = await cookies();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';

  const response = await fetch(`${protocol}://${host}/api/investor/deals/${projectId}/updates`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return [];

  return (await response.json()) as ProjectUpdate[];
}

async function getInvestorDocuments(projectId: string): Promise<InvestorDocumentItem[]> {
  const headersList = await headers();
  const cookieStore = await cookies();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';

  const response = await fetch(`${protocol}://${host}/api/investor/deals/${projectId}/documents`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return [];

  return (await response.json()) as InvestorDocumentItem[];
}

export default async function DealRoomPage({ params }: PageProps) {
  const { id: projectId } = await params;
  const [deal, documents] = await Promise.all([
    getDealRoom(projectId),
    getInvestorDocuments(projectId),
  ]);

  if (!deal) notFound();

  const updates = await getProjectUpdates(projectId);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
      <ViewTracker projectId={deal.id} />

      {/* Дисклеймер */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Важно:</strong> Платформа не является брокером или инвестиционным советником.
        Информация носит ознакомительный характер и не является офертой.
        Платформа не гарантирует доходность и не несёт ответственности за результаты инвестиций.
        Сделки заключаются вне платформы. Инвестирование сопряжено с риском потери вложенных средств.
      </div>

      {/* Шапка */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2">
          <Link href="/catalog">← Назад к каталогу</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{deal.name}</h1>
            <div className="flex flex-wrap gap-2 mt-2">
              {deal.stage && (
                <Badge variant="secondary">{STAGE_LABELS[deal.stage] ?? deal.stage}</Badge>
              )}
              {deal.industry && <Badge variant="outline">{deal.industry}</Badge>}
              {deal.investment_type && (
                <Badge variant="outline">
                  {INVESTMENT_TYPE_LABELS[deal.investment_type] ?? deal.investment_type}
                </Badge>
              )}
              {deal.product_stage && (
                <Badge variant="secondary">
                  {PRODUCT_STAGE_LABELS[deal.product_stage] ?? deal.product_stage}
                </Badge>
              )}
            </div>
            {(deal.city || deal.country) && (
              <p className="text-sm text-muted-foreground mt-1">
                {[deal.city, deal.country].filter(Boolean).join(', ')}
                {deal.founding_year && ` · Основан в ${deal.founding_year}`}
                {deal.legal_form && ` · ${deal.legal_form}`}
              </p>
            )}
          </div>
          {deal.ai_score !== null && (
            <div className="shrink-0 text-center">
              <div className="text-3xl font-bold">{deal.ai_score}/10</div>
              <div className="text-xs text-muted-foreground">AI-оценка</div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <FavoritePanel projectId={deal.id} />
      </div>

      {/* Видео */}
      {deal.video_signed_url && (
        <Card>
          <CardHeader>
            <CardTitle>Видео-презентация</CardTitle>
          </CardHeader>
          <CardContent>
            <video
              src={deal.video_signed_url}
              controls
              className="w-full max-w-sm mx-auto rounded-lg"
              style={{ aspectRatio: '9/16' }}
            />
          </CardContent>
        </Card>
      )}

      {/* AI Резюме */}
      {deal.ai_summary && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              AI-анализ
              {deal.ai_score !== null && (
                <Badge variant="outline">Оценка: {deal.ai_score}/10</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{deal.ai_summary}</p>
          </CardContent>
        </Card>
      )}

      {/* О проекте */}
      {deal.description && (
        <Card>
          <CardHeader>
            <CardTitle>О проекте</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{deal.description}</p>
          </CardContent>
        </Card>
      )}

      {/* Проблема и решение */}
      {(deal.problem || deal.solution || deal.usp) && (
        <Card>
          <CardHeader>
            <CardTitle>Продукт</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deal.problem && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Проблема</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.problem}</p>
              </div>
            )}
            {deal.solution && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Решение</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.solution}</p>
              </div>
            )}
            {deal.usp && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Уникальное преимущество</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{deal.usp}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Рынок */}
      {(deal.target_audience ||
        deal.tam_description ||
        deal.competitors ||
        deal.competitive_advantage) && (
        <Card>
          <CardHeader>
            <CardTitle>Рынок</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deal.target_audience && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Целевая аудитория</h3>
                <p className="text-sm text-muted-foreground">{deal.target_audience}</p>
              </div>
            )}
            {deal.tam_description && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Объём рынка (TAM)</h3>
                <p className="text-sm text-muted-foreground">{deal.tam_description}</p>
              </div>
            )}
            {deal.competitors && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Конкуренты</h3>
                <p className="text-sm text-muted-foreground">{deal.competitors}</p>
              </div>
            )}
            {deal.competitive_advantage && (
              <div>
                <h3 className="text-sm font-semibold mb-1">Конкурентное преимущество</h3>
                <p className="text-sm text-muted-foreground">{deal.competitive_advantage}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Команда */}
      {(deal.founders?.length || deal.team_size || deal.key_skills) && (
        <Card>
          <CardHeader>
            <CardTitle>Команда</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deal.team_size && (
              <p className="text-sm">
                <span className="font-medium">Размер команды:</span> {deal.team_size}
              </p>
            )}
            {deal.key_skills && (
              <p className="text-sm">
                <span className="font-medium">Ключевые компетенции:</span> {deal.key_skills}
              </p>
            )}
            {deal.founders && deal.founders.length > 0 && (
              <div className="space-y-3">
                {deal.founders.map((founder, i) => (
                  <div key={i} className="border rounded-lg p-3">
                    <div className="font-medium text-sm">{founder.name}</div>
                    {founder.role && (
                      <div className="text-xs text-muted-foreground">{founder.role}</div>
                    )}
                    {founder.bio && (
                      <p className="text-sm mt-1">{founder.bio}</p>
                    )}
                    {founder.linkedin && (
                      <a
                        href={founder.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline mt-1 block"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Тяга (метрики) */}
      {(deal.monthly_users ||
        deal.paying_customers ||
        deal.mrr ||
        deal.growth_rate_mom ||
        deal.key_metrics ||
        deal.notable_clients) && (
        <Card>
          <CardHeader>
            <CardTitle>Трекшн и метрики</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deal.monthly_users && (
              <p><span className="font-medium">Ежемесячных пользователей:</span> {deal.monthly_users}</p>
            )}
            {deal.paying_customers && (
              <p><span className="font-medium">Платящих клиентов:</span> {deal.paying_customers}</p>
            )}
            {deal.mrr && (
              <p><span className="font-medium">MRR:</span> {deal.mrr}</p>
            )}
            {deal.growth_rate_mom && (
              <p><span className="font-medium">Рост MoM:</span> {deal.growth_rate_mom}</p>
            )}
            {deal.notable_clients && (
              <div>
                <span className="font-medium">Ключевые клиенты:</span>
                <p className="text-muted-foreground mt-1">{deal.notable_clients}</p>
              </div>
            )}
            {deal.key_metrics && (
              <div>
                <span className="font-medium">Другие метрики:</span>
                <p className="text-muted-foreground mt-1">{deal.key_metrics}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Финансы и условия инвестирования — с дисклеймером */}
      {(deal.investment_ask ||
        deal.valuation_pre_money ||
        deal.use_of_funds ||
        deal.revenue_current ||
        deal.runway_months) && (
        <Card>
          <CardHeader>
            <CardTitle>Условия инвестирования</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Финансовые показатели предоставлены проектом и не верифицированы платформой.
              Не является инвестиционной рекомендацией. Доходность не гарантируется.
            </div>
            <div className="space-y-2 text-sm">
              {deal.investment_ask && (
                <p><span className="font-medium">Объём раунда:</span> {deal.investment_ask}</p>
              )}
              {deal.valuation_pre_money && (
                <p><span className="font-medium">Оценка (pre-money):</span> {deal.valuation_pre_money}</p>
              )}
              {deal.investment_type && (
                <p>
                  <span className="font-medium">Тип инвестиций:</span>{' '}
                  {INVESTMENT_TYPE_LABELS[deal.investment_type] ?? deal.investment_type}
                </p>
              )}
              {deal.total_raised && (
                <p><span className="font-medium">Уже привлечено:</span> {deal.total_raised}</p>
              )}
              {deal.previous_rounds && (
                <p><span className="font-medium">Предыдущие раунды:</span> {deal.previous_rounds}</p>
              )}
              {deal.use_of_funds && (
                <div>
                  <span className="font-medium">Использование средств:</span>
                  <p className="text-muted-foreground mt-1 whitespace-pre-wrap">{deal.use_of_funds}</p>
                </div>
              )}
              {deal.revenue_current && (
                <p><span className="font-medium">Текущая выручка:</span> {deal.revenue_current}</p>
              )}
              {deal.burn_rate && (
                <p><span className="font-medium">Burn rate:</span> {deal.burn_rate}</p>
              )}
              {deal.runway_months && (
                <p><span className="font-medium">Runway:</span> {deal.runway_months} мес.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Калькулятор доходности */}
      <YieldCalculator investmentAsk={deal.investment_ask} />

      {/* Стратегия выхода */}
      {deal.exit_strategy && (
        <Card>
          <CardHeader>
            <CardTitle>Стратегия выхода</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{deal.exit_strategy}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Обновления проекта</CardTitle>
        </CardHeader>
        <CardContent>
          {updates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Проект ещё не публиковал обновлений.
            </p>
          ) : (
            <div className="space-y-4">
              {updates.map((update) => (
                <Card key={update.id} className="shadow-none">
                  <CardHeader>
                    <CardTitle className="text-lg">{update.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {new Date(update.created_at).toLocaleString()}
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="whitespace-pre-wrap text-sm">{update.body}</p>
                    {update.ai_summary && (
                      <div className="rounded-md border bg-gray-50 p-3 text-sm">
                        <div className="mb-1 font-medium">Краткое резюме</div>
                        <p className="text-muted-foreground">{update.ai_summary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {documents.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Документы проекта</h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-md border px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{doc.file_name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {doc.document_type}
                    {doc.file_size
                      ? ` · ${Math.round(doc.file_size / 1024)} КБ`
                      : ''}
                  </div>
                </div>
                <a
                  href={doc.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-4 shrink-0 text-sm text-blue-600 hover:underline"
                >
                  Скачать
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4 pb-8">
        <Button asChild size="lg">
          <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/portfolio/add?project_id=${deal.id}`}>Зафиксировать инвестицию</Link>
        </Button>
      </div>
    </div>
  );
}
