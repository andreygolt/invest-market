# ТЗ T6 — AI Job: red flags, missing data, черновик карточки

**Дата:** 2026-06-27
**Зависимости:** T5 выполнен (document_extractions, runExtractionPipeline)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать UI для модератора (это T7)
- Не делать каталог инвестора (это T8+)
- Не создавать новых таблиц — использовать существующую `ai_reports` из 001_initial_schema.sql
- Не трогать `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t5.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`
- Не трогать `supabase/migrations/*`
- NO новых npm-зависимостей — только OpenAI SDK который уже есть

---

## Контекст

После того как T5 извлёк текст из документов, система должна:
1. Собрать все ответы анкеты (s1–s8) из `project_questionnaire`
2. Собрать извлечённые тексты из `document_extractions` (status = 'done')
3. Отправить в GPT-4o structured output
4. Получить: red_flags, missing_data, черновик карточки, ai_score
5. Сохранить результат в таблицу `ai_reports` (уже существует в схеме)

**Важно:** Таблица `ai_reports` уже существует (001_initial_schema.sql):
- `id`, `project_id`, `report` (jsonb), `status` (text, default 'draft'), `created_at`, `updated_at`
- RLS уже настроен: staff видит всё, owner видит своё
- Мы используем `report` jsonb для хранения структурированного результата
- Статусы: `pending` → `processing` → `done` / `error`

Переменная окружения: `OPENAI_API_KEY` (уже должна быть в `.env.local`).
Модель: `gpt-4o` (structured outputs с `response_format`).

---

## Шаг 1 — TypeScript типы (дополнить types/index.ts)

Добавить в конец `types/index.ts` (не удалять существующее):

```typescript
export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'error';

export type RedFlagSeverity = 'high' | 'medium' | 'low';
export type MissingFieldImportance = 'critical' | 'important' | 'nice_to_have';

export interface RedFlag {
  severity: RedFlagSeverity;
  description: string;
}

export interface MissingField {
  field: string;
  importance: MissingFieldImportance;
}

export interface AIAnalysisReport {
  red_flags: RedFlag[];
  missing_data: MissingField[];
  draft_card: string;      // Markdown-черновик карточки проекта
  ai_score: number;        // 1–10
  summary: string;         // Краткое резюме для модератора (1-2 абзаца)
}

export interface AIReportRow {
  id: string;
  project_id: string;
  report: AIAnalysisReport | Record<string, never>;
  status: AnalysisStatus;
  created_at: string;
  updated_at: string;
}
```

---

## Шаг 2 — Утилита анализа

Создать `lib/ai/analyze.ts`:

