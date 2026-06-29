# ТЗ T5 — AI Job: извлечение текста из документов, async pipeline

**Дата:** 2026-06-27
**Зависимости:** T4 выполнен (статусы проекта, видео, submit API)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать AI red flags / scoring / карточку проекта (это T6)
- Не делать модерацию (это T7)
- Не делать UI для инвестора (это T8+)
- Не трогать `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t4.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`
- NO новых npm-зависимостей — использовать только OpenAI SDK который уже есть в package.json

---

## Контекст

Когда проект переходит в статус `submitted`, система должна автоматически:
1. Взять все документы проекта из таблицы `project_documents` (pdf, docx — Storage URLs)
2. Извлечь текстовое содержимое каждого документа через OpenAI (Vision / file API)
3. Сохранить извлечённый текст в новую таблицу `document_extractions`
4. Записать статус извлечения (`pending` → `processing` → `done` / `error`)

В этом этапе реализуем:
- Миграцию БД: таблица `document_extractions`
- TypeScript типы
- Утилиту извлечения текста: `lib/ai/extract.ts`
- API route для запуска pipeline: `POST /api/ai/extract` (вызывается внутри submit или вручную)
- Тесты

**Важно:** Извлечение запускается асинхронно — `POST /api/project/submit` делает `fetch` к `/api/ai/extract` без ожидания ответа (fire-and-forget через `waitUntil` или просто `fetch` с catch).

Переменная окружения: `OPENAI_API_KEY` (уже должна быть в `.env.local`).
Модель: `gpt-4o` (умеет читать изображения PDF-страниц через base64).

---

## Шаг 1 — Миграция БД

Создать `supabase/migrations/005_document_extractions.sql`:

```sql
-- Таблица для хранения извлечённого текста из документов
CREATE TABLE IF NOT EXISTS document_extractions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'pending',
  -- pending | processing | done | error
  extracted_text text,
  error_message  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_extractions_project_idx ON document_extractions(project_id);
CREATE INDEX IF NOT EXISTS document_extractions_document_idx ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS document_extractions_status_idx ON document_extractions(status);

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит свои экстракции
CREATE POLICY "project_owner_select_extractions" ON document_extractions
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Администраторы и модераторы видят все
CREATE POLICY "admin_select_extractions" ON document_extractions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Только сервисный клиент пишет (через admin client)
CREATE POLICY "service_all_extractions" ON document_extractions
  FOR ALL
  WITH CHECK (true);
```

---

## Шаг 2 — Типы TypeScript (дополнить types/index.ts)

Добавить в конец `types/index.ts` (не удалять существующее):

```typescript
export type ExtractionStatus = 'pending' | 'processing' | 'done' | 'error';

export interface DocumentExtraction {
  id: string;
  document_id: string;
  project_id: string;
  status: ExtractionStatus;
  extracted_text: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Шаг 3 — Утилита извлечения текста

Создать `lib/ai/extract.ts`:

```typescript
import OpenAI from 'openai';
import { createAdminClient } from '@/lib/supabase/admin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Загружает файл из Supabase Storage и возвращает base64-строку с MIME-типом.
 */
async function downloadFileAsBase64(
  bucket: string,
  path: string
): Promise<{ base64: string; mimeType: string }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);

  const arrayBuffer = await data.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  // Определяем MIME по расширению пути
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    pdf:  'application/pdf',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  const mimeType = mimeMap[ext] ?? 'application/octet-stream';

  return { base64, mimeType };
}

/**
 * Извлекает текст из документа через GPT-4o.
 * Поддерживает PDF (как изображение) и текстовые форматы.
 */
async function extractTextFromFile(
  base64: string,
  mimeType: string,
  fileName: string
): Promise<string> {
  // GPT-4o принимает PDF и изображения через image_url с base64
  const isVisual = ['application/pdf', 'image/png', 'image/jpeg'].includes(mimeType);

  if (isVisual) {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Извлеки весь текст из документа "${fileName}" и верни его как есть, без изменений. Если документ содержит таблицы — сохрани структуру через табуляцию. Не добавляй комментариев.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  // Для не-визуальных форматов (docx, txt) — передаём base64 как текст с инструкцией
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: `Ниже находится base64-закодированный файл "${fileName}" (${mimeType}). Декодируй и извлеки весь текстовый контент. Верни только текст документа.\n\n${base64.slice(0, 8000)}`,
      },
    ],
    max_tokens: 4096,
  });
  return response.choices[0]?.message?.content ?? '';
}

/**
 * Pipeline: обрабатывает все документы проекта.
 * Создаёт/обновляет записи в document_extractions.
 */
export async function runExtractionPipeline(projectId: string): Promise<void> {
  const supabase = createAdminClient();

  // Получаем все документы проекта
  const { data: documents, error: docsError } = await supabase
    .from('project_documents')
    .select('id, file_path, file_name, bucket')
    .eq('project_id', projectId);

  if (docsError || !documents || documents.length === 0) return;

  for (const doc of documents) {
    // Создаём запись со статусом processing
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
}
```

---

## Шаг 4 — API route для запуска pipeline

Создать `app/api/ai/extract/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { runExtractionPipeline } from '@/lib/ai/extract';

// Этот route вызывается внутренне (из submit) или вручную модератором.
// Защита: проверяем что проект в статусе submitted/under_review.
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

  // Запускаем pipeline без ожидания (fire-and-forget)
  runExtractionPipeline(projectId).catch((err: unknown) => {
    console.error('[AI Extract] pipeline error:', err);
  });

  return NextResponse.json({ ok: true, message: 'extraction started' });
}
```

---

## Шаг 5 — Интеграция с submit API

Обновить `app/api/project/submit/route.ts` — после успешного обновления статуса добавить fire-and-forget вызов extract pipeline.

Найти в файле строку `return NextResponse.json({ status: 'submitted' });` и добавить перед ней:

```typescript
  // Запускаем AI-извлечение текста асинхронно
  const extractUrl = new URL('/api/ai/extract', request.url);
  fetch(extractUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: project.id }),
  }).catch(() => {/* fire-and-forget */});
