# CODEX TASK T18 — Динамика проекта: обновления, AI-summary

## Цель

Создать механизм публикации обновлений от проектов (news feed) и автоматической
AI-генерации краткого резюме обновлений. Инвестор видит ленту новостей проекта
в deal room. Проект публикует обновления из своего кабинета.

## Контекст

Уже существует:
- `projects` таблица со статусами (T4)
- Deal room для инвестора: `app/(investor)/deals/[id]/page.tsx` (T9)
- AI pipeline: `lib/ai/extract.ts`, `lib/ai/analyze.ts` (T5, T6)
- API для проекта: `app/api/project/` (T3, T4)
- Типы: `types/index.ts`

T18 добавляет: таблицу обновлений, API, AI-summary, UI.

## Что создать

### 1. Миграция БД

**Файл:** `supabase/migrations/009_project_updates.sql`

```sql
-- Таблица обновлений проекта
CREATE TABLE IF NOT EXISTS project_updates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  ai_summary    TEXT,                          -- AI-резюме обновления (NULL пока не сгенерировано)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

-- Проект видит только свои обновления
CREATE POLICY "project sees own updates"
  ON project_updates FOR ALL
  USING (
    project_id = (
      SELECT id FROM projects WHERE user_id = auth.uid() LIMIT 1
    )
  );

-- Инвесторы читают обновления только approved проектов
CREATE POLICY "investor reads updates of approved projects"
  ON project_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_updates.project_id
        AND projects.status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('investor', 'admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Admins full access
CREATE POLICY "admin full access project_updates"
  ON project_updates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );
```

### 2. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец (не трогать существующее):

```ts
// T18 — Project Updates
export interface ProjectUpdate {
  id: string
  project_id: string
  title: string
  body: string
  ai_summary: string | null
  created_at: string
  updated_at: string
}

export type ProjectUpdateInsert = Pick<ProjectUpdate, 'title' | 'body'>
```

### 3. API routes

#### 3.1 POST и GET обновлений от имени проекта

**Файл:** `app/api/project/updates/route.ts`

**GET** — возвращает список обновлений текущего проекта (сортировка `created_at DESC`):
- Проверить сессию через `createServerClient`
- Найти `project_id` по `user_id`
- Вернуть массив `ProjectUpdate[]`

**POST** — создать новое обновление:
- Тело: `{ title: string, body: string }`
- Валидация: `title` не пустой (max 200 символов), `body` не пустой (max 5000 символов)
- Вставить запись в `project_updates`
- Fire-and-forget: вызов AI-summary pipeline (см. п.4)
- Вернуть созданную запись

#### 3.2 GET обновлений конкретного проекта для инвестора

**Файл:** `app/api/investor/deals/[id]/updates/route.ts`

**GET** — список обновлений проекта для инвестора:
- Проверить роль `investor` (или admin/moderator)
- `[id]` — это `project_id`
- Вернуть `ProjectUpdate[]` сортировка `created_at DESC`
- Лимит 50 записей

#### 3.3 DELETE обновления (проект удаляет своё обновление)

**Файл:** `app/api/project/updates/[id]/route.ts`

**DELETE** — удалить обновление:
- Проверить что обновление принадлежит проекту текущего пользователя
- Удалить и вернуть `{ success: true }`

### 4. AI-summary pipeline

**Файл:** `lib/ai/updates.ts`

Функция `generateUpdateSummary(updateId: string): Promise<void>`:

```ts
// Загружает обновление из БД (title + body)
// Вызывает OpenAI GPT-4o:
//   system: "Ты ассистент инвестиционной платформы. Создай краткое резюме
//            обновления проекта в 1-2 предложениях для инвестора."
//   user: `Заголовок: {title}\n\nТекст: {body}`
// Сохраняет результат в поле ai_summary
// При ошибке — логирует, не бросает (fire-and-forget)
```

Использует `createAdminClient` из `lib/supabase/admin.ts` (как в T5/T6).
Использует `process.env.OPENAI_API_KEY` для OpenAI (как в T5/T6).

### 5. UI — Кабинет проекта: страница обновлений

**Файл:** `app/(project)/updates/page.tsx`

