# T54 — Admin: аналитика за период (временные ряды)

## Контекст

В T52 реализована воронка конверсии по проектам, в T53 — активность инвесторов.
Обе страницы дают мгновенный срез «сейчас», но администратор не видит динамику:
растёт ли платформа, когда был пик активности, какой месяц был лучшим по заявкам?

T54 добавляет страницу **«Аналитика»** (`/admin/analytics`) с таблицей временных
рядов за выбранный период. Строки — временные бакеты (дни для 7d/30d, недели для 90d),
колонки — ключевые метрики платформы.

```
Период | Регистрации | Проекты (подача) | Просмотры Deal Room | Заявки инвесторов | Новые записи в портфеле
```

**Принцип:** один API-эндпоинт принимает `?period=7d|30d|90d`, делает параллельные
запросы к 5 таблицам, агрегирует по дням/неделям и возвращает временной ряд.
Никакой чартерной библиотеки — отображение через HTML-таблицу с inline-бар-индикаторами.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить типы временного ряда:

```typescript
export type AnalyticsPeriod = '7d' | '30d' | '90d'

export interface AnalyticsBucket {
  label: string          // отображаемый период: '28 июн', 'Неделя 26'
  date_from: string      // ISO-дата начала бакета
  registrations: number
  project_submissions: number
  deal_room_views: number
  applications: number
  portfolio_entries: number
}

export interface AnalyticsResponse {
  period: AnalyticsPeriod
  buckets: AnalyticsBucket[]
  totals: {
    registrations: number
    project_submissions: number
    deal_room_views: number
    applications: number
    portfolio_entries: number
  }
}
```

### 2. Создать `app/api/admin/analytics/route.ts`

Доступ: только `admin`, `superadmin`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AnalyticsBucket, AnalyticsPeriod, AnalyticsResponse } from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin']

type RawRow = { ts: string }

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function dayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' })
}

function weekLabel(iso: string, index: number): string {
  return `Нед. ${index + 1} (${dayLabel(iso)})`
}

export async function GET(request: NextRequest) {
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

  const raw = request.nextUrl.searchParams.get('period') ?? '30d'
  const period: AnalyticsPeriod = (['7d', '30d', '90d'] as const).includes(raw as AnalyticsPeriod)
    ? (raw as AnalyticsPeriod)
    : '30d'

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90
  const useWeeks = period === '90d'

  const now = startOfDay(new Date())
  const from = addDays(now, -days)
  const fromIso = from.toISOString()

  const admin = createAdminClient()

  // Параллельные запросы к 5 таблицам — только timestamp-колонки
  const [regResult, projResult, viewsResult, appsResult, portResult] = await Promise.all([
    admin.from('profiles').select('created_at').gte('created_at', fromIso),
    admin.from('projects').select('created_at').gte('created_at', fromIso),
    admin.from('deal_room_views').select('viewed_at').gte('viewed_at', fromIso),
    admin.from('investor_applications').select('created_at').gte('created_at', fromIso),
    admin.from('investor_portfolio').select('created_at').gte('created_at', fromIso),
  ])

  const firstError =
    regResult.error ?? projResult.error ?? viewsResult.error ??
    appsResult.error ?? portResult.error

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 })
  }

  // Собрать все даты событий в массивы строк
  const regDates    = ((regResult.data   ?? []) as { created_at: string }[]).map((r) => r.created_at.slice(0, 10))
  const projDates   = ((projResult.data  ?? []) as { created_at: string }[]).map((r) => r.created_at.slice(0, 10))
  const viewDates   = ((viewsResult.data ?? []) as { viewed_at:  string }[]).map((r) => r.viewed_at.slice(0, 10))
  const appDates    = ((appsResult.data  ?? []) as { created_at: string }[]).map((r) => r.created_at.slice(0, 10))
  const portDates   = ((portResult.data  ?? []) as { created_at: string }[]).map((r) => r.created_at.slice(0, 10))

  function countInRange(dates: string[], from: string, to: string): number {
    return dates.filter((d) => d >= from && d < to).length
  }

  const buckets: AnalyticsBucket[] = []

  if (!useWeeks) {
    // Дневные бакеты
    for (let i = 0; i < days; i++) {
      const bucketStart = addDays(from, i)
      const bucketEnd   = addDays(from, i + 1)
      const bs = isoDate(bucketStart)
      const be = isoDate(bucketEnd)

      buckets.push({
        label:               dayLabel(bs),
        date_from:           bs,
        registrations:       countInRange(regDates, bs, be),
        project_submissions: countInRange(projDates, bs, be),
        deal_room_views:     countInRange(viewDates, bs, be),
        applications:        countInRange(appDates, bs, be),
        portfolio_entries:   countInRange(portDates, bs, be),
      })
    }
  } else {
    // Недельные бакеты (каждые 7 дней)
    const weekCount = Math.ceil(days / 7)
    for (let i = 0; i < weekCount; i++) {
      const bucketStart = addDays(from, i * 7)
      const bucketEnd   = addDays(from, Math.min((i + 1) * 7, days))
      const bs = isoDate(bucketStart)
      const be = isoDate(bucketEnd)

      buckets.push({
        label:               weekLabel(bs, i),
        date_from:           bs,
        registrations:       countInRange(regDates, bs, be),
        project_submissions: countInRange(projDates, bs, be),
        deal_room_views:     countInRange(viewDates, bs, be),
        applications:        countInRange(appDates, bs, be),
        portfolio_entries:   countInRange(portDates, bs, be),
      })
    }
  }

  const totals = {
    registrations:       buckets.reduce((s, b) => s + b.registrations, 0),
    project_submissions: buckets.reduce((s, b) => s + b.project_submissions, 0),
    deal_room_views:     buckets.reduce((s, b) => s + b.deal_room_views, 0),
    applications:        buckets.reduce((s, b) => s + b.applications, 0),
    portfolio_entries:   buckets.reduce((s, b) => s + b.portfolio_entries, 0),
  }

  const response: AnalyticsResponse = { period, buckets, totals }
  return NextResponse.json(response)
}
```

### 3. Создать `app/(admin)/admin/analytics/page.tsx`

Серверный компонент — проверяет роль, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AnalyticsClient from './analytics-client'

const ALLOWED_ROLES = ['admin', 'superadmin']

export default async function AnalyticsPage() {
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
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Аналитика платформы</h1>
      <AnalyticsClient />
    </div>
  )
}
```

