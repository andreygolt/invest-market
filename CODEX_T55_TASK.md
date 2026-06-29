# T55 — Admin: глобальный поиск (проекты, инвесторы, заявки)

## Контекст

После T54 панель администратора имеет развитый аналитический раздел (воронка, активность
инвесторов, временные ряды). Но по мере роста платформы администратор сталкивается с
проблемой навигации: чтобы найти конкретный проект по названию, инвестора по email или
заявку — нужно переходить между разными страницами и прокручивать длинные списки.

T55 добавляет **глобальный поиск** (`/admin/search`) — один эндпоинт принимает строку
запроса `?q=...` и возвращает результаты по трём категориям:

```
Проекты     — поиск по name, category (ILIKE)
Инвесторы   — поиск по full_name, email (ILIKE)
Заявки      — поиск по project name (через JOIN)
```

**Принцип:** один API-эндпоинт делает три параллельных запроса, возвращает структуру
`{ projects: [...], investors: [...], applications: [...] }`. Страница — клиентский
компонент с debounce-поиском (300 мс, нативный `setTimeout`, без внешних библиотек).

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить типы результатов поиска:

```typescript
export interface SearchProjectResult {
  id: string
  name: string
  category: string
  status: string
}

export interface SearchInvestorResult {
  id: string
  full_name: string | null
  email: string
  created_at: string
}

export interface SearchApplicationResult {
  id: string
  project_id: string
  project_name: string
  investor_id: string
  investor_email: string
  amount: number | null
  status: string
}

export interface GlobalSearchResponse {
  query: string
  projects: SearchProjectResult[]
  investors: SearchInvestorResult[]
  applications: SearchApplicationResult[]
}
```

### 2. Создать `app/api/admin/search/route.ts`

Доступ: только `admin`, `superadmin`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  GlobalSearchResponse,
  SearchApplicationResult,
  SearchInvestorResult,
  SearchProjectResult,
} from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin']
const MAX_RESULTS = 10

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

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) {
    const empty: GlobalSearchResponse = { query: q, projects: [], investors: [], applications: [] }
    return NextResponse.json(empty)
  }

  const pattern = `%${q}%`
  const admin = createAdminClient()

  const [projRes, invRes, appRes] = await Promise.all([
    admin
      .from('projects')
      .select('id, name, category, status')
      .or(`name.ilike.${pattern},category.ilike.${pattern}`)
      .limit(MAX_RESULTS),
    admin
      .from('profiles')
      .select('id, full_name, email, created_at')
      .eq('role', 'investor')
      .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(MAX_RESULTS),
    admin
      .from('investor_applications')
      .select('id, project_id, investor_id, amount, status, projects(name), profiles(email)')
      .ilike('projects.name', pattern)
      .limit(MAX_RESULTS),
  ])

  const firstError = projRes.error ?? invRes.error ?? appRes.error
  if (firstError) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  const projects: SearchProjectResult[] = (projRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    category: p.category as string,
    status: p.status as string,
  }))

  const investors: SearchInvestorResult[] = (invRes.data ?? []).map((p) => ({
    id: p.id as string,
    full_name: p.full_name as string | null,
    email: p.email as string,
    created_at: p.created_at as string,
  }))

  const applications: SearchApplicationResult[] = (appRes.data ?? [])
    .filter((a) => (a as { projects?: { name?: string } }).projects?.name)
    .map((a) => {
      const row = a as {
        id: string
        project_id: string
        investor_id: string
        amount: number | null
        status: string
        projects: { name: string }
        profiles: { email: string } | null
      }
      return {
        id: row.id,
        project_id: row.project_id,
        project_name: row.projects.name,
        investor_id: row.investor_id,
        investor_email: row.profiles?.email ?? '',
        amount: row.amount,
        status: row.status,
      }
    })

  const response: GlobalSearchResponse = { query: q, projects, investors, applications }
  return NextResponse.json(response)
}
```

### 3. Создать `app/(admin)/admin/search/page.tsx`

Серверный компонент — проверяет роль, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SearchClient from './search-client'

const ALLOWED_ROLES = ['admin', 'superadmin']

export default async function SearchPage() {
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Поиск</h1>
      <SearchClient />
    </div>
  )
}
```

### 4. Создать `app/(admin)/admin/search/search-client.tsx`

Клиентский компонент: поле поиска с debounce 300 мс, три секции результатов.

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import type { GlobalSearchResponse } from '@/types'

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

