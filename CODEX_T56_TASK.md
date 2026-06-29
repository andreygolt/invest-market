# T56 — Admin: детальная страница пользователя

## Контекст

После T55 (глобальный поиск) администратор может найти любого пользователя по имени
или email. Однако клик по инвестору в результатах поиска ведёт на `/admin/users?id=...` —
страницу со списком, отфильтрованным по id, а не на выделенную страницу профиля.

T56 добавляет **детальную страницу пользователя** (`/admin/users/[id]`), где
администратор может:

- Просмотреть полный профиль: имя, email, роль, статус (активен/заблокирован),
  дата регистрации
- Изменить роль пользователя (dropdown + кнопка «Сохранить»)
- Заблокировать / разблокировать пользователя (toggle `is_active`)
- Для роли `investor` — видеть список его заявок (из `investor_applications`) и
  записей в портфеле (из `investor_portfolio`)

**API уже существует:**
- `GET /api/admin/users/[id]` — получить профиль
- `PATCH /api/admin/users/[id]` — обновить `role` и/или `is_active`

**Принцип:** серверный компонент загружает данные и передаёт в клиентский. Все
мутации (смена роли, блокировка) — через `fetch` к существующим API-роутам.

## Что нужно создать / изменить

### 1. Создать `app/(admin)/users/[id]/page.tsx`

Серверный компонент — проверяет роль, загружает профиль пользователя и его данные
(если investor — заявки и портфель), передаёт в клиентский компонент.

```typescript
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import UserDetailClient from './user-detail-client'
import type { UserProfile, ApplicationStatus } from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin']

interface PageProps {
  params: Promise<{ id: string }>
}

export interface UserApplication {
  id: string
  project_id: string
  project_name: string
  amount: number | null
  status: ApplicationStatus
  created_at: string
}

export interface UserPortfolioEntry {
  id: string
  project_id: string
  project_name: string
  amount: number
  created_at: string
}

export default async function UserDetailPage({ params }: PageProps) {
  const { id } = await params

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

  const actorRole = profile.role as string
  const admin = createAdminClient()

  // Получить профиль пользователя
  const { data: targetProfile, error: profileError } = await admin
    .from('profiles')
    .select('id, full_name, email, role, is_active, created_at')
    .eq('id', id)
    .single()

  if (profileError || !targetProfile) {
    notFound()
  }

  const userProfile: UserProfile = {
    id: targetProfile.id as string,
    full_name: targetProfile.full_name as string | null,
    email: targetProfile.email as string,
    role: targetProfile.role as string,
    is_active: (targetProfile.is_active ?? true) as boolean,
    created_at: targetProfile.created_at as string,
  }

  // Для инвесторов — дополнительные данные
  let applications: UserApplication[] = []
  let portfolioEntries: UserPortfolioEntry[] = []

  if (userProfile.role === 'investor') {
    const [appsResult, portResult] = await Promise.all([
      admin
        .from('investor_applications')
        .select('id, project_id, amount, status, created_at, projects(name)')
        .eq('investor_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('investor_portfolio')
        .select('id, project_id, amount, created_at, projects(name)')
        .eq('investor_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
    ])

    applications = ((appsResult.data ?? []) as Array<{
      id: string
      project_id: string
      amount: number | null
      status: string
      created_at: string
      projects: { name: string } | null
    }>).map((a) => ({
      id: a.id,
      project_id: a.project_id,
      project_name: a.projects?.name ?? '—',
      amount: a.amount,
      status: a.status as ApplicationStatus,
      created_at: a.created_at,
    }))

    portfolioEntries = ((portResult.data ?? []) as Array<{
      id: string
      project_id: string
      amount: number
      created_at: string
      projects: { name: string } | null
    }>).map((p) => ({
      id: p.id,
      project_id: p.project_id,
      project_name: p.projects?.name ?? '—',
      amount: p.amount,
      created_at: p.created_at,
    }))
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Профиль пользователя</h1>
      <UserDetailClient
        user={userProfile}
        actorRole={actorRole}
        applications={applications}
        portfolioEntries={portfolioEntries}
      />
    </div>
  )
}
```

### 2. Создать `app/(admin)/users/[id]/user-detail-client.tsx`

Клиентский компонент: карточка с данными профиля, форма смены роли,
кнопка блокировки, таблицы заявок и портфеля (для инвесторов).

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { UserApplication, UserPortfolioEntry } from './page'
import type { UserProfile, UserRole } from '@/types'

const ALL_ROLES: UserRole[] = ['investor', 'project', 'manager', 'moderator', 'admin', 'superadmin']

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Суперадмин',
  admin: 'Администратор',
  moderator: 'Модератор',
  manager: 'Менеджер',
  investor: 'Инвестор',
  project: 'Проект',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принята',
  declined: 'Отклонена',
  cancelled: 'Отменена',
  withdrawn: 'Отозвана',
  approved: 'Одобрена',
  rejected: 'Отклонена',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

interface Props {
  user: UserProfile
  actorRole: string
  applications: UserApplication[]
  portfolioEntries: UserPortfolioEntry[]
}

