# T64 — Кабинет менеджера: дашборд (статистика заявок, быстрые действия)

## Контекст

Менеджер отвечает за обработку заявок инвесторов (роль `manager`).
Сейчас `/manager` просто редиректит на `/manager/applications` — список всех заявок.
У менеджера нет стартовой страницы с обзором ситуации: сколько заявок ждут обработки,
сколько обработано сегодня, какие заявки самые свежие.

T64 создаёт дашборд `/manager/dashboard` — главную страницу кабинета менеджера:
серверный компонент загружает статистику через Supabase-клиент напрямую,
клиентский компонент отображает счётчики по статусам и список последних заявок.

Также обновляется редирект: `/manager` → `/manager/dashboard` вместо `/manager/applications`.

## Что нужно создать / изменить

### 1. Создать `app/(manager)/manager/dashboard/page.tsx`

Серверный компонент — загружает данные через Supabase-клиент напрямую (не через fetch).

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { ManagerDashboardClient } from './manager-dashboard-client'
import type { ManagerDashboardData } from '@/types'

export const dynamic = 'force-dynamic'

export default async function ManagerDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()

  // Считаем заявки по статусам
  const [
    { count: pendingCount },
    { count: approvedCount },
    { count: rejectedCount },
    { count: cancelledCount },
  ] = await Promise.all([
    adminClient.from('investor_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    adminClient.from('investor_applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    adminClient.from('investor_applications').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    adminClient.from('investor_applications').select('*', { count: 'exact', head: true }).eq('status', 'cancelled'),
  ])

  // Последние 5 заявок (любой статус) с именем проекта и email инвестора
  const { data: recentRows } = await adminClient
    .from('investor_applications')
    .select('id, status, amount, instrument, created_at, projects(name), users(email)')
    .order('created_at', { ascending: false })
    .limit(5)

  type RecentRow = {
    id: string
    status: string
    amount: number | null
    instrument: string | null
    created_at: string
    projects: { name: string | null } | { name: string | null }[] | null
    users: { email: string | null } | { email: string | null }[] | null
  }

  function getName(p: RecentRow['projects']): string | null {
    return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null
  }
  function getEmail(u: RecentRow['users']): string | null {
    return (Array.isArray(u) ? u[0]?.email : u?.email) ?? null
  }

  const recentApplications = (recentRows ?? []).map((r) => ({
    id: r.id,
    status: r.status,
    amount: r.amount,
    instrument: r.instrument,
    created_at: r.created_at,
    project_name: getName(r.projects),
    investor_email: getEmail(r.users),
  }))

  const dashboardData: ManagerDashboardData = {
    stats: {
      pending: pendingCount ?? 0,
      approved: approvedCount ?? 0,
      rejected: rejectedCount ?? 0,
      cancelled: cancelledCount ?? 0,
    },
    recentApplications,
  }

  return <ManagerDashboardClient data={dashboardData} />
}
```

### 2. Создать `app/(manager)/manager/dashboard/manager-dashboard-client.tsx`

Клиентский компонент — отображает данные дашборда.

```tsx
'use client'

import Link from 'next/link'
import type { ManagerDashboardData } from '@/types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:   { label: 'Ожидают',   color: 'bg-yellow-100 text-yellow-800' },
  approved:  { label: 'Одобрены',  color: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Отклонены', color: 'bg-red-100 text-red-700' },
  cancelled: { label: 'Отменены',  color: 'bg-gray-100 text-gray-600' },
}

interface Props {
  data: ManagerDashboardData
}