export default function SearchClient() {
  const [query, setQuery] = useState('')
  const [data, setData] = useState<GlobalSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    if (query.trim().length < 2) {
      setData(null)
      setError(null)
      return
    }

    timerRef.current = setTimeout(() => {
      setLoading(true)
      setError(null)
      void (async () => {
        try {
          const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`)
          if (!res.ok) {
            const json = (await res.json()) as { error?: string }
            setError(json.error ?? 'Ошибка поиска')
            return
          }
          setData((await res.json()) as GlobalSearchResponse)
        } catch {
          setError('Ошибка загрузки результатов')
        } finally {
          setLoading(false)
        }
      })()
    }, 300)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [query])

  const hasResults = data && (
    data.projects.length > 0 || data.investors.length > 0 || data.applications.length > 0
  )

  return (
    <div className="space-y-6">
      {/* Поле поиска */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Название проекта, email инвестора..."
        className="w-full rounded-lg border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400 focus:ring-0"
        autoFocus
      />

      {loading && (
        <div className="py-6 text-center text-sm text-gray-400">Поиск...</div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {data && !loading && !hasResults && (
        <div className="py-6 text-center text-sm text-gray-400">
          Ничего не найдено по запросу «{data.query}»
        </div>
      )}

      {/* Проекты */}
      {data && data.projects.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Проекты ({data.projects.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.projects.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/admin/moderation/${p.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.category}</div>
                  </div>
                  {statusBadge(p.status)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Инвесторы */}
      {data && data.investors.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Инвесторы ({data.investors.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.investors.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/admin/users?id=${inv.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{inv.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{inv.email}</div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(inv.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Заявки */}
      {data && data.applications.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Заявки ({data.applications.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.applications.map((app) => (
              <li key={app.id}>
                <Link
                  href={`/admin/applications?id=${app.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{app.project_name}</div>
                    <div className="text-xs text-gray-500">{app.investor_email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {app.amount != null && (
                      <span className="text-sm tabular-nums text-gray-700">
                        {app.amount.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                    {statusBadge(app.status)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

### 5. Обновить `app/(admin)/layout.tsx`

Добавить пункт «Поиск» в навигацию (первым пунктом, перед «Дашборд»):

```tsx
<Link href="/admin/search" className="hover:text-foreground">
  Поиск
</Link>
```

### 6. Тесты `__tests__/t55.test.ts`

```typescript
// 1.  GET /api/admin/search — 401 без авторизации
// 2.  GET /api/admin/search — 403 для роли investor
// 3.  GET /api/admin/search — 403 для роли moderator
// 4.  GET /api/admin/search — 200 для роли admin
// 5.  GET /api/admin/search — 200 для роли superadmin
// 6.  GET /api/admin/search?q=a — пустой ответ (q.length < 2)
// 7.  GET /api/admin/search?q=  — пустой ответ (q после trim < 2)
// 8.  GET /api/admin/search?q=test — возвращает { query, projects, investors, applications }
// 9.  GET /api/admin/search?q=test — projects — массив с полями id, name, category, status
// 10. GET /api/admin/search?q=test — investors — массив с полями id, full_name, email, created_at
// 11. GET /api/admin/search?q=test — applications — массив с полями id, project_name, investor_email, status
// 12. GET /api/admin/search?q=test — поле query совпадает с переданным параметром
// 13. GET /api/admin/search — без q → пустой ответ
// 14. GET /api/admin/search?q=test — 500 если ошибка в параллельном запросе проектов
// 15. GET /api/admin/search?q=test — 500 если ошибка в параллельном запросе инвесторов
// 16. GET /api/admin/search?q=test — 500 если ошибка в параллельном запросе заявок
// 17. GET /api/admin/search?q=test — projects пустой массив если нет совпадений
// 18. GlobalSearchResponse тип содержит query, projects, investors, applications
// 19. SearchProjectResult тип содержит id, name, category, status
// 20. SearchInvestorResult тип содержит id, full_name, email, created_at
```

#### Структура моков

```typescript
import { GET } from '@/app/api/admin/search/route'
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
      or: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  })),
}))

function makeRequest(q?: string): NextRequest {
  const url = q != null
    ? `http://localhost/api/admin/search?q=${encodeURIComponent(q)}`
    : 'http://localhost/api/admin/search'
  return new NextRequest(url)
}
```

## Файлы для создания / изменения

- `types/index.ts` — добавить `SearchProjectResult`, `SearchInvestorResult`, `SearchApplicationResult`, `GlobalSearchResponse`
- `app/api/admin/search/route.ts` (новый) — GET глобальный поиск
- `app/(admin)/admin/search/page.tsx` (новый) — серверная страница
- `app/(admin)/admin/search/search-client.tsx` (новый) — клиентский компонент с debounce
- `app/(admin)/layout.tsx` — добавить пункт «Поиск» в навигацию
- `__tests__/t55.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение существующих таблиц
- Доступ: только `admin`, `superadmin`
- Debounce реализуется через нативный `setTimeout` (без lodash/use-debounce)
- Минимум 2 символа для поиска (возвращать пустой ответ если q.trim().length < 2)
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t55.test.ts)
4. `GET /api/admin/search?q=ab` — 200 для admin/superadmin, структура `{ query, projects, investors, applications }`
5. `GET /api/admin/search?q=a` — 200, все массивы пустые (q < 2 символа)
6. `GET /api/admin/search` — 401/403 для неавторизованных / investor / moderator
7. Страница `/admin/search` показывает поле поиска и три секции результатов
8. Ввод в поле поиска запускает запрос с задержкой 300 мс (debounce)
9. В навигации admin-панели есть пункт «Поиск»
10. Записать в `progress.md`: `DONE: T55 + что создано/изменено`
