# ТЗ T9 — Deal Room: карточка проекта для инвестора

**Дата:** 2026-06-27
**Зависимости:** T8 выполнен (каталог инвестора работает, карточки ведут на `/deals/{id}`)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать заявку инвестора — это T10 (кнопка "Оставить заявку" — просто ссылка)
- Не делать избранное/заметки — это T11
- Не делать калькулятор доходности — это T12
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t8.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- Не трогать `app/(investor)/catalog/*`
- NO новых npm-зависимостей
- NO новых миграций (все нужные таблицы уже есть)

---

## Контекст

После T8 каталог работает. Каждая карточка ведёт на `/deals/{id}` — это Deal Room.
Deal Room — полная карточка проекта для инвестора:
- Все данные анкеты (секции s1–s8) в читаемом виде
- AI-оценка и AI-резюме (без red flags — они только для администраторов)
- Список документов с signed URL для скачивания
- Видео (если загружено)
- Кнопка "Оставить заявку" (ссылка на будущий T10, route `/deals/{id}/apply`)
- Обязательный дисклеймер

Инвестор видит только `approved` проекты. Если проект не найден или не `approved` — 404.

**Данные для Deal Room:**
- `projects` — `id`, `name`, `status`, `video_path`, `created_at`
- `project_questionnaire` секции `s1`–`s8` — все поля анкеты
- `ai_reports` — `ai_score`, `summary` (только если `status = 'done'`; red_flags НЕ показываем)
- `project_documents` — список документов + signed URL из Supabase Storage

---

## Шаг 1 — TypeScript типы

Добавить в конец `types/index.ts`:

```typescript
export interface DealRoomDocument {
  id: string;
  doc_type: DocumentType;
  filename: string;
  signed_url: string;
}

export interface DealRoomProject {
  id: string;
  name: string;
  created_at: string;
  video_signed_url: string | null;
  // Из s1
  description: string | null;
  industry: string | null;
  stage: ProjectStage | null;
  legal_form: string | null;
  country: string | null;
  city: string | null;
  founding_year: string | null;
  // Из s2
  founders: Array<{ name: string; role: string; linkedin: string; bio: string }> | null;
  team_size: string | null;
  key_skills: string | null;
  // Из s3
  problem: string | null;
  solution: string | null;
  usp: string | null;
  product_stage: ProductStage | null;
  // Из s4
  target_audience: string | null;
  tam_description: string | null;
  competitors: string | null;
  competitive_advantage: string | null;
  // Из s5
  revenue_current: string | null;
  revenue_last_year: string | null;
  burn_rate: string | null;
  runway_months: string | null;
  unit_economics: string | null;
  // Из s6
  investment_ask: string | null;
  valuation_pre_money: string | null;
  investment_type: QS6Answers['investment_type'] | null;
  use_of_funds: string | null;
  previous_rounds: string | null;
  total_raised: string | null;
  // Из s7
  monthly_users: string | null;
  paying_customers: string | null;
  mrr: string | null;
  growth_rate_mom: string | null;
  key_metrics: string | null;
  notable_clients: string | null;
  // Из s8
  exit_strategy: string | null;
  // AI
  ai_score: number | null;
  ai_summary: string | null;
  // Документы
  documents: DealRoomDocument[];
}
```

---

## Шаг 2 — API route: GET /api/investor/deals/[id]

Создать `app/api/investor/deals/[id]/route.ts`:

```typescript
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
```

---

## Шаг 3 — UI: страница Deal Room

Создать `app/(investor)/deals/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const DOC_TYPE_LABELS: Record<string, string> = {
  pitch_deck: 'Pitch Deck',
  financial_model: 'Финансовая модель',
  charter: 'Устав',
  team_cv: 'CV команды',
  legal_docs: 'Юридические документы',
  other: 'Другое',
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

export default async function DealRoomPage({ params }: PageProps) {
  const { id: projectId } = await params;
  const deal = await getDealRoom(projectId);

  if (!deal) notFound();

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
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
              {deal.investment_type && deal.investment_type !== '' && (
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
      {(deal.target_audience || deal.tam_description || deal.competitors || deal.competitive_advantage) && (
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
      {(deal.monthly_users || deal.paying_customers || deal.mrr || deal.growth_rate_mom || deal.key_metrics || deal.notable_clients) && (
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
      {(deal.investment_ask || deal.valuation_pre_money || deal.use_of_funds || deal.revenue_current || deal.runway_months) && (
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
              {deal.investment_type && deal.investment_type !== '' && (
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

      {/* Документы */}
      {deal.documents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Документы</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {deal.documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between text-sm">
                  <span>
                    <span className="font-medium">
                      {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}:
                    </span>{' '}
                    {doc.filename}
                  </span>
                  {doc.signed_url && (
                    <a
                      href={doc.signed_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs ml-4 shrink-0"
                    >
                      Скачать
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* CTA */}
      <div className="flex justify-center pt-4 pb-8">
        <Button asChild size="lg">
          <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
        </Button>
      </div>
    </div>
  );
}
```