export default function UserDetailClient({ user, actorRole, applications, portfolioEntries }: Props) {
  const router = useRouter()
  const [role, setRole] = useState<UserRole>(user.role as UserRole)
  const [isActive, setIsActive] = useState(user.is_active)
  const [saving, setSaving] = useState(false)
  const [blocking, setBlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isSelf = false  // actor_id != user.id проверено на сервере
  const canAssignSuperadmin = actorRole === 'superadmin'

  const availableRoles = canAssignSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter((r) => r !== 'superadmin')

  async function handleSaveRole() {
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Ошибка сохранения')
        return
      }
      setSuccess('Роль обновлена')
      router.refresh()
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleBlock() {
    setBlocking(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Ошибка')
        return
      }
      setIsActive((prev) => !prev)
      setSuccess(isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован')
      router.refresh()
    } catch {
      setError('Ошибка сети')
    } finally {
      setBlocking(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Карточка профиля */}
      <div className="rounded-lg border p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-gray-500">Имя</dt>
            <dd className="mt-1 text-sm font-medium">{user.full_name ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Email</dt>
            <dd className="mt-1 text-sm">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Текущая роль</dt>
            <dd className="mt-1 text-sm">{ROLE_LABELS[user.role as UserRole] ?? user.role}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Дата регистрации</dt>
            <dd className="mt-1 text-sm">{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Статус</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  isActive
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {isActive ? 'Активен' : 'Заблокирован'}
              </span>
            </dd>
          </div>
        </dl>
      </div>

      {/* Сообщения */}
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      )}

      {/* Управление ролью */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-sm font-semibold">Изменить роль</h2>
        <div className="flex items-center gap-3">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <button
            onClick={handleSaveRole}
            disabled={saving || role === user.role}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>

      {/* Блокировка */}
      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-sm font-semibold">
          {isActive ? 'Заблокировать пользователя' : 'Разблокировать пользователя'}
        </h2>
        <button
          onClick={handleToggleBlock}
          disabled={blocking}
          className={`rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            isActive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {blocking
            ? 'Обработка...'
            : isActive
            ? 'Заблокировать'
            : 'Разблокировать'}
        </button>
      </div>

      {/* Заявки инвестора */}
      {applications.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Заявки ({applications.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Проект</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Сумма</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Статус</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{app.project_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {app.amount != null
                        ? `${app.amount.toLocaleString('ru-RU')} ₽`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {STATUS_LABELS[app.status] ?? app.status}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(app.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Портфель инвестора */}
      {portfolioEntries.length > 0 && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">
              Портфель ({portfolioEntries.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Проект</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Сумма</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Дата</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {portfolioEntries.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.project_name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {p.amount.toLocaleString('ru-RU')} ₽
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 3. Тесты `__tests__/t56.test.ts`

```typescript
// 1.  GET /api/admin/users/[id] — 401 без авторизации
// 2.  GET /api/admin/users/[id] — 403 для роли investor
// 3.  GET /api/admin/users/[id] — 403 для роли moderator
// 4.  GET /api/admin/users/[id] — 200 для роли admin
// 5.  GET /api/admin/users/[id] — 200 для роли superadmin
// 6.  GET /api/admin/users/[id] — возвращает UserProfile с id, email, role, is_active, created_at
// 7.  GET /api/admin/users/[id] — 500 если ошибка БД
// 8.  PATCH /api/admin/users/[id] — 401 без авторизации
// 9.  PATCH /api/admin/users/[id] — 403 для investor
// 10. PATCH /api/admin/users/[id] — 400 если невалидная роль
// 11. PATCH /api/admin/users/[id] — 400 если is_active не boolean
// 12. PATCH /api/admin/users/[id] — 400 если попытка обновить собственный аккаунт
// 13. PATCH /api/admin/users/[id] — 403 если admin пытается назначить роль superadmin
// 14. PATCH /api/admin/users/[id] — 200 superadmin может назначить роль superadmin
// 15. PATCH /api/admin/users/[id] — 200 успешная смена роли
// 16. PATCH /api/admin/users/[id] — 200 успешная блокировка (is_active: false)
// 17. PATCH /api/admin/users/[id] — 200 успешная разблокировка (is_active: true)
// 18. PATCH /api/admin/users/[id] — возвращает обновлённый UserProfile
// 19. PATCH /api/admin/users/[id] — 500 если ошибка БД при обновлении
// 20. PATCH /api/admin/users/[id] — можно обновить только role без is_active и наоборот
```

#### Структура моков

```typescript
import { GET, PATCH } from '@/app/api/admin/users/[id]/route'
import { NextRequest } from 'next/server'

const mockUserId = 'user-123'
const mockAdminId = 'admin-1'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: mockAdminId } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
    })),
  })),
}))

const mockGetUser = jest.fn().mockResolvedValue({
  data: {
    id: mockUserId,
    email: 'user@test.com',
    role: 'investor',
    full_name: 'Test User',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  error: null,
})

const mockPatchUser = jest.fn().mockResolvedValue({
  data: {
    id: mockUserId,
    email: 'user@test.com',
    role: 'investor',
    full_name: 'Test User',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  error: null,
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: mockGetUser,
    })),
  })),
}))

function makeGetRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`)
}

function makePatchRequest(id: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const makeContext = (id: string) => ({
  params: Promise.resolve({ id }),
})
```

## Файлы для создания / изменения

- `app/(admin)/users/[id]/page.tsx` (новый) — серверный компонент детального профиля
- `app/(admin)/users/[id]/user-detail-client.tsx` (новый) — клиентский компонент
- `__tests__/t56.test.ts` (новый) — тесты для `/api/admin/users/[id]` GET и PATCH

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — только чтение/обновление существующих таблиц через API
- Доступ: только `admin`, `superadmin`
- Не трогать файлы кроме указанных выше
- Не модифицировать существующий API (`app/api/admin/users/[id]/route.ts`)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t56.test.ts)
4. `GET /admin/users/[id]` — показывает профиль пользователя с данными
5. Для инвестора — дополнительно отображаются таблицы его заявок и портфеля
6. Форма смены роли: выбрать роль → сохранить → `PATCH /api/admin/users/[id]`
7. Кнопка блокировки/разблокировки — `PATCH /api/admin/users/[id]` с `is_active`
8. Superadmin видит роль `superadmin` в списке; admin — нет
9. Записать в `progress.md`: `DONE: T56 + что создано/изменено`
