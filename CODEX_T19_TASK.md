# CODEX TASK T19 — AI Underwriting Report для администратора

## Цель

Расширить страницу модерации проекта полным AI-андеррайтинговым отчётом:
показать `draft_card` (черновик карточки проекта), список документов с
их статусами извлечения, добавить кнопку «Перезапустить AI-анализ».
Добавить два новых API endpoint для администратора.

## Контекст

Уже существует:
- `lib/ai/analyze.ts` — `runAnalysisPipeline` сохраняет отчёт в `ai_reports`
  с полями: `red_flags`, `missing_data`, `draft_card`, `ai_score`, `summary`
- `app/(admin)/moderation/[id]/page.tsx` — показывает `summary`, `red_flags`,
  `missing_data`, `ai_score` — **но НЕ показывает `draft_card`**
- `types/index.ts` — `AIAnalysisReport`, `AIReportRow` уже определены
- Таблица `document_extractions` (T5) — хранит статусы извлечения текста
- Таблица `project_documents` (T3) — список загруженных документов
- `lib/supabase/admin.ts` — `createAdminClient`
- Нет API endpoint для получения/перезапуска AI-отчёта

T19 добавляет: два API endpoint + UI улучшения страницы модерации.

## Что создать

### 1. API — GET AI-отчёта

**Файл:** `app/api/admin/projects/[id]/ai-report/route.ts`

**GET** `/api/admin/projects/[id]/ai-report`

- Проверить роль: `admin`, `superadmin`, `moderator` (через `createServerClient`)
- Загрузить из `ai_reports` запись по `project_id = [id]`
- Загрузить из `project_documents` список документов проекта:
  `id, file_name, document_type, created_at`
- Загрузить из `document_extractions` статусы по `project_id`:
  `document_id, status, created_at`
- Вернуть `200`:
  ```json
  {
    "report": AIReportRow | null,
    "documents": [
      {
        "id": "uuid",
        "file_name": "string",
        "document_type": "string",
        "extraction_status": "pending" | "processing" | "done" | "error" | null
      }
    ]
  }
  ```
- `401` если нет сессии, `403` если неверная роль

### 2. API — POST (перезапуск AI-анализа)

**Файл:** `app/api/admin/projects/[id]/ai-report/route.ts` (тот же файл, добавить POST)

**POST** `/api/admin/projects/[id]/ai-report`

- Проверить роль: `admin`, `superadmin`
- Проверить что проект существует (SELECT из `projects` по `id`)
- Fire-and-forget: вызвать `runAnalysisPipeline(projectId)` из `lib/ai/analyze.ts`
- Вернуть `202 { message: "AI-анализ запущен" }`
- `401` если нет сессии, `403` если неверная роль, `404` если проект не найден

### 3. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец (не трогать существующее):

```ts
// T19 — Admin AI Report
export interface AdminReportDocument {
  id: string
  file_name: string
  document_type: string
  extraction_status: string | null
}

export interface AdminAIReportResponse {
  report: AIReportRow | null
  documents: AdminReportDocument[]
}
```

### 4. UI — Улучшение страницы модерации проекта

**Файл:** `app/(admin)/moderation/[id]/page.tsx`

Изучи существующий файл перед редактированием. Добавить в UI:

#### 4.1 Черновик карточки инвестора (draft_card)

Добавить новый `Card` после блока AI-анализа (после существующего `Card` с red_flags/missing_data):

```
Черновик карточки для инвесторов
[Показать только если aiReport.status === 'done' && report.draft_card]
<pre> блок с текстом draft_card </pre>
Подзаголовок (серый): «Автоматически сгенерировано AI на основе анкеты и документов»
```

#### 4.2 Документы и статусы извлечения

Добавить новый `Card` «Загруженные документы» после черновика карточки.

Загрузить данные через `GET /api/admin/projects/[id]/ai-report` на стороне сервера
(используя `createAdminClient` напрямую в серверном компоненте — так же, как уже
загружаются `project`, `questionnaire`, `aiReport`).

Для каждого документа:
- Имя файла (file_name)
- Тип документа (document_type)
- Статус извлечения: Badge с цветом по статусу:
  - `done` → `default` (зелёный)
  - `processing` → `secondary`
  - `error` → `destructive`
  - `pending` / `null` → `outline`

Пустое состояние: «Документы не загружены»

#### 4.3 Кнопка «Перезапустить AI-анализ»

**Файл:** `app/(admin)/moderation/[id]/rerun-analysis-button.tsx`

Клиентский компонент (`'use client'`):

```tsx
// Props: projectId: string
// Кнопка «Перезапустить AI-анализ» (variant="outline")
// При клике: POST /api/admin/projects/[id]/ai-report
// Состояния: loading ("Запускаем..."), success ("Анализ запущен — обновите страницу")
// При ошибке: показать текст ошибки рядом с кнопкой
// Использует fetch, useState, shadcn Button
```

Добавить `<RerunAnalysisButton projectId={project.id} />` в `page.tsx`
после блока AI-анализа (перед блоком анкеты).

### 5. Тесты

**Файл:** `__tests__/t19.test.ts`

Тесты (мок Supabase как в предыдущих тестах):

1. `GET /api/admin/projects/[id]/ai-report` — `401` без авторизации
2. `GET /api/admin/projects/[id]/ai-report` — `403` с ролью `investor`
3. `GET /api/admin/projects/[id]/ai-report` — `200` с ролью `admin`, возвращает
   `{ report, documents }`
4. `POST /api/admin/projects/[id]/ai-report` — `401` без авторизации
5. `POST /api/admin/projects/[id]/ai-report` — `403` с ролью `moderator`
6. `POST /api/admin/projects/[id]/ai-report` — `404` если проект не найден
7. `POST /api/admin/projects/[id]/ai-report` — `202` с ролью `admin`, проект найден
8. Тип `AdminReportDocument` имеет поля `id`, `file_name`, `document_type`,
   `extraction_status`
9. Тип `AdminAIReportResponse` имеет поля `report` и `documents`

Паттерн мока: `jest.mock('@/lib/supabase/server', ...)` и
`jest.mock('@/lib/ai/analyze', () => ({ runAnalysisPipeline: jest.fn() }))`
как в t6.test.ts, t17.test.ts.

## Что НЕ делать

- Не добавлять новые npm-зависимости (в том числе markdown-рендерер)
- Не изменять существующие миграции
- Не трогать `lib/ai/analyze.ts` — только импортировать `runAnalysisPipeline`
- Не удалять и не переписывать существующий код в `moderation/[id]/page.tsx` —
  только добавлять новые секции
- Не делать WebSocket/polling для статуса анализа — только статичная кнопка

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t19.test.ts)
4. `/moderation/[id]` — показывает `draft_card`, список документов с extraction status
5. `/moderation/[id]` — кнопка «Перезапустить AI-анализ» вызывает POST и показывает статус
6. `GET /api/admin/projects/[id]/ai-report` — возвращает отчёт + документы
7. `POST /api/admin/projects/[id]/ai-report` — запускает pipeline и возвращает 202
8. Запись в `progress.md`: `DONE: T19 + список созданных/изменённых файлов`