---

## Шаг 4 — Тесты

Создать `__tests__/t9.test.ts`:

```typescript
import type { DealRoomProject, DealRoomDocument, DocumentType, ProjectStage, ProductStage } from '@/types';

const makeDocument = (overrides: Partial<DealRoomDocument> = {}): DealRoomDocument => ({
  id: 'doc-1',
  doc_type: 'pitch_deck' as DocumentType,
  filename: 'pitch.pdf',
  signed_url: 'https://storage.example.com/signed/pitch.pdf',
  ...overrides,
});

const makeDeal = (overrides: Partial<DealRoomProject> = {}): DealRoomProject => ({
  id: 'proj-1',
  name: 'Test Project',
  created_at: '2026-06-27T00:00:00Z',
  video_signed_url: null,
  description: 'Описание проекта',
  industry: 'FinTech',
  stage: 'seed' as ProjectStage,
  legal_form: 'ООО',
  country: 'Россия',
  city: 'Москва',
  founding_year: '2023',
  founders: [{ name: 'Иван', role: 'CEO', linkedin: '', bio: 'Опытный предприниматель' }],
  team_size: '10',
  key_skills: 'AI, финтех',
  problem: 'Проблема рынка',
  solution: 'Наше решение',
  usp: 'Уникальное преимущество',
  product_stage: 'mvp' as ProductStage,
  target_audience: 'Малый бизнес',
  tam_description: '$10B рынок',
  competitors: 'Конкурент А',
  competitive_advantage: 'Быстрее и дешевле',
  revenue_current: '500 000 руб/мес',
  revenue_last_year: '3 000 000 руб',
  burn_rate: '300 000 руб/мес',
  runway_months: '12',
  unit_economics: 'CAC 5000, LTV 30000',
  investment_ask: '30 000 000 руб',
  valuation_pre_money: '150 000 000 руб',
  investment_type: 'equity',
  use_of_funds: 'Разработка, маркетинг',
  previous_rounds: 'Pre-seed 5M',
  total_raised: '5 000 000 руб',
  monthly_users: '1200',
  paying_customers: '80',
  mrr: '480 000 руб',
  growth_rate_mom: '15%',
  key_metrics: 'Churn 3%',
  notable_clients: 'Сбер, Т-Банк',
  exit_strategy: 'M&A через 5 лет',
  ai_score: 8,
  ai_summary: 'Сильная команда, растущий рынок',
  documents: [makeDocument()],
  ...overrides,
});

describe('T9 DealRoomProject type', () => {
  it('has all required fields', () => {
    const deal = makeDeal();
    expect(typeof deal.id).toBe('string');
    expect(typeof deal.name).toBe('string');
    expect(typeof deal.created_at).toBe('string');
    expect(Array.isArray(deal.documents)).toBe(true);
  });

  it('nullable fields can be null', () => {
    const deal = makeDeal({
      video_signed_url: null,
      ai_score: null,
      ai_summary: null,
      industry: null,
      stage: null,
    });
    expect(deal.video_signed_url).toBeNull();
    expect(deal.ai_score).toBeNull();
    expect(deal.ai_summary).toBeNull();
  });

  it('ai_score is in range 1-10 when present', () => {
    const deal = makeDeal({ ai_score: 7 });
    expect(deal.ai_score).toBeGreaterThanOrEqual(1);
    expect(deal.ai_score).toBeLessThanOrEqual(10);
  });

  it('documents array can be empty', () => {
    const deal = makeDeal({ documents: [] });
    expect(deal.documents).toHaveLength(0);
  });
});

describe('T9 DealRoomDocument type', () => {
  it('has all required fields', () => {
    const doc = makeDocument();
    expect(typeof doc.id).toBe('string');
    expect(typeof doc.doc_type).toBe('string');
    expect(typeof doc.filename).toBe('string');
    expect(typeof doc.signed_url).toBe('string');
  });

  it('supports all document types', () => {
    const types: DocumentType[] = ['pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other'];
    types.forEach((type) => {
      const doc = makeDocument({ doc_type: type });
      expect(doc.doc_type).toBe(type);
    });
  });
});

describe('T9 deal room data assembly', () => {
  it('assembles questionnaire sections into flat structure', () => {
    const s1 = { description: 'Desc', industry: 'FinTech', stage: 'seed', country: 'Russia', city: 'Moscow', founding_year: '2023', legal_form: 'LLC' };
    const s6 = { investment_ask: '1M', valuation_pre_money: '10M', investment_type: 'equity', use_of_funds: 'dev', previous_rounds: '', total_raised: '' };

    const deal = makeDeal({
      description: s1.description,
      industry: s1.industry,
      investment_ask: s6.investment_ask,
      investment_type: 'equity',
    });

    expect(deal.description).toBe('Desc');
    expect(deal.industry).toBe('FinTech');
    expect(deal.investment_ask).toBe('1M');
    expect(deal.investment_type).toBe('equity');
  });

  it('does not expose red_flags to investor', () => {
    const deal = makeDeal();
    expect('red_flags' in deal).toBe(false);
    expect('missing_data' in deal).toBe(false);
  });

  it('video_signed_url is set when video exists', () => {
    const deal = makeDeal({ video_signed_url: 'https://storage.example.com/video.mp4' });
    expect(deal.video_signed_url).toMatch(/^https?:\/\//);
  });
});

describe('T9 disclaimer requirement', () => {
  it('disclaimer includes required elements', () => {
    const disclaimer =
      'Платформа не является брокером или инвестиционным советником. ' +
      'Платформа не гарантирует доходность. ' +
      'Сделки заключаются вне платформы.';
    expect(disclaimer).toContain('не является брокером');
    expect(disclaimer).toContain('не гарантирует доходность');
    expect(disclaimer).toContain('вне платформы');
  });

  it('financial disclaimer is separate for investment terms section', () => {
    const financialDisclaimer =
      'Финансовые показатели предоставлены проектом и не верифицированы платформой. ' +
      'Не является инвестиционной рекомендацией. Доходность не гарантируется.';
    expect(financialDisclaimer).toContain('Доходность не гарантируется');
    expect(financialDisclaimer.length).toBeGreaterThan(50);
  });
});

describe('T9 stage and product stage labels', () => {
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

  it('all project stages have labels', () => {
    const stages: ProjectStage[] = ['idea', 'pre_seed', 'seed', 'series_a_plus'];
    stages.forEach((s) => {
      expect(STAGE_LABELS[s]).toBeDefined();
    });
  });

  it('all product stages have labels', () => {
    const stages: ProductStage[] = ['concept', 'mvp', 'beta', 'launched'];
    stages.forEach((s) => {
      expect(PRODUCT_STAGE_LABELS[s]).toBeDefined();
    });
  });
});
```

