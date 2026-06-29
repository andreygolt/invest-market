# T63 — Кабинет проекта: дашборд владельца (статус, статистика, быстрые действия)

## Контекст

У владельца проекта сейчас нет единой стартовой страницы в кабинете.
При входе на `/project` отображается заглушка или редирект.
Владелец вынужден переходить по разным URL чтобы понять:
- на каком этапе находится его проект (статус)
- сколько инвесторов просмотрели deal room
- сколько заявок получено
- какие обновления опубликованы

API для получения этих данных уже существуют:
- `GET /api/project/my` — данные проекта + статус
- `GET /api/project/stats` — статистика (просмотры, заявки)
- `GET /api/project/updates` — список обновлений

T63 создаёт дашборд `/project` — главную страницу кабинета проекта:
серверный компонент загружает данные, отображает карточку статуса,
счётчики активности, последние обновления и быстрые действия.

## Что нужно создать / изменить

### 1. Создать `app/(project)/dashboard/page.tsx`

Серверный компонент — главная страница кабинета проекта.

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectDashboardClient } from './project-dashboard-client'
import type { ProjectRow, ProjectStats, ProjectUpdate } from '@/types'

export default async function ProjectDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Параллельная загрузка данных
  const [projectRes, statsRes, updatesRes] = await Promise.all([
    fetch(`${appUrl}/api/project/my`, {
      headers: { Cookie: '' }, // заменяется реальными cookies ниже
      cache: 'no-store',
    }),
    fetch(`${appUrl}/api/project/stats`, { cache: 'no-store' }),
    fetch(`${appUrl}/api/project/updates`, { cache: 'no-store' }),
  ])

  // Прямой запрос через supabase (без HTTP, RLS применяется через user session)
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, created_at, category, short_description')
    .eq('user_id', user.id)
    .maybeSingle()

  const { data: statsRow } = await supabase
    .from('project_view_stats')   // или прямой подсчёт ниже
    .select('views_count, applications_count')
    .eq('project_id', project?.id ?? '')
    .maybeSingle()

  // Если view нет — считаем напрямую
  let viewsCount = statsRow?.views_count ?? 0
  let applicationsCount = statsRow?.applications_count ?? 0

  if (!statsRow && project?.id) {
    const [{ count: views }, { count: apps }] = await Promise.all([
      supabase
        .from('deal_room_views')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id),
      supabase
        .from('investor_applications')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id),
    ])
    viewsCount = views ?? 0
    applicationsCount = apps ?? 0
  }

  // Последние 3 обновления
  const { data: updates } = project?.id
    ? await supabase
        .from('project_updates')
        .select('id, title, created_at, ai_summary')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(3)
    : { data: [] }

  return (
    <ProjectDashboardClient
      project={project ?? null}
      viewsCount={viewsCount}
      applicationsCount={applicationsCount}
      recentUpdates={updates ?? []}
    />
  )
}
```

**Важно:** не использовать `fetch` к собственным API в серверных компонентах (петля).
Вместо этого — прямые запросы через Supabase-клиент (как показано выше).
Если таблица `deal_room_views` называется иначе — прочитай существующий
`app/api/investor/deals/[id]/view/route.ts` чтобы найти правильное имя таблицы.
Если таблица `project_updates` называется иначе — прочитай `app/api/project/updates/route.ts`.

### 2. Создать `app/(project)/dashboard/project-dashboard-client.tsx`

Клиентский компонент — отображает данные дашборда.

```tsx
'use client'

import Link from 'next/link'
import { Disclaimer } from '@/components/disclaimer'

// Статус → человекочитаемая метка и цвет
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:     { label: 'Черновик',          color: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'На модерации',      color: 'bg-yellow-100 text-yellow-800' },
  approved:  { label: 'Опубликован',       color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Отклонён',          color: 'bg-red-100 text-red-700' },
  ai_review: { label: 'AI-анализ',         color: 'bg-blue-100 text-blue-700' },
}

interface RecentUpdate {
  id: string
  title: string
  created_at: string
  ai_summary?: string | null
}

interface ProjectDashboardClientProps {
  project: {
    id: string
    name: string
    status: string
    created_at: string
    category?: string | null
    short_description?: string | null
  } | null
  viewsCount: number
  applicationsCount: number
  recentUpdates: RecentUpdate[]
}