```typescript
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AIAnalysisReport } from '@/types';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Собирает данные проекта: анкету + извлечённые тексты документов.
 */
async function collectProjectData(projectId: string): Promise<string> {
  const supabase = createAdminClient();

  // Получаем все секции анкеты
  const { data: sections } = await supabase
    .from('project_questionnaire')
    .select('section, answers')
    .eq('project_id', projectId)
    .order('section');

  // Получаем извлечённые тексты документов
  const { data: extractions } = await supabase
    .from('document_extractions')
    .select('extracted_text')
    .eq('project_id', projectId)
    .eq('status', 'done');

  const questionnaireParts = (sections ?? [])
    .map((s) => `## Анкета секция ${s.section}\n${JSON.stringify(s.answers, null, 2)}`)
    .join('\n\n');

  const documentParts = (extractions ?? [])
    .filter((e) => e.extracted_text)
    .map((e, i) => `## Документ ${i + 1}\n${(e.extracted_text as string).slice(0, 3000)}`)
    .join('\n\n');

  return [
    '# Данные проекта для AI-анализа',
    questionnaireParts || '(анкета не заполнена)',
    documentParts || '(документы не загружены)',
  ].join('\n\n');
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    red_flags: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          description: { type: 'string' },
        },
        required: ['severity', 'description'],
        additionalProperties: false,
      },
    },
    missing_data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          importance: { type: 'string', enum: ['critical', 'important', 'nice_to_have'] },
        },
        required: ['field', 'importance'],
        additionalProperties: false,
      },
    },
    draft_card: { type: 'string' },
    ai_score: { type: 'number' },
    summary: { type: 'string' },
  },
  required: ['red_flags', 'missing_data', 'draft_card', 'ai_score', 'summary'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Ты — AI-андеррайтер закрытой инвестиционной платформы.
Твоя задача: проанализировать данные инвестиционного проекта и подготовить заключение для модератора.

Верни структурированный анализ:
1. red_flags — список красных флагов (противоречия, риски, подозрительные данные)
2. missing_data — список отсутствующих данных, важных для оценки
3. draft_card — черновик карточки проекта в Markdown для инвесторов (без упоминания конкретных % доходности)
4. ai_score — оценка качества заявки от 1 до 10 (только полнота и качество данных, не инвестиционная привлекательность)
5. summary — краткое резюме для модератора на русском языке (2-3 предложения)

ВАЖНО: Не давай инвестиционных рекомендаций. Не указывай прогнозы доходности.
Платформа НЕ принимает деньги — сделки оформляются вне платформы.`;

/**
 * Pipeline: анализирует проект через GPT-4o и сохраняет результат в ai_reports.
 */
export async function runAnalysisPipeline(projectId: string): Promise<void> {
  const supabase = createAdminClient();

  // Создаём/обновляем запись в ai_reports со статусом processing
  const { data: report, error: upsertError } = await supabase
    .from('ai_reports')
    .upsert(
      {
        project_id: projectId,
        status: 'processing',
        report: {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'project_id' }
    )
    .select('id')
    .single();

  if (upsertError || !report) return;

  try {
    const projectData = await collectProjectData(projectId);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'ai_analysis',
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: projectData },
      ],
      max_tokens: 4096,
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    const analysisReport = JSON.parse(content) as AIAnalysisReport;

    await supabase
      .from('ai_reports')
      .update({
        status: 'done',
        report: analysisReport,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_reports')
      .update({
        status: 'error',
        report: { error: message },
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);
  }
}
```

---

## Шаг 3 — API route для запуска анализа

Создать `app/api/ai/analyze/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAnalysisPipeline } from '@/lib/ai/analyze';

// Вызывается внутренне (из extract pipeline) или вручную модератором.
export async function POST(request: NextRequest) {
  const body = await request.json() as { project_id?: string };
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

  // Запускаем анализ без ожидания (fire-and-forget)
  runAnalysisPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Analyze] pipeline error:', err);
  });

  return NextResponse.json({ ok: true, message: 'analysis started' });
}
```

---

## Шаг 4 — Интеграция с extraction pipeline

Обновить `lib/ai/extract.ts` — после успешного завершения обработки всех документов запустить анализ.

В конце функции `runExtractionPipeline`, после цикла `for (const doc of documents)`, добавить:

```typescript
  // Запускаем AI-анализ асинхронно после извлечения всех текстов
  const { runAnalysisPipeline } = await import('@/lib/ai/analyze');
  runAnalysisPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Extract] analysis trigger error:', err);
  });
```

Полная функция `runExtractionPipeline` после изменения должна выглядеть так:

```typescript
export async function runExtractionPipeline(projectId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: documents, error: docsError } = await supabase
    .from('project_documents')
    .select('id, file_path, file_name, bucket')
    .eq('project_id', projectId);

  if (docsError || !documents || documents.length === 0) return;

  for (const doc of documents) {
    const { data: extraction, error: insertError } = await supabase
      .from('document_extractions')
      .upsert(
        {
          document_id: doc.id,
          project_id: projectId,
          status: 'processing',
          extracted_text: null,
          error_message: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'document_id' }
      )
      .select('id')
      .single();

    if (insertError || !extraction) continue;

    try {
      const bucket = (doc.bucket as string) || 'project-documents';
      const { base64, mimeType } = await downloadFileAsBase64(bucket, doc.file_path as string);
      const text = await extractTextFromFile(base64, mimeType, (doc.file_name as string) || 'document');

      await supabase
        .from('document_extractions')
        .update({ status: 'done', extracted_text: text, updated_at: new Date().toISOString() })
        .eq('id', extraction.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from('document_extractions')
        .update({ status: 'error', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', extraction.id);
    }
  }

  // Запускаем AI-анализ асинхронно после извлечения всех текстов
  const { runAnalysisPipeline } = await import('@/lib/ai/analyze');
  runAnalysisPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Extract] analysis trigger error:', err);
  });
}
```

---

## Шаг 5 — Тесты

Создать `__tests__/t6.test.ts`:

```typescript
import type {
  AnalysisStatus,
  RedFlag,
  RedFlagSeverity,
  MissingField,
  MissingFieldImportance,
  AIAnalysisReport,
  AIReportRow,
} from '@/types';

describe('T6 AnalysisStatus type', () => {
  it('all statuses are valid', () => {
    const statuses: AnalysisStatus[] = ['pending', 'processing', 'done', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('done comes after processing', () => {
    const flow: AnalysisStatus[] = ['pending', 'processing', 'done'];
    expect(flow.indexOf('done')).toBeGreaterThan(flow.indexOf('processing'));
  });
});

describe('T6 RedFlag type', () => {
  it('high severity flag is valid', () => {
    const flag: RedFlag = {
      severity: 'high',
      description: 'Отсутствует финансовая модель',
    };
    expect(flag.severity).toBe('high');
    expect(flag.description).toBeTruthy();
  });

  it('all severities are valid', () => {
    const severities: RedFlagSeverity[] = ['high', 'medium', 'low'];
    expect(severities).toHaveLength(3);
  });
});

describe('T6 MissingField type', () => {
  it('critical missing field is valid', () => {
    const field: MissingField = {
      field: 'financial_model',
      importance: 'critical',
    };
    expect(field.importance).toBe('critical');
  });

  it('all importances are valid', () => {
    const importances: MissingFieldImportance[] = ['critical', 'important', 'nice_to_have'];
    expect(importances).toHaveLength(3);
  });
});

describe('T6 AIAnalysisReport shape', () => {
  const sampleReport: AIAnalysisReport = {
    red_flags: [
      { severity: 'high', description: 'Нет подтверждённой выручки' },
      { severity: 'medium', description: 'Команда без опыта в отрасли' },
    ],
    missing_data: [
      { field: 'revenue_current', importance: 'critical' },
      { field: 'team_cv', importance: 'important' },
    ],
    draft_card: '# Стартап XYZ\n\nОписание проекта...',
    ai_score: 6,
    summary: 'Проект находится на ранней стадии. Требуется уточнение финансовых данных.',
  };

  it('report has red_flags array', () => {
    expect(Array.isArray(sampleReport.red_flags)).toBe(true);
    expect(sampleReport.red_flags).toHaveLength(2);
  });

  it('report has missing_data array', () => {
    expect(Array.isArray(sampleReport.missing_data)).toBe(true);
    expect(sampleReport.missing_data[0].importance).toBe('critical');
  });

  it('draft_card is a string', () => {
    expect(typeof sampleReport.draft_card).toBe('string');
    expect(sampleReport.draft_card.length).toBeGreaterThan(0);
  });

  it('ai_score is between 1 and 10', () => {
    expect(sampleReport.ai_score).toBeGreaterThanOrEqual(1);
    expect(sampleReport.ai_score).toBeLessThanOrEqual(10);
  });

  it('summary is a non-empty string', () => {
    expect(typeof sampleReport.summary).toBe('string');
    expect(sampleReport.summary.length).toBeGreaterThan(0);
  });
});

describe('T6 AIReportRow shape', () => {
  it('done report has full report data', () => {
    const row: AIReportRow = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      report: {
        red_flags: [],
        missing_data: [],
        draft_card: '# Test',
        ai_score: 8,
        summary: 'Хороший проект',
      },
      status: 'done',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(row.status).toBe('done');
  });

  it('processing report has empty report object', () => {
    const row: AIReportRow = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      report: {},
      status: 'processing',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:00:00Z',
    };
    expect(row.status).toBe('processing');
    expect(Object.keys(row.report)).toHaveLength(0);
  });
});

describe('T6 allowed statuses for analysis', () => {
  const allowedStatuses = ['submitted', 'under_review'];

  it('submitted triggers analysis', () => {
    expect(allowedStatuses.includes('submitted')).toBe(true);
  });

  it('under_review triggers analysis', () => {
    expect(allowedStatuses.includes('under_review')).toBe(true);
  });

  it('draft does not trigger analysis', () => {
    expect(allowedStatuses.includes('draft')).toBe(false);
  });

  it('approved does not trigger re-analysis', () => {
    expect(allowedStatuses.includes('approved')).toBe(false);
  });
});

describe('T6 red flags severity ranking', () => {
  const severityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

  it('high is more severe than medium', () => {
    expect(severityWeight['high']).toBeGreaterThan(severityWeight['medium']);
  });

  it('medium is more severe than low', () => {
    expect(severityWeight['medium']).toBeGreaterThan(severityWeight['low']);
  });

  it('counts high severity flags', () => {
    const flags: RedFlag[] = [
      { severity: 'high', description: 'Flag 1' },
      { severity: 'medium', description: 'Flag 2' },
      { severity: 'high', description: 'Flag 3' },
    ];
    const highCount = flags.filter((f) => f.severity === 'high').length;
    expect(highCount).toBe(2);
  });
});
```

---

## Шаг 6 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `types/index.ts` дополнен: `AnalysisStatus`, `RedFlag`, `RedFlagSeverity`, `MissingField`, `MissingFieldImportance`, `AIAnalysisReport`, `AIReportRow`
2. `lib/ai/analyze.ts` — утилита `runAnalysisPipeline(projectId)` с GPT-4o structured output
3. `app/api/ai/analyze/route.ts` — POST /api/ai/analyze запускает pipeline
4. `lib/ai/extract.ts` — обновлён: после цикла документов добавлен fire-and-forget вызов `runAnalysisPipeline`
5. `__tests__/t6.test.ts` — все тесты проходят
6. `npm run build` — без ошибок TypeScript
7. `npm test` — все тесты проходят (t1 + t2 + t3 + t4 + t5 + t6)
8. Никаких новых миграций — используем существующую таблицу `ai_reports`

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/extract/route.ts` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t5.test.ts` — не изменять
- `supabase/migrations/*` — не изменять (таблица ai_reports уже есть в 001_initial_schema.sql)

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T5":

```
DONE: T6
```

И в раздел "Выполненные задачи":

```
### T6 — AI Job: red flags, missing data, черновик карточки
Создано/изменено:
- types/index.ts — добавлены AnalysisStatus, RedFlag, MissingField, AIAnalysisReport, AIReportRow
- lib/ai/analyze.ts — runAnalysisPipeline: GPT-4o structured output анализ проекта
- app/api/ai/analyze/route.ts — POST /api/ai/analyze запускает анализ
- lib/ai/extract.ts — обновлён: fire-and-forget вызов runAnalysisPipeline после извлечения
- __tests__/t6.test.ts — тесты
```