### 4. Создать `app/(admin)/admin/analytics/analytics-client.tsx`

Клиентский компонент: переключатель периода + таблица с бакетами и строкой итогов.
Для каждого числового значения показывать inline-бар: `div` с шириной пропорциональной
максимуму колонки (без CSS-фреймворков кроме Tailwind, без Chart.js).

```tsx
'use client'

import { useEffect, useState } from 'react'
import type { AnalyticsBucket, AnalyticsPeriod, AnalyticsResponse } from '@/types'

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d',  label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
]

const COLUMNS: { key: keyof Omit<AnalyticsBucket, 'label' | 'date_from'>; label: string }[] = [
  { key: 'registrations',       label: 'Регистрации' },
  { key: 'project_submissions', label: 'Проекты (подача)' },
  { key: 'deal_room_views',     label: 'Просмотры Deal Room' },
  { key: 'applications',        label: 'Заявки' },
  { key: 'portfolio_entries',   label: 'Портфель' },
]

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right tabular-nums">{value}</span>
      <div className="h-2 w-24 rounded-full bg-gray-100">
        <div
          className="h-2 rounded-full bg-blue-400"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

export default function AnalyticsClient() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d')
  const [data, setData] = useState<AnalyticsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`/api/admin/analytics?period=${period}`)
        if (!res.ok) {
          const json = (await res.json()) as { error?: string }
          setError(json.error ?? 'Ошибка загрузки')
          return
        }
        setData((await res.json()) as AnalyticsResponse)
      } catch {
        setError('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    })()
  }, [period])

  // Максимумы по каждой колонке для inline-баров
  const maxValues = COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = data
      ? Math.max(1, ...data.buckets.map((b) => b[col.key] as number))
      : 1
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Переключатель периода */}
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-12 text-center text-gray-400">Загрузка...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Карточки итогов */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COLUMNS.map((col) => (
              <div key={col.key} className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-semibold tabular-nums">
                  {data.totals[col.key as keyof typeof data.totals]}
                </div>
                <div className="mt-1 text-xs text-gray-500">{col.label}</div>
              </div>
            ))}
          </div>

          {/* Таблица по бакетам */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Период</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left font-medium text-gray-600">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.buckets.map((bucket) => (
                  <tr key={bucket.date_from} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{bucket.label}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-2">
                        <MiniBar
                          value={bucket[col.key] as number}
                          max={maxValues[col.key] ?? 1}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
```

