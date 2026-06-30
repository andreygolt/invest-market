import { createAdminClient } from '@/lib/supabase/admin';
import { notifyAiAnalysisDone } from '@/lib/notifications/notify-ai-analysis-done';
import type { AIAnalysisReport } from '@/types';

type QuestionnaireSectionRow = {
  section: string;
  answers: unknown;
};

type DocumentExtractionRow = {
  extracted_text: string | null;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

/**
 * Собирает данные проекта: анкету + извлечённые тексты документов.
 */
async function collectProjectData(projectId: string): Promise<string> {
  const supabase = createAdminClient();

  const { data: sections } = await supabase
    .from('project_questionnaire')
    .select('section, answers')
    .eq('project_id', projectId)
    .order('section');

  const { data: extractions } = await supabase
    .from('document_extractions')
    .select('extracted_text')
    .eq('project_id', projectId)
    .eq('status', 'done');

  const questionnaireParts = ((sections ?? []) as QuestionnaireSectionRow[])
    .map((section) => `## Анкета секция ${section.section}\n${JSON.stringify(section.answers, null, 2)}`)
    .join('\n\n');

  const documentParts = ((extractions ?? []) as DocumentExtractionRow[])
    .filter((extraction) => extraction.extracted_text)
    .map((extraction, index) => `## Документ ${index + 1}\n${extraction.extracted_text?.slice(0, 3000)}`)
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

async function createAnalysisCompletion(projectData: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const prompt = `${SYSTEM_PROMPT}\n\nОтвечай ТОЛЬКО валидным JSON без markdown-обёртки.\n\n${projectData}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          maxOutputTokens: 4096,
          temperature: 0.2,
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as GeminiResponse;
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

/**
 * Pipeline: анализирует проект через GPT-4o и сохраняет результат в ai_reports.
 */
export async function runAnalysisPipeline(projectId: string): Promise<void> {
  const supabase = createAdminClient();

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

  const { data: projectRow } = await supabase.from('projects').select('name').eq('id', projectId).maybeSingle();
  const projectName = (projectRow as { name?: string | null } | null)?.name ?? 'Без названия';

  try {
    const projectData = await collectProjectData(projectId);
    const content = await createAnalysisCompletion(projectData);
    const analysisReport = JSON.parse(content) as AIAnalysisReport;

    await supabase
      .from('ai_reports')
      .update({
        status: 'done',
        report: analysisReport,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report.id);

    notifyAiAnalysisDone({
      projectId,
      projectName,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    });
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
