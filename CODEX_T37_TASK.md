# T37 — Кабинет менеджера: обработка заявок инвесторов

## Контекст

Платформа имеет роль `manager` — «обработка заявок» — но у менеджера нет
собственного кабинета. В данный момент обработка заявок возможна только через
панель администратора (`/admin/applications`), то есть менеджеры вынуждены
иметь admin-доступ или обходиться без инструментов.

T37 создаёт отдельный `app/(manager)/` раздел со своим layout и навигацией,
а также расширяет существующие admin API чтобы принимать роль `manager`.

Менеджер должен уметь:
- Видеть все заявки инвесторов (все проекты, все статусы)
- Обновлять статус заявки (approve / reject / cancel)
- Видеть детали заявки и связанный проект

## Что нужно создать / изменить

### 1. Расширить проверку роли в `app/api/admin/applications/route.ts`

Добавить `manager` к допустимым ролям:

```typescript
// БЫЛО:
if (!['superadmin', 'admin', 'moderator'].includes(role)) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

// СТАЛО:
if (!['superadmin', 'admin', 'moderator', 'manager'].includes(role)) {
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}
```

### 2. Расширить проверку роли в `app/api/admin/applications/[id]/route.ts`

Та же замена — добавить `'manager'` к допустимым ролям для GET и PATCH.

### 3. `app/(manager)/layout.tsx`

Серверный компонент (без `'use client'`).
Проверяет авторизацию и роль — если роль не `manager`, `admin`, `superadmin` — редирект на `/login`.

```tsx
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import NotificationsBell from '@/components/notifications-bell'

export default async function ManagerLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const allowedRoles = ['manager', 'admin', 'superadmin']
  if (!profile || !allowedRoles.includes(profile.role)) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-semibold text-gray-900">Invest Market — Менеджер</span>
          <Link href="/manager/applications" className="text-sm text-gray-600 hover:text-gray-900">
            Заявки
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <NotificationsBell />
          <Link href="/profile" className="text-sm text-gray-600 hover:text-gray-900">
            {profile.full_name ?? user.email}
          </Link>
        </div>
      </nav>
      <main className="p-6">{children}</main>
    </div>
  )
}
```

### 4. `app/(manager)/page.tsx`

Редирект на `/manager/applications`:

```tsx
import { redirect } from 'next/navigation'

export default function ManagerRootPage() {
  redirect('/manager/applications')
}
```

### 5. `app/(manager)/applications/page.tsx`

Серверный компонент. Загружает заявки через `fetch` (или напрямую через supabase admin client).

- Использует `GET /api/admin/applications` (менеджер теперь допущен)
- Отображает таблицу: заявка ID, проект, инвестор email, сумма, статус, дата
- Фильтр по статусу через query param `?status=pending` (форма GET)
- Каждая строка — ссылка на `/manager/applications/[id]`

