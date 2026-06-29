# T80 — Уведомление модераторов при завершении AI-анализа проекта

## Контекст

T79 завершил цепочку уведомлений при публикации обновлений проекта.

Однако в AI-андеррайтинговом pipeline существует пробел:
- Проект отправлен на модерацию → модераторы уведомлены «Новый проект на модерацию» ✓ (T71)
- `runAnalysisPipeline` запускается fire-and-forget (асинхронно) и может занять минуты
- AI-анализ завершён (`status → done`) → **модераторы НЕ получают уведомление** ✗
- Модераторы узнают о готовности отчёта только при ручном заходе на `/moderation/[id]`

Сейчас модератор получает уведомление только о факте подачи заявки.
Но полезная информация (AI-score, red flags, summary) становится доступна позже —
после завершения асинхронного анализа. Без уведомления модераторы не знают,
когда AI-отчёт готов для принятия решения.

Текущее состояние в `lib/ai/analyze.ts`:
- После успешного анализа: `status → done`, сохраняется `report` — **уведомление не отправляется** ✗
- После ошибки анализа: `status → error` — **уведомление не отправляется** ✗

Инфраструктура уведомлений уже существует (T47–T62, T71–T79):
- `notifications` таблица
- `createAdminClient` в `lib/supabase/admin.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-ai-analysis-done.ts`

Хелпер уведомляет всех модераторов/администраторов/суперадминов о завершении
AI-анализа проекта. Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить модераторов о завершении AI-анализа проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyAiAnalysisDone(params: {
  projectId: string
  projectName: string
  baseUrl: string
}): Promise<void> {
  const { projectId, projectName, baseUrl } = params
  const admin = createAdminClient()

  try {
    const { data: moderators } = await admin
      .from('profiles')
      .select('id')
      .in('role', ['moderator', 'admin', 'superadmin'])

    if (!moderators || moderators.length === 0) return

    const title = 'AI-анализ проекта завершён'
    const body = `AI-отчёт по проекту «${projectName}» готов к рассмотрению.`
    const link = `/moderation/${projectId}`

    const rows = (moderators as { id: string }[]).map((m) => ({
      user_id: m.id,
      title,
      body,
      link,
    }))

    const { data: inserted } = await admin
      .from('notifications')
      .insert(rows)
      .select('id, user_id')

    if (!inserted) return

    // fire-and-forget email dispatch
    for (const n of inserted) {
      fetch(`${baseUrl}/api/notifications/dispatch-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: n.id, userId: n.user_id }),
      }).catch(() => {/* ignore */})
    }
  } catch {
    // fire-and-forget: не пробрасывать ошибки
  }
}
```

### 2. Обновить `lib/ai/analyze.ts`

Прочитать файл целиком. В функции `runAnalysisPipeline`, после успешного обновления
статуса на `done` (после строки `await supabase.from('ai_reports').update({ status: 'done', ... })`),
добавить вызов `notifyAiAnalysisDone`.

Для получения `projectName` нужно добавить запрос к `projects` в начало пайплайна:

```typescript
import { notifyAiAnalysisDone } from '@/lib/notifications/notify-ai-analysis-done'

// В runAnalysisPipeline, после создания/upsert записи ai_report:
const { data: projectRow } = await supabase
  .from('projects')
  .select('name')
  .eq('id', projectId)
  .maybeSingle()

const projectName = (projectRow as { name?: string | null } | null)?.name ?? 'Без названия'

// ... существующая логика ...

// После успешного update status → done:
notifyAiAnalysisDone({
  projectId,
  projectName,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:**
- Читать файл перед изменением
- Не менять существующую логику pipeline (collectProjectData, createAnalysisCompletion, upsert ai_report)
- `notifyAiAnalysisDone` вызывать ТОЛЬКО при успешном завершении (`status → done`)
- При ошибке (`status → error`) уведомление НЕ отправлять
- Не await — fire-and-forget

### 3. Создать `__tests__/t80.test.ts`

```typescript
// notifyAiAnalysisDone (unit-тесты хелпера)
// 1.  нет модераторов (moderators = []) → не вызывает insert (ранний return)
// 2.  нет модераторов (moderators = null) → не вызывает insert (ранний return)
// 3.  title всегда 'AI-анализ проекта завершён'
// 4.  body содержит имя проекта
// 5.  link = '/moderation/{projectId}'
// 6.  вставляет по одной строке на каждого модератора
// 7.  после вставки вызывает fetch для dispatch-email (по одному разу на notification)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)
// 9.  запрашивает profiles с ролями moderator, admin, superadmin
// 10. при нескольких модераторах — вставляет несколько строк

// runAnalysisPipeline (интеграция)
// 11. при успешном анализе (status → done) — вызывает notifyAiAnalysisDone (mock)
// 12. notifyAiAnalysisDone получает корректный projectId
// 13. при ошибке анализа (статус → error) — notifyAiAnalysisDone НЕ вызывается
// 14. при upsert error (нет ai_report) — notifyAiAnalysisDone НЕ вызывается
```

#### Структура тестов

```typescript
import { notifyAiAnalysisDone } from '@/lib/notifications/notify-ai-analysis-done'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      // По умолчанию возвращает 2 модератора
    })),
  })),
}))

// Для тестов runAnalysisPipeline:
jest.mock('@/lib/notifications/notify-ai-analysis-done', () => ({
  notifyAiAnalysisDone: jest.fn().mockResolvedValue(undefined),
}))
```

Для теста «нет модераторов» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    in:     jest.fn().mockResolvedValue({ data: [], error: null }),
    insert: jest.fn().mockReturnThis(),
  })),
})
```

Для тестов `runAnalysisPipeline` мокировать `createAdminClient` с ветвлением по таблице:
- `profiles` → возвращает список модераторов
- `ai_reports` → возвращает `{ id: 'report-uuid' }` при upsert, успешный update
- `projects` → возвращает `{ name: 'Test Project' }` при select

```typescript
// Мок для успешного анализа:
jest.mock('@/lib/ai/analyze', () => {
  const actual = jest.requireActual('@/lib/ai/analyze')
  return { ...actual }
})
// При тесте pipeline мокировать fetch → возвращать GPT ответ с валидным JSON
```

## Файлы для создания / изменения

- `lib/notifications/notify-ai-analysis-done.ts` (новый)
- `lib/ai/analyze.ts` (добавить запрос projectName + вызов notifyAiAnalysisDone после done)
- `__tests__/t80.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyAiAnalysisDone` НЕ awaitable в pipeline — не блокировать выполнение
- Не менять существующую логику pipeline (collectProjectData, createAnalysisCompletion, upsert, error handling)
- Читать `lib/ai/analyze.ts` перед изменением
- Уведомлять ТОЛЬКО при успешном анализе (`status → done`), НЕ при ошибке
- Уведомлять только роли: moderator, admin, superadmin
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T79

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t80.test.ts)
4. При успешном завершении AI-анализа — модераторы/администраторы получают уведомление «AI-анализ проекта завершён»
5. Уведомление содержит название проекта и ссылку `/moderation/{projectId}`
6. При ошибке анализа — уведомление НЕ отправляется
7. Записать в `progress.md`: `DONE: T80 + что создано/изменено`
