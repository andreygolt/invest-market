# T52 — Admin: воронка конверсии по проектам

## Контекст

В T51 добавлен трекинг просмотров Deal Room (`deal_room_views`). Теперь платформа
фиксирует все ключевые события по каждому проекту:

| Событие        | Таблица                    | Что считаем          |
|----------------|----------------------------|----------------------|
| Просмотр       | `deal_room_views`          | views_count, unique_viewers |
| Избранное      | `investor_favorites`       | favorites_count      |
| Заявка         | `investor_applications`    | applications_count   |
| Портфель       | `investor_portfolio`       | portfolio_count      |

Эти данные существуют разрозненно. Администратор не может видеть их в одном месте
и сравнивать проекты между собой.

T52 добавляет страницу **«Воронка»** в панели администратора (`/admin/dashboard` →
отдельная страница `/admin/funnel`). На странице: таблица всех одобренных проектов,
отсортированная по просмотрам, с колонками воронки и процентами конверсии:

```
Проект | Просмотры | Уник. | Избранное | Заявки | Conv. (views→apps)
```

**Принцип:** один API-эндпоинт агрегирует данные через JOIN/подзапросы с помощью
`createAdminClient()`. Данные только для одобренных проектов (`status = 'approved'`).

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить тип строки воронки:

```typescript
export interface FunnelRow {
  project_id: string
  project_name: string
  category: string
  views_count: number
  unique_viewers: number
  favorites_count: number
  applications_count: number
  portfolio_count: number
  conversion_rate: number  // applications_count / unique_viewers * 100, округлённое до 1 знака
}
```

### 2. Создать `app/api/admin/funnel/route.ts`

Доступ: только `admin`, `superadmin`, `moderator`.

Логика:
- Получить все одобренные проекты
- Для каждого проекта параллельно собрать агрегаты из 4 таблиц
- Вернуть массив `FunnelRow[]` отсортированный по `views_count` DESC

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { FunnelRow } from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin', 'moderator']

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // 1. Получить одобренные проекты
  const { data: projects, error: projectsError } = await admin
    .from('projects')
    .select('id, name, category')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })

  if (projectsError) {
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })
  }

  if (!projects || projects.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  const projectIds = projects.map((p) => p.id as string)

  // 2. Параллельно собрать агрегаты
  const [viewsResult, favoritesResult, applicationsResult, portfolioResult] =
    await Promise.all([
      admin
        .from('deal_room_views')
        .select('project_id, investor_id')
        .in('project_id', projectIds),
      admin
        .from('investor_favorites')
        .select('project_id')
        .in('project_id', projectIds),
      admin
        .from('investor_applications')
        .select('project_id')
        .in('project_id', projectIds),
      admin
        .from('investor_portfolio')
        .select('project_id')
        .in('project_id', projectIds),
    ])

  const firstError =
    viewsResult.error ??
    favoritesResult.error ??
    applicationsResult.error ??
    portfolioResult.error

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch funnel data' }, { status: 500 })
  }

  const viewRows = (viewsResult.data ?? []) as { project_id: string; investor_id: string }[]
  const favoriteRows = (favoritesResult.data ?? []) as { project_id: string }[]
  const applicationRows = (applicationsResult.data ?? []) as { project_id: string }[]
  const portfolioRows = (portfolioResult.data ?? []) as { project_id: string }[]

  // 3. Агрегировать по project_id
  const rows: FunnelRow[] = projects.map((p) => {
    const pid = p.id as string
    const projectViews = viewRows.filter((r) => r.project_id === pid)
    const uniqueViewers = new Set(projectViews.map((r) => r.investor_id)).size
    const applicationsCount = applicationRows.filter((r) => r.project_id === pid).length
    const conversionRate =
      uniqueViewers > 0
        ? Math.round((applicationsCount / uniqueViewers) * 1000) / 10
        : 0

    return {
      project_id: pid,
      project_name: (p.name ?? '') as string,
      category: (p.category ?? '') as string,
      views_count: projectViews.length,
      unique_viewers: uniqueViewers,
      favorites_count: favoriteRows.filter((r) => r.project_id === pid).length,
      applications_count: applicationsCount,
      portfolio_count: portfolioRows.filter((r) => r.project_id === pid).length,
      conversion_rate: conversionRate,
    }
  })

  rows.sort((a, b) => b.views_count - a.views_count)

  return NextResponse.json({ rows })
}
```

### 3. Создать `app/(admin)/funnel/page.tsx`

Серверный компонент — проверяет роль, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FunnelClient from './funnel-client'

const ALLOWED_ROLES = ['admin', 'superadmin', 'moderator']

export default async function AdminFunnelPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    redirect('/')
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Воронка конверсии</h1>
      <FunnelClient />
    </div>
  )
}
```

### 4. Создать `app/(admin)/funnel/funnel-client.tsx`

Клиентский компонент: таблица воронки с сортировкой и индикаторами конверсии.

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { FunnelRow } from '@/types'

interface FunnelResponse {
  rows: FunnelRow[]
}

function ConversionBadge({ rate }: { rate: number }) {
  const color =
    rate >= 20 ? 'bg-green-100 text-green-800' :
    rate >= 10 ? 'bg-yellow-100 text-yellow-800' :
    'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {rate}%
    </span>
  )
}

