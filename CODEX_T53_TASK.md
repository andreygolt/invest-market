# T53 — Admin: активность инвесторов

## Контекст

В T52 реализована страница «Воронка» (`/admin/funnel`): администратор видит
каждый одобренный проект с показателями просмотров, избранного, заявок и портфеля.

Это взгляд **с точки зрения проектов**. Администратору также нужен взгляд
**с точки зрения инвесторов** — кто из них наиболее активен на платформе:
сколько проектов просмотрел, сколько добавил в избранное, сколько подал заявок,
сколько зафиксировал в портфеле.

T53 добавляет страницу **«Активность инвесторов»** (`/admin/investors-activity`)
с таблицей, где каждая строка — один инвестор, а колонки отражают его активность
на платформе.

```
Инвестор | Email | Просмотры | Избранное | Заявки | Портфель | Последняя активность
```

**Принцип:** один API-эндпоинт агрегирует данные через `createAdminClient()`.
Данные берутся из таблиц: `profiles`, `deal_room_views`, `investor_favorites`,
`investor_applications`, `investor_portfolio`.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить тип строки активности инвестора:

```typescript
export interface InvestorActivityRow {
  investor_id: string
  investor_name: string
  email: string
  views_count: number
  favorites_count: number
  applications_count: number
  portfolio_count: number
  last_active_at: string | null  // ISO timestamp последнего события (view/fav/app/portfolio), null если нет событий
}
```

### 2. Создать `app/api/admin/investors-activity/route.ts`

Доступ: только `admin`, `superadmin`.

Логика:
- Получить всех пользователей с ролью `investor` из таблицы `profiles`
- Для каждого инвестора параллельно собрать агрегаты из 4 таблиц
- Вычислить `last_active_at` — максимальный timestamp из всех событий инвестора
- Вернуть массив `InvestorActivityRow[]`, отсортированный по `views_count` DESC

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { InvestorActivityRow } from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin']

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

  // 1. Получить всех инвесторов
  const { data: investors, error: investorsError } = await admin
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'investor')
    .order('created_at', { ascending: false })

  if (investorsError) {
    return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 })
  }

  if (!investors || investors.length === 0) {
    return NextResponse.json({ rows: [] })
  }

  const investorIds = investors.map((inv) => inv.id as string)

  // 2. Параллельно собрать агрегаты
  const [viewsResult, favoritesResult, applicationsResult, portfolioResult] =
    await Promise.all([
      admin
        .from('deal_room_views')
        .select('investor_id, viewed_at')
        .in('investor_id', investorIds),
      admin
        .from('investor_favorites')
        .select('investor_id, created_at')
        .in('investor_id', investorIds),
      admin
        .from('investor_applications')
        .select('investor_id, created_at')
        .in('investor_id', investorIds),
      admin
        .from('investor_portfolio')
        .select('investor_id, created_at')
        .in('investor_id', investorIds),
    ])

  const firstError =
    viewsResult.error ??
    favoritesResult.error ??
    applicationsResult.error ??
    portfolioResult.error

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch activity data' }, { status: 500 })
  }

  type ViewRow        = { investor_id: string; viewed_at: string }
  type TimestampRow   = { investor_id: string; created_at: string }

  const viewRows        = (viewsResult.data        ?? []) as ViewRow[]
  const favoriteRows    = (favoritesResult.data    ?? []) as TimestampRow[]
  const applicationRows = (applicationsResult.data ?? []) as TimestampRow[]
  const portfolioRows   = (portfolioResult.data    ?? []) as TimestampRow[]

  // 3. Агрегировать по investor_id
  const rows: InvestorActivityRow[] = investors.map((inv) => {
    const iid = inv.id as string

    const invViews        = viewRows.filter((r) => r.investor_id === iid)
    const invFavorites    = favoriteRows.filter((r) => r.investor_id === iid)
    const invApplications = applicationRows.filter((r) => r.investor_id === iid)
    const invPortfolio    = portfolioRows.filter((r) => r.investor_id === iid)

    // Последняя активность — максимум всех timestamps
    const allTimestamps = [
      ...invViews.map((r) => r.viewed_at),
      ...invFavorites.map((r) => r.created_at),
      ...invApplications.map((r) => r.created_at),
      ...invPortfolio.map((r) => r.created_at),
    ].filter(Boolean)

    const lastActiveAt = allTimestamps.length > 0
      ? allTimestamps.reduce((a, b) => (a > b ? a : b))
      : null

    return {
      investor_id:       iid,
      investor_name:     (inv.full_name ?? '') as string,
      email:             (inv.email ?? '') as string,
      views_count:       invViews.length,
      favorites_count:   invFavorites.length,
      applications_count: invApplications.length,
      portfolio_count:   invPortfolio.length,
      last_active_at:    lastActiveAt,
    }
  })

  rows.sort((a, b) => b.views_count - a.views_count)

  return NextResponse.json({ rows })
}
```

### 3. Создать `app/(admin)/investors-activity/page.tsx`

Серверный компонент — проверяет роль, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import InvestorsActivityClient from './investors-activity-client'

const ALLOWED_ROLES = ['admin', 'superadmin']

export default async function InvestorsActivityPage() {
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
      <h1 className="mb-6 text-2xl font-semibold">Активность инвесторов</h1>
      <InvestorsActivityClient />
    </div>
  )
}
```

### 4. Создать `app/(admin)/investors-activity/investors-activity-client.tsx`

Клиентский компонент: таблица активности инвесторов.

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { InvestorActivityRow } from '@/types'