export function ManagerDashboardClient({ data }: Props) {
  const { stats, recentApplications } = data

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <h1 className="text-2xl font-bold">Кабинет менеджера</h1>

      {/* Счётчики по статусам */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {(Object.entries(stats) as [string, number][]).map(([status, count]) => {
          const meta = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-700' }
          return (
            <Link
              key={status}
              href={`/manager/applications?status=${status}`}
              className="rounded-lg border p-4 hover:bg-gray-50 transition-colors"
            >
              <p className="text-3xl font-bold">{count}</p>
              <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                {meta.label}
              </span>
            </Link>
          )
        })}
      </div>

      {/* Быстрые действия */}
      <div className="rounded-lg border p-5">
        <h2 className="text-sm font-semibold mb-3">Быстрые действия</h2>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/manager/applications?status=pending"
            className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            Обработать заявки ({stats.pending})
          </Link>
          <Link
            href="/manager/applications"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Все заявки
          </Link>
        </div>
      </div>

      {/* Последние заявки */}
      {recentApplications.length > 0 && (
        <div className="rounded-lg border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Последние заявки</h2>
            <Link href="/manager/applications" className="text-xs text-gray-500 hover:underline">
              Все заявки
            </Link>
          </div>
          <ul className="divide-y">
            {recentApplications.map((app) => {
              const meta = STATUS_LABELS[app.status] ?? { label: app.status, color: 'bg-gray-100 text-gray-700' }
              return (
                <li key={app.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {app.project_name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{app.investor_email ?? '—'}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(app.created_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {app.amount !== null && (
                      <span className="text-sm">{app.amount.toLocaleString('ru-RU')} ₽</span>
                    )}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
                      {meta.label}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
```

### 3. Обновить `app/(manager)/manager/page.tsx`

Изменить редирект с `/manager/applications` на `/manager/dashboard`:

```typescript
import { redirect } from 'next/navigation'

export default function ManagerRootPage() {
  redirect('/manager/dashboard')
}
```

### 4. Обновить `types/index.ts`

Добавить тип для данных менеджер-дашборда:

```typescript
export interface ManagerDashboardStats {
  pending: number
  approved: number
  rejected: number
  cancelled: number
}

export interface ManagerDashboardApplication {
  id: string
  status: string
  amount: number | null
  instrument: string | null
  created_at: string
  project_name: string | null
  investor_email: string | null
}

export interface ManagerDashboardData {
  stats: ManagerDashboardStats
  recentApplications: ManagerDashboardApplication[]
}
```

### 5. Создать `__tests__/t64.test.ts`

```typescript
// ManagerDashboardClient
// 1.  рендерится с нулевой статистикой без ошибок
// 2.  отображает счётчик pending
// 3.  отображает счётчик approved
// 4.  отображает счётчик rejected
// 5.  отображает счётчик cancelled
// 6.  содержит ссылку "Обработать заявки" ведущую на /manager/applications?status=pending
// 7.  содержит ссылку "Все заявки" ведущую на /manager/applications
// 8.  отображает список recentApplications если они есть
// 9.  не рендерит секцию "Последние заявки" если recentApplications пустой
// 10. отображает project_name в списке последних заявок
// 11. отображает investor_email в списке последних заявок
// 12. форматирует amount с разрядами (toLocaleString)
// 13. отображает метку статуса для каждой заявки в списке
// 14. ссылки на счётчиках ведут на /manager/applications?status=<status>
// 15. отображает заголовок "Кабинет менеджера"
```

#### Структура тестов

```typescript
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManagerDashboardClient } from '@/app/(manager)/manager/dashboard/manager-dashboard-client'
import type { ManagerDashboardData } from '@/types'

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement('a', { href }, children),
}))

const emptyData: ManagerDashboardData = {
  stats: { pending: 0, approved: 0, rejected: 0, cancelled: 0 },
  recentApplications: [],
}

const filledData: ManagerDashboardData = {
  stats: { pending: 3, approved: 10, rejected: 2, cancelled: 1 },
  recentApplications: [
    {
      id: 'app-1',
      status: 'pending',
      amount: 500000,
      instrument: 'equity',
      created_at: '2026-06-01T10:00:00Z',
      project_name: 'Alpha Project',
      investor_email: 'investor@example.com',
    },
  ],
}
```

Использовать `renderToStaticMarkup` для получения HTML и проверять вхождение строк
(аналогично другим тестам в проекте).

## Файлы для создания / изменения

- `app/(manager)/manager/dashboard/page.tsx` (новый)
- `app/(manager)/manager/dashboard/manager-dashboard-client.tsx` (новый)
- `app/(manager)/manager/page.tsx` (обновить редирект)
- `types/index.ts` (добавить ManagerDashboardStats, ManagerDashboardApplication, ManagerDashboardData)
- `__tests__/t64.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не использовать fetch к собственным API из серверных компонентов — только Supabase-клиент
- Читать существующие файлы перед изменением
- Не трогать файлы других модулей кроме указанных

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t64.test.ts)
4. Страница `/manager/dashboard` отображает счётчики по 4 статусам
5. Счётчики-ссылки ведут на `/manager/applications?status=<status>`
6. Список последних 5 заявок с проектом, email инвестора, суммой и статусом
7. `/manager` редиректит на `/manager/dashboard`
8. Записать в `progress.md`: `DONE: T64 + что создано/изменено`