```tsx
import { createServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { ApplicationRow } from '@/types'

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function ManagerApplicationsPage({ searchParams }: PageProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { status } = await searchParams

  const params = new URLSearchParams()
  if (status) params.set('status', status)

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/admin/applications?${params}`,
    { headers: { cookie: '' }, cache: 'no-store' }
  )
  // Note: server fetch to own API не пробрасывает cookies — используем supabase admin client напрямую
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const adminSupabase = createAdminClient()

  let query = adminSupabase
    .from('investor_applications')
    .select('id,project_id,investor_id,amount,instrument,status,created_at,projects(name),profiles(email)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (status) query = query.eq('status', status)

  const { data: applications } = await query

  const statuses = ['pending', 'approved', 'rejected', 'cancelled']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Заявки инвесторов</h1>
        <div className="flex gap-2">
          <Link
            href="/manager/applications"
            className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
          >
            Все
          </Link>
          {statuses.map((s) => (
            <Link
              key={s}
              href={`/manager/applications?status=${s}`}
              className="text-sm px-3 py-1 rounded border hover:bg-gray-50"
            >
              {s}
            </Link>
          ))}
        </div>
      </div>

      {!applications || applications.length === 0 ? (
        <p className="text-gray-500">Заявок нет.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Проект</th>
                <th className="px-4 py-2 text-left font-medium">Инвестор</th>
                <th className="px-4 py-2 text-left font-medium">Сумма</th>
                <th className="px-4 py-2 text-left font-medium">Инструмент</th>
                <th className="px-4 py-2 text-left font-medium">Статус</th>
                <th className="px-4 py-2 text-left font-medium">Дата</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => (
                <tr key={app.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {(app.projects as { name: string } | null)?.name ?? app.project_id}
                  </td>
                  <td className="px-4 py-2">
                    {(app.profiles as { email: string } | null)?.email ?? app.investor_id}
                  </td>
                  <td className="px-4 py-2">
                    {app.amount != null ? `${app.amount.toLocaleString('ru-RU')} ₽` : '—'}
                  </td>
                  <td className="px-4 py-2">{app.instrument}</td>
                  <td className="px-4 py-2">{app.status}</td>
                  <td className="px-4 py-2">
                    {new Date(app.created_at).toLocaleDateString('ru-RU')}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/manager/applications/${app.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

### 6. `app/(manager)/applications/[id]/page.tsx`

Серверный компонент. Показывает детали одной заявки.
Клиентский компонент `StatusUpdateButton` для смены статуса.

Структура страницы:
- Заголовок «Заявка #[id]»
- Карточка с данными заявки: проект, инвестор, сумма, инструмент, комментарий, статус, дата
- Блок «Изменить статус» — кнопки approve/reject/cancel (если статус `pending`)
- Ссылка «← Назад к заявкам»

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { createServerClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import ApplicationStatusUpdater from './application-status-updater'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ManagerApplicationDetailPage({ params }: PageProps) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { id } = await params
  const adminSupabase = createAdminClient()

  const { data: app } = await adminSupabase
    .from('investor_applications')
    .select('*,projects(name,id),profiles(email,full_name)')
    .eq('id', id)
    .single()

  if (!app) notFound()

  const project = app.projects as { name: string; id: string } | null
  const profile = app.profiles as { email: string; full_name: string | null } | null

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/manager/applications" className="text-sm text-blue-600 hover:underline">
        ← Назад к заявкам
      </Link>

      <h1 className="text-xl font-semibold">Заявка</h1>

      <div className="rounded-md border bg-white p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-gray-500">Проект</span>
          <span>{project?.name ?? app.project_id}</span>

          <span className="text-gray-500">Инвестор</span>
          <span>{profile?.email ?? app.investor_id}</span>

          <span className="text-gray-500">Сумма</span>
          <span>{app.amount != null ? `${app.amount.toLocaleString('ru-RU')} ₽` : '—'}</span>

          <span className="text-gray-500">Инструмент</span>
          <span>{app.instrument}</span>

          <span className="text-gray-500">Статус</span>
          <span>{app.status}</span>

          <span className="text-gray-500">Дата подачи</span>
          <span>{new Date(app.created_at).toLocaleDateString('ru-RU')}</span>

          {app.comment && (
            <>
              <span className="text-gray-500">Комментарий</span>
              <span>{app.comment}</span>
            </>
          )}
        </div>
      </div>

      {app.status === 'pending' && (
        <ApplicationStatusUpdater applicationId={app.id} />
      )}
    </div>
  )
}
```

### 7. `app/(manager)/applications/[id]/application-status-updater.tsx`

Клиентский компонент (`'use client'`):

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  applicationId: string
}

export default function ApplicationStatusUpdater({ applicationId }: Props) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function updateStatus(status: 'approved' | 'rejected' | 'cancelled') {
    setLoading(true)
    const res = await fetch(`/api/admin/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      router.refresh()
    } else {
      const { error } = await res.json() as { error: string }
      alert(error)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Изменить статус:</p>
      <div className="flex gap-2">
        <Button
          onClick={() => updateStatus('approved')}
          disabled={loading}
          size="sm"
        >
          Одобрить
        </Button>
        <Button
          onClick={() => updateStatus('rejected')}
          disabled={loading}
          variant="destructive"
          size="sm"
        >
          Отклонить
        </Button>
        <Button
          onClick={() => updateStatus('cancelled')}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          Отменить
        </Button>
      </div>
    </div>
  )
}
```

### 8. Обновить `types/index.ts`

Проверить что тип `ApplicationRow` уже имеет поля `comment`, `instrument`, `amount`.
Если нет — добавить. Не удалять существующие поля.

```typescript
// Проверить наличие. Если ApplicationRow не содержит comment — добавить:
export interface ApplicationRow {
  // ...существующие поля...
  comment: string | null   // добавить если нет
}
```

### 9. Тесты — `__tests__/t37.test.ts`

```typescript
// 1. GET /api/admin/applications — 200 для роли manager (мок supabase с ролью manager)
// 2. GET /api/admin/applications — 403 для роли investor
// 3. PATCH /api/admin/applications/[id] — 200 для роли manager (статус approved)
// 4. PATCH /api/admin/applications/[id] — 403 для роли investor
// 5. PATCH /api/admin/applications/[id] status=approved — 200, статус обновлён (регрессия: роль admin)
// 6. PATCH /api/admin/applications/[id] status=rejected — 200 для роли manager
// 7. PATCH /api/admin/applications/[id] status=cancelled — 200 для роли manager
// 8. PATCH /api/admin/applications/[id] — 401 без авторизации
// 9. GET /api/admin/applications?status=pending — фильтр по статусу работает
// 10. PATCH /api/admin/applications/[id] — 400 при невалидном статусе (e.g. 'unknown')
```

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- shadcn/ui компоненты (Button, уже используется)
- Не трогать файлы кроме указанных в этом ТЗ
- RLS: данные читаются через adminSupabase (admin client) на страницах кабинета
- `ApplicationStatusUpdater` — не блокирует UI, использует `router.refresh()` после успеха
- Кабинет менеджера доступен ролям: `manager`, `admin`, `superadmin`

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t37.test.ts)
4. Роль `manager` допущена к `GET/PATCH /api/admin/applications` и `GET/PATCH /api/admin/applications/[id]`
5. Страница `/manager/applications` отображает список заявок с фильтром по статусу
6. Страница `/manager/applications/[id]` отображает детали и позволяет изменить статус
7. Layout `/manager` проверяет роль и редиректит неавторизованных
8. Записать в `progress.md`: `DONE: T37 + что создано/изменено`