interface ActivityResponse {
  rows: InvestorActivityRow[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default function InvestorsActivityClient() {
  const [rows, setRows] = useState<InvestorActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/investors-activity')
        if (!res.ok) {
          const data = (await res.json()) as { error?: string }
          setError(data.error ?? 'Ошибка загрузки данных')
          return
        }
        const data = (await res.json()) as ActivityResponse
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
        Нет зарегистрированных инвесторов
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Инвестор</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Просмотры</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Избранное</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Заявки</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Портфель</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Последняя активность</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.investor_id} className="hover:bg-gray-50">
              <td className="max-w-[180px] truncate px-4 py-3 font-medium">
                {row.investor_name || '—'}
              </td>
              <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">{row.email}</td>
              <td className="px-4 py-3 text-right">{row.views_count}</td>
              <td className="px-4 py-3 text-right">{row.favorites_count}</td>
              <td className="px-4 py-3 text-right">{row.applications_count}</td>
              <td className="px-4 py-3 text-right">{row.portfolio_count}</td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatDate(row.last_active_at)}
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

Добавить пункт «Инвесторы» в навигацию (после «Воронка», не изменяя остальное):

```tsx
<Link href="/admin/investors-activity" className="hover:text-foreground">
  Инвесторы
</Link>
```

### 6. Тесты `__tests__/t53.test.ts`

```typescript
// 1.  GET /api/admin/investors-activity — 401 без авторизации
// 2.  GET /api/admin/investors-activity — 403 для роли moderator
// 3.  GET /api/admin/investors-activity — 403 для роли investor
// 4.  GET /api/admin/investors-activity — 200 для роли admin
// 5.  GET /api/admin/investors-activity — 200 для роли superadmin
// 6.  GET /api/admin/investors-activity — { rows: [] } если нет инвесторов
// 7.  GET /api/admin/investors-activity — rows содержат investor_id, investor_name, email
// 8.  GET /api/admin/investors-activity — views_count равен числу записей deal_room_views для инвестора
// 9.  GET /api/admin/investors-activity — favorites_count равен числу записей investor_favorites
// 10. GET /api/admin/investors-activity — applications_count равен числу записей investor_applications
// 11. GET /api/admin/investors-activity — portfolio_count равен числу записей investor_portfolio
// 12. GET /api/admin/investors-activity — last_active_at = null если нет событий
// 13. GET /api/admin/investors-activity — last_active_at = максимальный timestamp из всех событий
// 14. GET /api/admin/investors-activity — rows отсортированы по views_count DESC
// 15. GET /api/admin/investors-activity — 500 если ошибка БД при запросе инвесторов
// 16. GET /api/admin/investors-activity — 500 если ошибка в параллельном запросе агрегатов
// 17. GET /api/admin/investors-activity — два инвестора: больше просмотров — первый
// 18. InvestorActivityRow тип содержит все ожидаемые поля
// 19. GET /api/admin/investors-activity — investor_name = '' если full_name null
// 20. GET /api/admin/investors-activity — last_active_at выбирает max из разных таблиц
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

const mockInvestorsQuery = jest.fn().mockResolvedValue({
  data: [
    { id: 'inv-1', full_name: 'Иван Иванов', email: 'ivan@test.com' },
    { id: 'inv-2', full_name: 'Пётр Петров', email: 'petr@test.com' },
  ],
  error: null,
})

const mockViewsQuery = jest.fn().mockResolvedValue({
  data: [
    { investor_id: 'inv-1', viewed_at: '2026-06-20T10:00:00Z' },
    { investor_id: 'inv-1', viewed_at: '2026-06-21T10:00:00Z' },
    { investor_id: 'inv-2', viewed_at: '2026-06-19T10:00:00Z' },
  ],
  error: null,
})

const mockFavoritesQuery = jest.fn().mockResolvedValue({
  data: [{ investor_id: 'inv-1', created_at: '2026-06-22T10:00:00Z' }],
  error: null,
})

const mockApplicationsQuery = jest.fn().mockResolvedValue({
  data: [{ investor_id: 'inv-1', created_at: '2026-06-23T10:00:00Z' }],
  error: null,
})

const mockPortfolioQuery = jest.fn().mockResolvedValue({
  data: [],
  error: null,
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: mockInvestorsQuery,
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

- `types/index.ts` — добавить `InvestorActivityRow`
- `app/api/admin/investors-activity/route.ts` (новый) — GET активность инвесторов
- `app/(admin)/investors-activity/page.tsx` (новый) — серверная страница
- `app/(admin)/investors-activity/investors-activity-client.tsx` (новый) — клиентский компонент таблицы
- `app/(admin)/layout.tsx` — добавить пункт «Инвесторы» в навигацию
- `__tests__/t53.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение существующих таблиц
- Доступ: только `admin`, `superadmin` (moderator не имеет доступа к персональным данным инвесторов)
- Использовать `createAdminClient()` для всех запросов к данным (обход RLS)
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t53.test.ts)
4. `GET /api/admin/investors-activity` — возвращает `{ rows: InvestorActivityRow[] }` для admin/superadmin
5. `GET /api/admin/investors-activity` — возвращает 401/403 для неавторизованных/moderator/investor
6. Строки содержат корректные `views_count`, `favorites_count`, `applications_count`, `portfolio_count`
7. `last_active_at` — максимальный timestamp из всех событий инвестора, null если событий нет
8. Строки отсортированы по `views_count` DESC
9. Страница `/admin/investors-activity` содержит таблицу с 7 колонками
10. В навигации admin-панели есть пункт «Инвесторы» (ссылка на `/admin/investors-activity`)
11. Записать в `progress.md`: `DONE: T53 + что создано/изменено`
