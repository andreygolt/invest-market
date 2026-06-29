# T51 — Трекинг просмотров Deal Room: счётчик уникальных просмотров для проекта

## Контекст

В T41 реализован блок «Интерес инвесторов» на дашборде проекта: показывается число избранных,
заявок и портфельных записей. Однако первый шаг инвестора — просто открыть Deal Room — сейчас
не фиксируется. Это самый ранний сигнал интереса, который позволяет оценить «верхнюю часть воронки»:

- Сколько инвесторов вообще смотрели на этот проект?
- Из них сколько добавили в избранное? Сколько подали заявку?
- Насколько конвертируется просмотр в заявку?

T51 добавляет учёт просмотров Deal Room: каждый раз когда авторизованный инвестор открывает
страницу `/deals/[id]`, факт просмотра фиксируется в таблице `deal_room_views`.
Проект видит счётчики «Всего просмотров» и «Уникальных зрителей» в блоке статистики.

**Принцип:** трекинг реализуется client-компонентом (`ViewTracker`) с fire-and-forget `fetch`.
Просмотр не блокирует загрузку страницы.

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/021_deal_room_views.sql`

```sql
CREATE TABLE IF NOT EXISTS deal_room_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deal_room_views ENABLE ROW LEVEL SECURITY;

-- Инвестор может вставлять только свои просмотры
CREATE POLICY "deal_room_views_insert" ON deal_room_views
  FOR INSERT WITH CHECK (auth.uid() = investor_id);

-- SELECT только через service role (adminClient в API-роутах проекта)
-- Обычные пользователи не читают эту таблицу напрямую
```

### 2. Обновить `types/index.ts`

Добавить поля `views_count` и `unique_viewers` в существующий `ProjectStats`:

```typescript
export interface ProjectStats {
  favorites_count: number;
  portfolio_count: number;
  views_count: number;      // НОВОЕ: общее число записей просмотров
  unique_viewers: number;   // НОВОЕ: число уникальных investor_id
  applications: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    cancelled: number;
    withdrawn: number;
  };
}
```

### 3. Создать `app/api/investor/deals/[id]/view/route.ts`

POST — фиксирует просмотр авторизованного инвестора. Если проект не найден или не approved — 404.
Если не авторизован — 401. Иначе вставляет запись и возвращает `{ ok: true }`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: projectId } = await params
  const admin = createAdminClient()

  const { data: project } = await admin
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle()

  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin
    .from('deal_room_views')
    .insert({ investor_id: user.id, project_id: projectId })

  return NextResponse.json({ ok: true })
}
```

### 4. Обновить `app/api/project/stats/route.ts`

Добавить подсчёт просмотров в существующий `Promise.all`. Не изменять остальную логику роута.

Добавить в `Promise.all`:
```typescript
adminSupabase
  .from('deal_room_views')
  .select('investor_id')
  .eq('project_id', projectId),
```

Добавить извлечение результата (четвёртый элемент):
```typescript
const [
  favoritesResult,
  applicationsResult,
  portfolioResult,
  viewsResult,
] = await Promise.all([...])
```

Обновить формирование `stats`:
```typescript
const viewRows = (viewsResult.data ?? []) as { investor_id: string }[]
const stats: ProjectStats = {
  favorites_count: favoritesResult.count ?? 0,
  portfolio_count: portfolioResult.count ?? 0,
  views_count: viewRows.length,
  unique_viewers: new Set(viewRows.map((r) => r.investor_id)).size,
  applications: { ... },  // без изменений
}
```

Также добавить `viewsResult.error` в проверку ошибок:
```typescript
const firstError =
  favoritesResult.error ??
  applicationsResult.error ??
  portfolioResult.error ??
  viewsResult.error
```

### 5. Создать `app/(investor)/deals/[id]/view-tracker.tsx`

Маленький client-компонент. Монтируется при загрузке Deal Room и отправляет POST.
Не рендерит видимый DOM.

```tsx
'use client'

import { useEffect } from 'react'

interface ViewTrackerProps {
  projectId: string
}

export function ViewTracker({ projectId }: ViewTrackerProps) {
  useEffect(() => {
    void fetch(`/api/investor/deals/${projectId}/view`, { method: 'POST' })
  }, [projectId])

  return null
}
```