Серверный компонент. Рендерит `UpdatesClient`.

**Файл:** `app/(project)/updates/updates-client.tsx`

Клиентский компонент (`'use client'`):

#### 5.1 Форма публикации обновления

shadcn Card с полями:
- `Input` — Заголовок (placeholder: «Краткий заголовок обновления», max 200 символов)
- `Textarea` — Текст обновления (placeholder: «Подробное описание…», max 5000 символов)
- Кнопка «Опубликовать»

При отправке — `POST /api/project/updates`. После успеха — очистить форму и обновить список.

#### 5.2 Список опубликованных обновлений

Загружается через `GET /api/project/updates`. Для каждого обновления:

shadcn Card:
- Заголовок обновления (жирный)
- Дата публикации (локальный формат)
- Текст обновления
- Блок AI-резюме: если `ai_summary !== null` — показать с подписью «AI-резюме:» (серый текст).
  Если `null` — показать «Резюме генерируется…» (серый muted текст)
- Кнопка «Удалить» (удаляет через `DELETE /api/project/updates/{id}`, подтверждение не нужно)

Пустое состояние: «Обновлений ещё нет. Опубликуйте первое!»

### 6. UI — Deal Room: лента обновлений для инвестора

**Файл:** `app/(investor)/deals/[id]/page.tsx`

Добавить секцию «Обновления проекта» после существующих блоков.

Загружает `GET /api/investor/deals/{id}/updates` и рендерит список:

Для каждого обновления (shadcn Card):
- Заголовок обновления
- Дата публикации
- Текст обновления
- AI-резюме (если есть): выделить рамкой или цветным бэкграундом, подпись «Краткое резюме»

Пустое состояние: «Проект ещё не публиковал обновлений.»

**ВАЖНО:** Изучи существующий `app/(investor)/deals/[id]/page.tsx` перед редактированием,
чтобы органично вписать новую секцию. Не ломай существующую структуру страницы.

### 7. Навигация в кабинете проекта

Изучи существующий layout `app/(project)/layout.tsx` и добавь ссылку «Обновления» → `/updates`.

### 8. Тесты

**Файл:** `__tests__/t18.test.ts`

Тесты (мок Supabase как в предыдущих тестах):

1. `POST /api/project/updates` — 401 без авторизации
2. `POST /api/project/updates` — 400 если `title` пустой
3. `POST /api/project/updates` — 400 если `body` пустой
4. `POST /api/project/updates` — 201 с валидными данными (mock Supabase возвращает созданный объект)
5. `GET /api/project/updates` — 401 без авторизации
6. `GET /api/project/updates` — 200 возвращает массив `ProjectUpdate[]`
7. `DELETE /api/project/updates/[id]` — 401 без авторизации
8. `DELETE /api/project/updates/[id]` — 200 успешное удаление
9. `GET /api/investor/deals/[id]/updates` — 401 без авторизации
10. `GET /api/investor/deals/[id]/updates` — 200 возвращает обновления проекта
11. Тип `ProjectUpdate` имеет поля `id`, `project_id`, `title`, `body`, `ai_summary`, `created_at`
12. `generateUpdateSummary` вызывает OpenAI и сохраняет `ai_summary` (мок OpenAI)

Паттерн мока: `jest.mock('@/lib/supabase/server', ...)` и `jest.mock('@/lib/supabase/admin', ...)`
как в t16.test.ts, t17.test.ts.

## Что НЕ делать

- Не добавлять новые npm-зависимости
- Не изменять существующие миграции (только добавлять)
- Не трогать AI pipeline из T5/T6 — только добавить новый файл `lib/ai/updates.ts`
- Не добавлять загрузку файлов/медиа к обновлениям (только текст)
- Не реализовывать уведомления по email/push — только отображение в UI

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t18.test.ts)
4. `/updates` (кабинет проекта) — можно публиковать обновления и видеть список с AI-резюме
5. `/deals/[id]` (deal room) — инвестор видит секцию «Обновления проекта»
6. Навигация в кабинете проекта обновлена
7. Запись в `progress.md`: `DONE: T18 + список созданных/изменённых файлов`