export default function FunnelClient() {
  const [rows, setRows] = useState<FunnelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/funnel')
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setError(data.error ?? 'Ошибка загрузки данных')
          return
        }
        const data = (await res.json()) as FunnelResponse
        setRows(data.rows)
      } catch {
        setError('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Загрузка...</div>
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        Нет одобренных проектов с данными о просмотрах
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Проект</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Категория</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Просмотры</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Уник. зрители</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Избранное</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Заявки</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Портфель</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Конверсия</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.project_id} className="hover:bg-gray-50">
              <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                {row.project_name}
              </td>
              <td className="px-4 py-3 text-gray-500">{row.category}</td>
              <td className="px-4 py-3 text-right">{row.views_count}</td>
              <td className="px-4 py-3 text-right">{row.unique_viewers}</td>
              <td className="px-4 py-3 text-right">{row.favorites_count}</td>
              <td className="px-4 py-3 text-right">{row.applications_count}</td>
              <td className="px-4 py-3 text-right">{row.portfolio_count}</td>
              <td className="px-4 py-3 text-right">
                <ConversionBadge rate={row.conversion_rate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

### 5. Обновить `app/(admin)/layout.tsx`

Добавить пункт «Воронка» в навигацию (после «Журнал», не изменяя остальное):

```tsx
<Link href="/admin/funnel" className="hover:text-foreground">
  Воронка
</Link>
```

### 6. Тесты `__tests__/t52.test.ts`

```typescript
// 1. GET /api/admin/funnel — 401 без авторизации (getUser возвращает null)
// 2. GET /api/admin/funnel — 403 для роли investor
// 3. GET /api/admin/funnel — 200 для роли admin
// 4. GET /api/admin/funnel — 200 для роли superadmin
// 5. GET /api/admin/funnel — 200 для роли moderator
// 6. GET /api/admin/funnel — возвращает { rows: [] } если нет одобренных проектов
// 7. GET /api/admin/funnel — rows содержат project_id, project_name, views_count, unique_viewers
// 8. GET /api/admin/funnel — views_count равен числу записей в deal_room_views для проекта
// 9. GET /api/admin/funnel — unique_viewers считает уникальные investor_id (Set)
// 10. GET /api/admin/funnel — favorites_count равен числу записей в investor_favorites
// 11. GET /api/admin/funnel — applications_count равен числу записей в investor_applications
// 12. GET /api/admin/funnel — portfolio_count равен числу записей в investor_portfolio
// 13. GET /api/admin/funnel — conversion_rate = applications_count / unique_viewers * 100
// 14. GET /api/admin/funnel — conversion_rate = 0 если unique_viewers = 0
// 15. GET /api/admin/funnel — rows отсортированы по views_count DESC
// 16. FunnelRow тип содержит все ожидаемые поля
// 17. GET /api/admin/funnel — 500 если ошибка БД при запросе проектов
// 18. GET /api/admin/funnel — 500 если ошибка в одном из параллельных запросов агрегатов
// 19. GET /api/admin/funnel — conversion_rate округлён до 1 знака после запятой
// 20. GET /api/admin/funnel — два проекта сортируются верно (больше просмотров — первый)
```

#### Структура моков

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'admin-1', email: 'admin@test.com' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      }),
    })),
  })),
}))

const mockProjectsQuery = jest.fn().mockResolvedValue({
  data: [{ id: 'project-1', name: 'Тест Проект', category: 'tech' }],
  error: null,
})

const mockViewsQuery = jest.fn().mockResolvedValue({
  data: [
    { project_id: 'project-1', investor_id: 'inv-1' },
    { project_id: 'project-1', investor_id: 'inv-2' },
  ],
  error: null,
})

const mockFavoritesQuery = jest.fn().mockResolvedValue({
  data: [{ project_id: 'project-1' }],
  error: null,
})

const mockApplicationsQuery = jest.fn().mockResolvedValue({
  data: [{ project_id: 'project-1' }],
  error: null,
})

const mockPortfolioQuery = jest.fn().mockResolvedValue({
  data: [],
  error: null,
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: mockProjectsQuery,
        }
      }
      if (table === 'deal_room_views') {
        return {
          select: jest.fn().mockReturnThis(),
          in: mockViewsQuery,
        }
      }
      if (table === 'investor_favorites') {
        return {
          select: jest.fn().mockReturnThis(),
          in: mockFavoritesQuery,
        }
      }
      if (table === 'investor_applications') {
        return {
          select: jest.fn().mockReturnThis(),
          in: mockApplicationsQuery,
        }
      }
      // investor_portfolio
      return {
        select: jest.fn().mockReturnThis(),
        in: mockPortfolioQuery,
      }
    }),
  })),
}))
```

## Файлы для создания / изменения

- `types/index.ts` — добавить `FunnelRow`
- `app/api/admin/funnel/route.ts` (новый) — GET воронка конверсии
- `app/(admin)/funnel/page.tsx` (новый) — серверная страница
- `app/(admin)/funnel/funnel-client.tsx` (новый) — клиентский компонент таблицы
- `app/(admin)/layout.tsx` — добавить пункт «Воронка» в навигацию
- `__tests__/t52.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение существующих таблиц
- Доступ: `admin`, `superadmin`, `moderator`
- Использовать `createAdminClient()` для всех запросов к данным (обход RLS)
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t52.test.ts)
4. `GET /api/admin/funnel` — возвращает `{ rows: FunnelRow[] }` для admin/superadmin/moderator
5. `GET /api/admin/funnel` — возвращает 401/403 для неавторизованных/запрещённых ролей
6. Строки воронки содержат корректные значения `conversion_rate` (applications/unique_viewers * 100)
7. Строки отсортированы по `views_count` DESC
8. Страница `/admin/funnel` содержит таблицу с 8 колонками и цветными бейджами конверсии
9. В навигации admin-панели есть пункт «Воронка»
10. Записать в `progress.md`: `DONE: T52 + что создано/изменено`
