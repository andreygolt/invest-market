# T49 — Admin: экспорт данных в CSV (проекты, заявки, инвесторы)

## Контекст

В T48 реализована система broadcast-уведомлений для администратора. Платформа содержит
значительный объём данных: проекты, заявки инвесторов, пользователи-инвесторы.

Администратору периодически нужно выгружать эти данные для внешней отчётности,
юридических документов или CRM-интеграции — например:
- Список всех проектов с их статусами и категориями
- Список заявок инвесторов за период с суммами и статусами
- Список инвесторов с датами регистрации

Сейчас это невозможно без прямого доступа к Supabase. T49 добавляет три API-эндпоинта
для CSV-экспорта и страницу администратора с кнопками скачивания.

**Реализация:** стандартный `Response` с заголовком `Content-Type: text/csv`.
Никаких новых npm-зависимостей — CSV генерируется нативно (ручная сборка строк).

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить типы для строк CSV-экспорта:

```typescript
export interface ProjectExportRow {
  id: string
  name: string
  category: string
  status: string
  created_at: string
  investment_min: number | null
  investment_max: number | null
  target_amount: number | null
  currency: string | null
}

export interface ApplicationExportRow {
  id: string
  project_id: string
  project_name: string
  investor_id: string
  investor_email: string
  amount: number | null
  currency: string | null
  status: string
  created_at: string
}

export interface InvestorExportRow {
  id: string
  email: string
  full_name: string | null
  created_at: string
}
```

### 2. Создать вспомогательную функцию `lib/csv/build.ts`

```typescript
// Экранирует значение для CSV: оборачивает в кавычки, удваивает внутренние кавычки
export function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

// Строит CSV из массива объектов
export function buildCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const header = columns.map((c) => csvEscape(c.header)).join(',')
  const lines = rows.map((row) =>
    columns.map((c) => csvEscape(row[c.key] as string | number | null)).join(','),
  )
  return [header, ...lines].join('\n')
}
```

### 3. Создать `app/api/admin/export/projects/route.ts`

Доступ: только `admin` и `superadmin`.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCsv } from '@/lib/csv/build'
import type { ProjectExportRow } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: projects, error } = await admin
    .from('projects')
    .select('id, name, category, status, created_at, investment_min, investment_max, target_amount, currency')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 })

  const rows: ProjectExportRow[] = (projects ?? []).map((p) => ({
    id: p.id as string,
    name: (p.name ?? '') as string,
    category: (p.category ?? '') as string,
    status: (p.status ?? '') as string,
    created_at: (p.created_at ?? '') as string,
    investment_min: p.investment_min as number | null,
    investment_max: p.investment_max as number | null,
    target_amount: p.target_amount as number | null,
    currency: p.currency as string | null,
  }))

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Название' },
    { key: 'category', header: 'Категория' },
    { key: 'status', header: 'Статус' },
    { key: 'created_at', header: 'Дата создания' },
    { key: 'investment_min', header: 'Мин. инвестиция' },
    { key: 'investment_max', header: 'Макс. инвестиция' },
    { key: 'target_amount', header: 'Целевая сумма' },
    { key: 'currency', header: 'Валюта' },
  ])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="projects.csv"',
    },
  })
}
```

### 4. Создать `app/api/admin/export/applications/route.ts`

Доступ: только `admin` и `superadmin`.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCsv } from '@/lib/csv/build'
import type { ApplicationExportRow } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: apps, error } = await admin
    .from('investor_applications')
    .select(`
      id,
      project_id,
      investor_id,
      amount,
      currency,
      status,
      created_at,
      projects ( name ),
      profiles ( email, full_name )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 })

  const rows: ApplicationExportRow[] = (apps ?? []).map((a) => ({
    id: a.id as string,
    project_id: a.project_id as string,
    project_name: ((a.projects as { name?: string } | null)?.name ?? '') as string,
    investor_id: a.investor_id as string,
    investor_email: ((a.profiles as { email?: string } | null)?.email ?? '') as string,
    amount: a.amount as number | null,
    currency: a.currency as string | null,
    status: (a.status ?? '') as string,
    created_at: (a.created_at ?? '') as string,
  }))

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'project_id', header: 'ID проекта' },
    { key: 'project_name', header: 'Проект' },
    { key: 'investor_id', header: 'ID инвестора' },
    { key: 'investor_email', header: 'Email инвестора' },
    { key: 'amount', header: 'Сумма' },
    { key: 'currency', header: 'Валюта' },
    { key: 'status', header: 'Статус' },
    { key: 'created_at', header: 'Дата заявки' },
  ])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="applications.csv"',
    },
  })
}
```

### 5. Создать `app/api/admin/export/investors/route.ts`

Доступ: только `admin` и `superadmin`.

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCsv } from '@/lib/csv/build'
import type { InvestorExportRow } from '@/types'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: investors, error } = await admin
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('role', 'investor')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 })

  const rows: InvestorExportRow[] = (investors ?? []).map((inv) => ({
    id: inv.id as string,
    email: (inv.email ?? '') as string,
    full_name: inv.full_name as string | null,
    created_at: (inv.created_at ?? '') as string,
  }))

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'email', header: 'Email' },
    { key: 'full_name', header: 'Полное имя' },
    { key: 'created_at', header: 'Дата регистрации' },
  ])

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="investors.csv"',
    },
  })
}
```