### 5. Обновить `app/(admin)/layout.tsx`

Добавить пункт «Аналитика» в навигацию (после «Инвесторы», перед «Инвайты»):

```tsx
<Link href="/admin/analytics" className="hover:text-foreground">
  Аналитика
</Link>
```

### 6. Тесты `__tests__/t54.test.ts`

```typescript
// 1.  GET /api/admin/analytics — 401 без авторизации
// 2.  GET /api/admin/analytics — 403 для роли investor
// 3.  GET /api/admin/analytics — 403 для роли moderator
// 4.  GET /api/admin/analytics — 200 для роли admin
// 5.  GET /api/admin/analytics — 200 для роли superadmin
// 6.  GET /api/admin/analytics?period=7d — 7 бакетов (дневных)
// 7.  GET /api/admin/analytics?period=30d — 30 бакетов (дневных)
// 8.  GET /api/admin/analytics?period=90d — 13 бакетов (недельных, ceil(90/7))
// 9.  GET /api/admin/analytics — неверный period → дефолт 30d
// 10. GET /api/admin/analytics — totals.registrations = сумма buckets[].registrations
// 11. GET /api/admin/analytics — totals.applications = сумма buckets[].applications
// 12. GET /api/admin/analytics — totals.deal_room_views = сумма buckets[].deal_room_views
// 13. GET /api/admin/analytics — totals.project_submissions = сумма buckets[].project_submissions
// 14. GET /api/admin/analytics — totals.portfolio_entries = сумма buckets[].portfolio_entries
// 15. GET /api/admin/analytics — каждый bucket содержит поля: label, date_from, registrations, ...
// 16. GET /api/admin/analytics — 500 если ошибка в одном из параллельных запросов
// 17. GET /api/admin/analytics — registration из прошлого (>period) не входит в totals
// 18. GET /api/admin/analytics — registration из текущего периода входит в нужный bucket
// 19. GET /api/admin/analytics — ответ содержит поле period с запрошенным периодом
// 20. AnalyticsResponse тип содержит period, buckets, totals
```

#### Структура моков

```typescript
import { GET } from '@/app/api/admin/analytics/route'
import { NextRequest } from 'next/server'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'admin-1' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
    })),
  })),
}))

// Мок createAdminClient: возвращает пустые массивы по умолчанию
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}))

function makeRequest(period?: string): NextRequest {
  const url = period
    ? `http://localhost/api/admin/analytics?period=${period}`
    : 'http://localhost/api/admin/analytics'
  return new NextRequest(url)
}
```

## Файлы для создания / изменения

- `types/index.ts` — добавить `AnalyticsPeriod`, `AnalyticsBucket`, `AnalyticsResponse`
- `app/api/admin/analytics/route.ts` (новый) — GET аналитика за период
- `app/(admin)/admin/analytics/page.tsx` (новый) — серверная страница
- `app/(admin)/admin/analytics/analytics-client.tsx` (новый) — клиентский компонент
- `app/(admin)/layout.tsx` — добавить пункт «Аналитика» в навигацию
- `__tests__/t54.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей (Chart.js, recharts и т.п. — запрещены)
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение существующих таблиц
- Доступ: только `admin`, `superadmin`
- Использовать `createAdminClient()` для запросов к данным (обход RLS)
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t54.test.ts)
4. `GET /api/admin/analytics?period=7d` — возвращает `{ period, buckets: [7 элементов], totals }` для admin/superadmin
5. `GET /api/admin/analytics?period=90d` — возвращает недельные бакеты (13 штук)
6. `GET /api/admin/analytics` — 401/403 для неавторизованных / investor / moderator
7. `totals` — сумма всех бакетов по каждой метрике
8. Страница `/admin/analytics` показывает переключатель периода (7д/30д/90д), карточки итогов и таблицу
9. В каждой ячейке таблицы — inline mini-bar визуализация
10. В навигации admin-панели есть пункт «Аналитика» (ссылка на `/admin/analytics`)
11. Записать в `progress.md`: `DONE: T54 + что создано/изменено`