### 6. Обновить `app/(investor)/deals/[id]/page.tsx`

Добавить импорт `ViewTracker` и вставить компонент в JSX сразу после открывающего тега `<main>`
(или в начало возвращаемого JSX). Добавление должно быть в единственном месте:

```tsx
import { ViewTracker } from './view-tracker'

// В JSX (после проверки project !== null):
<ViewTracker projectId={project.id} />
```

### 7. Обновить `app/(project)/project/project-dashboard-client.tsx`

В блоке «Интерес инвесторов» (который показывается при `status === 'approved'`) добавить
отображение `views_count` и `unique_viewers` рядом с существующими счётчиками.

Найти место где отображаются `favorites_count` и добавить аналогичные карточки/строки:

```tsx
<div>
  <span className="text-2xl font-bold">{stats.views_count}</span>
  <span className="text-sm text-gray-500">Просмотров</span>
</div>
<div>
  <span className="text-2xl font-bold">{stats.unique_viewers}</span>
  <span className="text-sm text-gray-500">Уникальных зрителей</span>
</div>
```

### 8. Тесты `__tests__/t51.test.ts`

```typescript
// 1. POST /api/investor/deals/[id]/view — 401 без авторизации (getUser возвращает null)
// 2. POST /api/investor/deals/[id]/view — 404 если проект не найден (maybeSingle → null)
// 3. POST /api/investor/deals/[id]/view — 404 если проект не approved
// 4. POST /api/investor/deals/[id]/view — 200 { ok: true } при успешной записи
// 5. POST /api/investor/deals/[id]/view — вызывает adminClient.from('deal_room_views').insert
// 6. GET /api/project/stats — включает views_count в ответе
// 7. GET /api/project/stats — включает unique_viewers в ответе
// 8. GET /api/project/stats — views_count равен числу возвращённых строк
// 9. GET /api/project/stats — unique_viewers считает уникальные investor_id (Set)
// 10. GET /api/project/stats — unique_viewers = 1 при двух записях одного investor_id
// 11. ProjectStats тип содержит поле views_count: number
// 12. ProjectStats тип содержит поле unique_viewers: number
// 13. ViewTracker вызывает fetch('/api/investor/deals/test-id/view') при монтировании
// 14. ViewTracker возвращает null (не рендерит DOM)
// 15. POST /api/investor/deals/[id]/view — ошибка вставки в БД не ломает ответ
```

#### Структура моков

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'investor-1', email: 'investor@test.com' } },
      }),
    },
  })),
}))

const mockInsert = jest.fn().mockResolvedValue({ error: null })
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: { id: 'project-1' } })
const mockSelect = jest.fn().mockReturnThis()
const mockEq = jest.fn().mockReturnThis()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'deal_room_views') {
        return { insert: mockInsert }
      }
      // projects table
      return {
        select: mockSelect,
        eq: mockEq,
        maybeSingle: mockMaybeSingle,
      }
    }),
  })),
}))
```

## Файлы для создания / изменения

- `supabase/migrations/021_deal_room_views.sql` (новый) — таблица + RLS
- `types/index.ts` — добавить `views_count`, `unique_viewers` в `ProjectStats`
- `app/api/investor/deals/[id]/view/route.ts` (новый) — POST запись просмотра
- `app/api/project/stats/route.ts` — добавить подсчёт просмотров
- `app/(investor)/deals/[id]/view-tracker.tsx` (новый) — client-компонент трекинга
- `app/(investor)/deals/[id]/page.tsx` — добавить `<ViewTracker />`
- `app/(project)/project/project-dashboard-client.tsx` — показать views_count и unique_viewers
- `__tests__/t51.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Миграция только аддитивная (новая таблица)
- RLS обязателен на `deal_room_views`
- Просмотр записывается fire-and-forget — не блокирует загрузку страницы
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t51.test.ts)
4. `POST /api/investor/deals/[id]/view` — записывает просмотр, возвращает `{ ok: true }`
5. `GET /api/project/stats` — возвращает `views_count` и `unique_viewers`
6. Deal Room страница содержит `<ViewTracker />`, который вызывает API при загрузке
7. Дашборд проекта показывает «Просмотров» и «Уникальных зрителей» при `status = 'approved'`
8. Записать в `progress.md`: `DONE: T51 + что создано/изменено`