---

## Шаг 5 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `types/index.ts` — добавлены `DealRoomDocument`, `DealRoomProject`
2. `app/api/investor/deals/[id]/route.ts` — GET возвращает данные проекта для инвестора (только `approved`; 404 иначе)
3. `app/(investor)/deals/[id]/page.tsx` — серверная страница Deal Room с:
   - дисклеймером в шапке
   - дисклеймером в секции финансов
   - AI-оценкой и AI-резюме (без red_flags)
   - данными из всех секций анкеты
   - командой с фаундерами
   - документами со ссылками для скачивания
   - видео-плеером (если есть)
   - кнопкой "Оставить заявку" → `/deals/{id}/apply`
4. `__tests__/t9.test.ts` — все тесты проходят
5. `npm run build` — без ошибок TypeScript
6. `npm test` — все тесты проходят (t1 … t9)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/*` — не изменять
- `lib/ai/*` — не изменять
- `app/(investor)/catalog/*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t8.test.ts` — не изменять
- `supabase/migrations/*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T8":

```
DONE: T9
```

И в раздел "Выполненные задачи":

```
### T9 — Deal Room: карточка проекта для инвестора
Создано/изменено:
- types/index.ts — добавлены DealRoomDocument, DealRoomProject
- app/api/investor/deals/[id]/route.ts — GET полных данных проекта для инвестора
- app/(investor)/deals/[id]/page.tsx — страница Deal Room с дисклеймерами, видео, документами, CTA
- __tests__/t9.test.ts — тесты
```