### 6. Создать `app/(admin)/export/page.tsx`

Серверный компонент — проверяет авторизацию, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ExportPageClient from './export-page-client'

export default async function AdminExportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    redirect('/')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Экспорт данных</h1>
      <ExportPageClient />
    </div>
  )
}
```

### 7. Создать `app/(admin)/export/export-page-client.tsx`

Клиентский компонент с тремя кнопками скачивания CSV.

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface ExportItem {
  label: string
  url: string
  filename: string
}

const EXPORTS: ExportItem[] = [
  { label: 'Проекты', url: '/api/admin/export/projects', filename: 'projects.csv' },
  { label: 'Заявки инвесторов', url: '/api/admin/export/applications', filename: 'applications.csv' },
  { label: 'Инвесторы', url: '/api/admin/export/investors', filename: 'investors.csv' },
]

export default function ExportPageClient() {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleDownload(item: ExportItem) {
    setLoading(item.url)
    setError(null)
    try {
      const res = await fetch(item.url)
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Ошибка при экспорте')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = item.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      setError('Ошибка при скачивании файла')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Скачайте данные платформы в формате CSV для отчётности или интеграции с внешними системами.
      </p>

      <div className="divide-y rounded-lg border">
        {EXPORTS.map((item) => (
          <div key={item.url} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{item.label}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={loading === item.url}
              onClick={() => void handleDownload(item)}
            >
              {loading === item.url ? 'Загрузка...' : 'Скачать CSV'}
            </Button>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
    </div>
  )
}
```

### 8. Добавить ссылку в навигацию admin-панели

Обновить `app/(admin)/layout.tsx` — добавить пункт «Экспорт» в меню, ссылка на
соответствующий путь (ориентируйся на стиль существующих пунктов).
Не изменяй другие элементы layout'а.

### 9. Тесты — `__tests__/t49.test.ts`

```typescript
// 1. csvEscape — возвращает пустую строку для null/undefined
// 2. csvEscape — не изменяет простые строки и числа
// 3. csvEscape — оборачивает в кавычки строки с запятой
// 4. csvEscape — удваивает кавычки внутри строки
// 5. csvEscape — оборачивает в кавычки строки с переносом строки
// 6. buildCsv — первая строка содержит заголовки
// 7. buildCsv — строки данных соответствуют порядку columns
// 8. buildCsv — null-поле в строке данных → пустая ячейка
// 9. GET /api/admin/export/projects — 401 без авторизации
// 10. GET /api/admin/export/projects — 403 для роли investor
// 11. GET /api/admin/export/projects — возвращает Content-Type: text/csv для admin
// 12. GET /api/admin/export/projects — Content-Disposition содержит projects.csv
// 13. GET /api/admin/export/applications — 401 без авторизации
// 14. GET /api/admin/export/applications — 403 для роли investor
// 15. GET /api/admin/export/applications — возвращает Content-Type: text/csv для admin
// 16. GET /api/admin/export/investors — 401 без авторизации
// 17. GET /api/admin/export/investors — 403 для роли investor
// 18. GET /api/admin/export/investors — возвращает Content-Type: text/csv для superadmin
// 19. GET /api/admin/export/investors — Content-Disposition содержит investors.csv
// 20. ProjectExportRow, ApplicationExportRow, InvestorExportRow типы содержат ожидаемые поля
```

#### Структура моков

```typescript
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
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      }),
    })),
  })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
    })),
  })),
}))
```

Для тестов 401 — мокировать `getUser` возвращающий `{ data: { user: null } }`.
Для тестов 403 — мокировать `single` возвращающий `{ data: { role: 'investor' } }`.
Для тестов Content-Type — проверять заголовок `headers.get('content-type')`.

## Файлы для изменения / создания

- `types/index.ts` — добавить `ProjectExportRow`, `ApplicationExportRow`, `InvestorExportRow`
- `lib/csv/build.ts` (новый) — `csvEscape` и `buildCsv`
- `app/api/admin/export/projects/route.ts` (новый) — GET экспорт проектов
- `app/api/admin/export/applications/route.ts` (новый) — GET экспорт заявок
- `app/api/admin/export/investors/route.ts` (новый) — GET экспорт инвесторов
- `app/(admin)/export/page.tsx` (новый) — серверная страница экспорта
- `app/(admin)/export/export-page-client.tsx` (новый) — клиентский компонент
- `app/(admin)/layout.tsx` — добавить пункт меню «Экспорт»
- `__tests__/t49.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение существующих таблиц
- Доступ только для `admin` и `superadmin`
- CSV генерируется нативно через `lib/csv/build.ts`
- Использовать `createAdminClient()` для обхода RLS при чтении данных
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t49.test.ts)
4. `GET /api/admin/export/projects` — возвращает CSV с заголовками
5. `GET /api/admin/export/applications` — возвращает CSV с заголовками
6. `GET /api/admin/export/investors` — возвращает CSV с заголовками
7. Страница `/admin/export` доступна admin/superadmin, содержит три кнопки скачивания
8. В навигации admin-панели есть пункт «Экспорт»
9. `lib/csv/build.ts` корректно экранирует спецсимволы
10. Записать в `progress.md`: `DONE: T49 + что создано/изменено`