```

Также добавить параметр `request: NextRequest` к функции POST и импортировать `NextRequest`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
// ...
export async function POST(request: NextRequest) {
```

---

## Шаг 6 — Тесты

Создать `__tests__/t5.test.ts`:

```typescript
import type { ExtractionStatus, DocumentExtraction } from '@/types';

describe('T5 ExtractionStatus type', () => {
  it('pending is valid', () => {
    const s: ExtractionStatus = 'pending';
    expect(s).toBe('pending');
  });

  it('all statuses are valid', () => {
    const statuses: ExtractionStatus[] = ['pending', 'processing', 'done', 'error'];
    expect(statuses).toHaveLength(4);
  });

  it('done comes after processing in flow', () => {
    const flow: ExtractionStatus[] = ['pending', 'processing', 'done'];
    expect(flow.indexOf('done')).toBeGreaterThan(flow.indexOf('processing'));
  });
});

describe('T5 DocumentExtraction shape', () => {
  it('done extraction has text', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'done',
      extracted_text: 'Some extracted text',
      error_message: null,
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(extraction.status).toBe('done');
    expect(extraction.extracted_text).toBeTruthy();
    expect(extraction.error_message).toBeNull();
  });

  it('error extraction has error_message', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'error',
      extracted_text: null,
      error_message: 'Storage download failed',
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:05:00Z',
    };
    expect(extraction.status).toBe('error');
    expect(extraction.error_message).toBeTruthy();
  });

  it('pending extraction has no text', () => {
    const extraction: DocumentExtraction = {
      id: 'uuid-1',
      document_id: 'uuid-2',
      project_id: 'uuid-3',
      status: 'pending',
      extracted_text: null,
      error_message: null,
      created_at: '2026-06-27T10:00:00Z',
      updated_at: '2026-06-27T10:00:00Z',
    };
    expect(extraction.extracted_text).toBeNull();
  });
});

describe('T5 MIME type mapping', () => {
  const mimeMap: Record<string, string> = {
    pdf:  'application/pdf',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  it('pdf maps to application/pdf', () => {
    expect(mimeMap['pdf']).toBe('application/pdf');
  });

  it('png maps to image/png', () => {
    expect(mimeMap['png']).toBe('image/png');
  });

  it('docx maps to correct MIME', () => {
    expect(mimeMap['docx']).toContain('wordprocessingml');
  });

  it('unknown extension is not in map', () => {
    expect(mimeMap['xyz']).toBeUndefined();
  });
});

describe('T5 pipeline allowed statuses', () => {
  const allowedStatuses = ['submitted', 'under_review'];

  it('submitted is allowed', () => {
    expect(allowedStatuses.includes('submitted')).toBe(true);
  });

  it('under_review is allowed', () => {
    expect(allowedStatuses.includes('under_review')).toBe(true);
  });

  it('draft is not allowed', () => {
    expect(allowedStatuses.includes('draft')).toBe(false);
  });

  it('approved is not allowed to re-extract', () => {
    expect(allowedStatuses.includes('approved')).toBe(false);
  });
});
```

---

## Шаг 7 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `supabase/migrations/005_document_extractions.sql` — таблица `document_extractions` с RLS
2. `types/index.ts` дополнен: `ExtractionStatus`, `DocumentExtraction`
3. `lib/ai/extract.ts` — утилита `runExtractionPipeline(projectId)`
4. `app/api/ai/extract/route.ts` — POST запускает pipeline
5. `app/api/project/submit/route.ts` — обновлён: после смены статуса fire-and-forget вызов `/api/ai/extract`
6. `__tests__/t5.test.ts` — все тесты проходят
7. `npm run build` — без ошибок TypeScript
8. `npm test` — все тесты проходят (t1 + t2 + t3 + t4 + t5)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/questionnaire/*` — не изменять
- `app/(project)/documents/*` — не изменять
- `app/(project)/submit/*` — не изменять
- `app/api/project/documents/*` — не изменять
- `app/api/project/questionnaire/*` — не изменять
- `app/api/project/video/*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t4.test.ts` — не изменять
- `supabase/migrations/001_*` … `004_*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T4":

```
DONE: T5
```

И в раздел "Выполненные задачи":

```
### T5 — AI Job: извлечение текста из документов, async pipeline
Создано:
- supabase/migrations/005_document_extractions.sql — таблица document_extractions + RLS
- types/index.ts — добавлены ExtractionStatus, DocumentExtraction
- lib/ai/extract.ts — runExtractionPipeline: скачивает файлы из Storage, извлекает текст через GPT-4o
- app/api/ai/extract/route.ts — POST /api/ai/extract запускает pipeline
- app/api/project/submit/route.ts — обновлён: fire-and-forget вызов AI pipeline
- __tests__/t5.test.ts — тесты
```