export function ProjectDashboardClient({
  project,
  viewsCount,
  applicationsCount,
  recentUpdates,
}: ProjectDashboardClientProps) {
  if (!project) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-xl font-semibold mb-4">Проект не найден</h1>
        <p className="text-sm text-gray-500 mb-6">
          У вашего аккаунта нет зарегистрированного проекта.
        </p>
        <Link
          href="/questionnaire"
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm text-white"
        >
          Заполнить анкету
        </Link>
      </div>
    )
  }

  const statusMeta = STATUS_LABELS[project.status] ?? {
    label: project.status,
    color: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Заголовок + статус */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.category && (
            <p className="text-sm text-gray-500 mt-1">{project.category}</p>
          )}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusMeta.color}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* Счётчики */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-5">
          <p className="text-3xl font-bold">{viewsCount}</p>
          <p className="text-sm text-gray-500 mt-1">Просмотров deal room</p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-3xl font-bold">{applicationsCount}</p>
          <p className="text-sm text-gray-500 mt-1">Заявок от инвесторов</p>
        </div>
      </div>

      {/* Дисклеймер */}
      <Disclaimer />

      {/* Быстрые действия */}
      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          {(project.status === 'draft' || project.status === 'rejected') && (
            <Link
              href="/questionnaire"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Редактировать анкету
            </Link>
          )}
          {project.status === 'draft' && (
            <Link
              href="/submit"
              className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-700"
            >
              Отправить на модерацию
            </Link>
          )}
          {project.status === 'approved' && (
            <Link
              href="/updates"
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Опубликовать обновление
            </Link>
          )}
          <Link
            href="/documents"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Документы
          </Link>
        </div>
      </div>

      {/* Последние обновления */}
      {recentUpdates.length > 0 && (
        <div className="rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Последние обновления</h2>
            <Link href="/updates" className="text-xs text-gray-500 hover:underline">
              Все обновления
            </Link>
          </div>
          <ul className="space-y-3">
            {recentUpdates.map((upd) => (
              <li key={upd.id} className="text-sm">
                <p className="font-medium">{upd.title}</p>
                {upd.ai_summary && (
                  <p className="text-gray-500 text-xs mt-0.5 line-clamp-2">{upd.ai_summary}</p>
                )}
                <p className="text-gray-400 text-xs mt-0.5">
                  {new Date(upd.created_at).toLocaleDateString('ru-RU')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
```

### 3. Обновить `app/(project)/layout.tsx`

Прочитать файл. Найти или создать навигационную ссылку на дашборд.
В существующем layout добавить ссылку «Главная» / «Дашборд» → `/dashboard`
если такой ссылки нет.

Если в layout ссылки `/project` указывают на корень — добавить ссылку `/dashboard`.

### 4. Обновить `app/layout.tsx` или `middleware.ts` (только если нужен редирект)

Если `/project` сейчас редиректит на страницу-заглушку — проверить middleware.ts
и обновить редирект с `/project` на `/dashboard` для роли `project`.

**Важно:** читать файлы перед изменением. Не трогать роуты других ролей.

### 5. Обновить `types/index.ts`

Добавить тип для данных дашборда проекта:

```typescript
export interface ProjectDashboardData {
  project: {
    id: string
    name: string
    status: string
    created_at: string
    category?: string | null
    short_description?: string | null
  } | null
  viewsCount: number
  applicationsCount: number
  recentUpdates: Array<{
    id: string
    title: string
    created_at: string
    ai_summary?: string | null
  }>
}
```

### 6. Создать `__tests__/t63.test.ts`

```typescript
// ProjectDashboardClient
// 1.  рендерится без проекта — показывает "Проект не найден" и ссылку на анкету
// 2.  рендерится с проектом в статусе draft — показывает "Черновик"
// 3.  рендерится с проектом в статусе submitted — показывает "На модерации"
// 4.  рендерится с проектом в статусе approved — показывает "Опубликован"
// 5.  рендерится с проектом в статусе rejected — показывает "Отклонён"
// 6.  отображает viewsCount в счётчике просмотров
// 7.  отображает applicationsCount в счётчике заявок
// 8.  в статусе draft показывает кнопку "Отправить на модерацию"
// 9.  в статусе draft показывает кнопку "Редактировать анкету"
// 10. в статусе rejected показывает кнопку "Редактировать анкету"
// 11. в статусе approved показывает кнопку "Опубликовать обновление"
// 12. в статусе submitted НЕ показывает кнопку "Отправить на модерацию"
// 13. отображает список recentUpdates если они есть
// 14. не рендерит секцию обновлений если recentUpdates пустой
// 15. отображает ai_summary обновления если есть
// 16. содержит ссылку на /documents в быстрых действиях (для любого статуса)
```

#### Структура тестов

```typescript
import { render, screen } from '@testing-library/react'
import { ProjectDashboardClient } from '@/app/(project)/dashboard/project-dashboard-client'

const mockProject = {
  id: 'proj-1',
  name: 'Test Project',
  status: 'draft',
  created_at: '2026-01-01T00:00:00Z',
  category: 'FinTech',
  short_description: 'Test desc',
}

const mockUpdates = [
  {
    id: 'upd-1',
    title: 'Первое обновление',
    created_at: '2026-01-15T00:00:00Z',
    ai_summary: 'AI summary текст',
  },
]

// Мок Disclaimer
jest.mock('@/components/disclaimer', () => ({
  Disclaimer: () => <div data-testid="disclaimer">Disclaimer</div>,
}))

// Мок next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))
```

## Файлы для создания / изменения

- `app/(project)/dashboard/page.tsx` (новый)
- `app/(project)/dashboard/project-dashboard-client.tsx` (новый)
- `app/(project)/layout.tsx` (обновить: добавить ссылку на /dashboard)
- `types/index.ts` (добавить ProjectDashboardData)
- `__tests__/t63.test.ts` (новый)

Опционально (только если мешает навигации):
- `middleware.ts` (обновить редирект роли project на /dashboard)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не использовать fetch к собственным API из серверных компонентов — только Supabase-клиент
- Читать существующие файлы перед изменением, чтобы найти правильные имена таблиц
- Не трогать логику существующих API routes
- Дисклеймер обязателен (использовать компонент `<Disclaimer />` из components/disclaimer.tsx)
- Не трогать файлы других модулей кроме указанных

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t63.test.ts)
4. Страница `/dashboard` в кабинете проекта отображает статус, счётчики и быстрые действия
5. Быстрые действия зависят от статуса проекта (draft → отправить; approved → обновление)
6. Если проекта нет — страница показывает ссылку на анкету без ошибок
7. Записать в `progress.md`: `DONE: T63 + что создано/изменено`
