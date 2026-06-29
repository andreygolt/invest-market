import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
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
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <ViewTracker projectId={deal.id} />

      {/* Дисклеймер */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <strong>Важно:</strong> Платформа не является брокером или инвестиционным советником.
        Информация носит ознакомительный характер и не является офертой.
        Платформа не гарантирует доходность и не несёт ответственности за результаты инвестиций.
        Сделки заключаются вне платформы. Инвестирование сопряжено с риском потери вложенных средств.
      </div>

      {/* Шапка */}
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-4 text-slate-400 hover:text-white hover:bg-slate-900">
          <Link href="/catalog">← Назад к каталогу</Link>
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">{deal.name}</h1>
            {(deal.city || deal.country) && (
              <p className="text-slate-400 mt-1">
                {[deal.city, deal.country].filter(Boolean).join(', ')}
                {deal.founding_year && ` · Основан в ${deal.founding_year}`}
                {deal.legal_form && ` · ${deal.legal_form}`}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-2">
              {deal.stage && (
                <span className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400">
                  {STAGE_LABELS[deal.stage] ?? deal.stage}
                </span>
              )}
              {deal.industry && (
                <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">
                  {deal.industry}
                </span>
              )}
              {deal.investment_type && (
                <span className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400">
                  {INVESTMENT_TYPE_LABELS[deal.investment_type] ?? deal.investment_type}
                </span>
              )}
              {deal.product_stage && (
                <span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">
                  {PRODUCT_STAGE_LABELS[deal.product_stage] ?? deal.product_stage}
                </span>
              )}
            </div>
          </div>
          {deal.ai_score !== null && deal.ai_score >= 60 && (
            <div
              className={`shrink-0 rounded-lg px-4 py-3 text-center ${
                deal.ai_score >= 80
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-yellow-500/10 border border-yellow-500/20'
              }`}
            >
              <div
                className={`text-2xl font-bold ${
                  deal.ai_score >= 80 ? 'text-emerald-400' : 'text-yellow-400'
                }`}
              >
                {deal.ai_score}
              </div>
              <div className="text-xs text-slate-500">AI-оценка</div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-6">
        <FavoritePanel projectId={deal.id} />
      </div>

      {/* Видео */}
      {deal.video_signed_url && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Видео-презентация</h2>
            <video
              src={deal.video_signed_url}
              controls
              className="w-full max-w-sm mx-auto rounded-lg"
              style={{ aspectRatio: '9/16' }}
            />
        </section>
      )}

      {/* AI Резюме */}
      {deal.ai_summary && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">
              AI-анализ
              {deal.ai_score !== null && (
              <span className="ml-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400">
                Оценка: {deal.ai_score}
              </span>
              )}
          </h2>
          <p className="text-sm text-slate-300">{deal.ai_summary}</p>
        </section>
      )}

      {/* О проекте */}
      {deal.description && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">О проекте</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{deal.description}</p>
        </section>
      )}

      {/* Проблема и решение */}
      {(deal.problem || deal.solution || deal.usp) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Продукт</h2>
          <div className="space-y-4">
            {deal.problem && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Проблема</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{deal.problem}</p>
              </div>
            )}
            {deal.solution && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Решение</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{deal.solution}</p>
              </div>
            )}
            {deal.usp && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Уникальное преимущество</h3>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{deal.usp}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Рынок */}
      {(deal.target_audience ||
        deal.tam_description ||
        deal.competitors ||
        deal.competitive_advantage) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Рынок</h2>
          <div className="space-y-4">
            {deal.target_audience && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Целевая аудитория</h3>
                <p className="text-sm text-slate-300">{deal.target_audience}</p>
              </div>
            )}
            {deal.tam_description && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Объём рынка (TAM)</h3>
                <p className="text-sm text-slate-300">{deal.tam_description}</p>
              </div>
            )}
            {deal.competitors && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Конкуренты</h3>
                <p className="text-sm text-slate-300">{deal.competitors}</p>
              </div>
            )}
            {deal.competitive_advantage && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Конкурентное преимущество</h3>
                <p className="text-sm text-slate-300">{deal.competitive_advantage}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Команда */}
      {(deal.founders?.length || deal.team_size || deal.key_skills) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Команда</h2>
          <div className="space-y-4">
            {deal.team_size && (
              <p className="text-sm text-slate-300">
                <span className="font-medium text-slate-400">Размер команды:</span> {deal.team_size}
              </p>
            )}
            {deal.key_skills && (
              <p className="text-sm text-slate-300">
                <span className="font-medium text-slate-400">Ключевые компетенции:</span> {deal.key_skills}
              </p>
            )}
            {deal.founders && deal.founders.length > 0 && (
              <div className="space-y-3">
                {deal.founders.map((founder, i) => (
                  <div key={i} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <div className="font-medium text-white text-sm">{founder.name}</div>
                    {founder.role && (
                      <div className="text-xs text-slate-500">{founder.role}</div>
                    )}
                    {founder.bio && (
                      <p className="text-sm text-slate-400 mt-2">{founder.bio}</p>
                    )}
                    {founder.linkedin && (
                      <a
                        href={founder.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-400 hover:text-blue-300 mt-2 block"
                      >
                        LinkedIn →
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Тяга (метрики) */}
      {(deal.monthly_users ||
        deal.paying_customers ||
        deal.mrr ||
        deal.growth_rate_mom ||
        deal.key_metrics ||
        deal.notable_clients) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Трекшн и метрики</h2>
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {deal.monthly_users && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <div className="text-xs text-slate-500">Пользователей / мес</div>
                  <div className="text-lg font-semibold text-white mt-1">{deal.monthly_users}</div>
                </div>
            )}
            {deal.paying_customers && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <div className="text-xs text-slate-500">Платящих клиентов</div>
                  <div className="text-lg font-semibold text-white mt-1">{deal.paying_customers}</div>
                </div>
            )}
            {deal.mrr && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <div className="text-xs text-slate-500">MRR</div>
                  <div className="text-lg font-semibold text-white mt-1">{deal.mrr}</div>
                </div>
            )}
            {deal.growth_rate_mom && (
                <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
                  <div className="text-xs text-slate-500">Рост MoM</div>
                  <div className="text-lg font-semibold text-white mt-1">{deal.growth_rate_mom}</div>
                </div>
            )}
            </div>
            {deal.notable_clients && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Ключевые клиенты</h3>
                <p className="text-slate-300 mt-1">{deal.notable_clients}</p>
              </div>
            )}
            {deal.key_metrics && (
              <div>
                <h3 className="text-slate-400 text-sm font-medium mb-1">Другие метрики</h3>
                <p className="text-slate-300 mt-1">{deal.key_metrics}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Финансы и условия инвестирования — с дисклеймером */}
      {(deal.investment_ask ||
        deal.valuation_pre_money ||
        deal.use_of_funds ||
        deal.revenue_current ||
        deal.runway_months) && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Условия инвестирования</h2>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
              Финансовые показатели предоставлены проектом и не верифицированы платформой.
              Не является инвестиционной рекомендацией. Доходность не гарантируется.
            </div>
            <div className="space-y-2 text-sm text-slate-300">
              {deal.investment_ask && (
                <p><span className="font-medium text-slate-400">Объём раунда:</span> {deal.investment_ask}</p>
              )}
              {deal.valuation_pre_money && (
                <p><span className="font-medium text-slate-400">Оценка (pre-money):</span> {deal.valuation_pre_money}</p>
              )}
              {deal.investment_type && (
                <p>
                  <span className="font-medium text-slate-400">Тип инвестиций:</span>{' '}
                  {INVESTMENT_TYPE_LABELS[deal.investment_type] ?? deal.investment_type}
                </p>
              )}
              {deal.total_raised && (
                <p><span className="font-medium text-slate-400">Уже привлечено:</span> {deal.total_raised}</p>
              )}
              {deal.previous_rounds && (
                <p><span className="font-medium text-slate-400">Предыдущие раунды:</span> {deal.previous_rounds}</p>
              )}
              {deal.use_of_funds && (
                <div>
                  <span className="font-medium text-slate-400">Использование средств:</span>
                  <p className="text-slate-300 mt-1 whitespace-pre-wrap">{deal.use_of_funds}</p>
                </div>
              )}
              {deal.revenue_current && (
                <p><span className="font-medium text-slate-400">Текущая выручка:</span> {deal.revenue_current}</p>
              )}
              {deal.burn_rate && (
                <p><span className="font-medium text-slate-400">Burn rate:</span> {deal.burn_rate}</p>
              )}
              {deal.runway_months && (
                <p><span className="font-medium text-slate-400">Runway:</span> {deal.runway_months} мес.</p>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Калькулятор доходности */}
      <YieldCalculator investmentAsk={deal.investment_ask} />

      {/* Стратегия выхода */}
      {deal.exit_strategy && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Стратегия выхода</h2>
          <p className="text-sm text-slate-300 whitespace-pre-wrap">{deal.exit_strategy}</p>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Обновления проекта</h2>
          {updates.length === 0 ? (
            <p className="text-slate-500 text-sm">
              Проект ещё не публиковал обновлений.
            </p>
          ) : (
            <div className="space-y-4">
              {updates.map((update) => (
                <div key={update.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <div className="font-semibold text-white">{update.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      {new Date(update.created_at).toLocaleString()}
                    </div>
                    <p className="text-sm text-slate-400 mt-3 whitespace-pre-wrap">{update.body}</p>
                    {update.ai_summary && (
                      <div className="mt-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
                        <div className="text-xs font-medium text-slate-400 mb-1">Краткое резюме</div>
                        <p className="text-slate-500">{update.ai_summary}</p>
                      </div>
                    )}
                </div>
              ))}
            </div>
          )}
      </section>

      {documents.length > 0 && (
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Документы проекта</h2>
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium text-slate-300">{doc.file_name}</div>
                  <div className="text-xs text-slate-600 mt-0.5">
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
                  className="ml-4 shrink-0 text-sm text-blue-400 hover:text-blue-300"
                >
                  Скачать →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* CTA */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4 pb-8">
        <Button asChild size="lg" className="bg-white text-black hover:bg-slate-200">
          <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
        </Button>
        <Button
          asChild
          size="lg"
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <Link href={`/portfolio/add?project_id=${deal.id}`}>Зафиксировать инвестицию</Link>
        </Button>
      </div>
      </div>
    </div>
  );
}
