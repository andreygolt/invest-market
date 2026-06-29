# T48 — Admin: broadcast-уведомления (объявления для пользователей по роли)

## Контекст

В T35/T47 реализована полноценная система in-app уведомлений: колокольчик, попап, страница
истории с пагинацией. Все существующие уведомления создаются автоматически как реакция
на действия пользователей (подача заявки, одобрение проекта и т.д.).

Однако у администратора нет способа **отправить вручную объявление** — например:
- «Платформа будет недоступна 30 июня с 02:00 до 04:00 по МСК»
- «Новые возможности платформы: читайте в блоге»
- «Уважаемые инвесторы, напоминаем о верификации аккаунта»

Сейчас единственный вариант — рассылать email вручную вне системы.

T48 закрывает этот пробел: администратор может создать broadcast-уведомление (объявление),
которое мгновенно появится у всех пользователей выбранной роли (или у всех сразу).
Использует существующую таблицу `notifications` без изменений схемы — просто массовая вставка.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

#### 1a. Добавить `'announcement'` в `NotificationType`

```typescript
// БЫЛО:
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application'
  | 'new_project_submission'

// СТАЛО: добавить 'announcement'
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application'
  | 'new_project_submission'
  | 'announcement'
```

#### 1b. Добавить тип для broadcast API

```typescript
export type BroadcastTargetRole =
  | 'all'
  | 'investor'
  | 'project'
  | 'manager'
  | 'moderator'
  | 'admin'
  | 'superadmin'

export interface BroadcastRequest {
  title: string
  body: string
  target_role: BroadcastTargetRole
  link?: string
}

export interface BroadcastResult {
  sent: number
  target_role: BroadcastTargetRole
}
```

### 2. Создать `app/api/admin/notifications/broadcast/route.ts`

Доступ: только роли `admin` и `superadmin`.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BroadcastRequest, BroadcastResult, UserRole } from '@/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Проверить роль
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json()) as BroadcastRequest

  // Валидация
  if (!body.title?.trim() || !body.body?.trim()) {
    return NextResponse.json({ error: 'title and body are required' }, { status: 400 })
  }
  if (body.title.trim().length > 120) {
    return NextResponse.json({ error: 'title too long (max 120)' }, { status: 400 })
  }
  if (body.body.trim().length > 1000) {
    return NextResponse.json({ error: 'body too long (max 1000)' }, { status: 400 })
  }

  const validRoles: BroadcastTargetRole[] = [
    'all', 'investor', 'project', 'manager', 'moderator', 'admin', 'superadmin',
  ]
  if (!validRoles.includes(body.target_role)) {
    return NextResponse.json({ error: 'Invalid target_role' }, { status: 400 })
  }

  // Получить целевых пользователей
  const admin = createAdminClient()
  let profilesQuery = admin.from('profiles').select('id')
  if (body.target_role !== 'all') {
    profilesQuery = profilesQuery.eq('role', body.target_role as UserRole)
  }
  const { data: profiles, error: profilesError } = await profilesQuery
  if (profilesError) {
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }

  if (!profiles || profiles.length === 0) {
    const result: BroadcastResult = { sent: 0, target_role: body.target_role }
    return NextResponse.json(result)
  }

  // Массовая вставка уведомлений
  const notifications = profiles.map((p: { id: string }) => ({
    user_id: p.id,
    type: 'announcement' as const,
    title: body.title.trim(),
    body: body.body.trim(),
    link: body.link?.trim() || null,
    is_read: false,
  }))

  const { error: insertError } = await admin.from('notifications').insert(notifications)
  if (insertError) {
    return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 })
  }

  const result: BroadcastResult = { sent: notifications.length, target_role: body.target_role }
  return NextResponse.json(result)
}
```

### 3. Создать `app/(admin)/notifications/page.tsx`

Серверный компонент-обёртка. Проверяет авторизацию, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BroadcastFormClient from './broadcast-form-client'

export default async function AdminNotificationsPage() {
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
      <h1 className="mb-6 text-2xl font-semibold">Отправить объявление</h1>
      <BroadcastFormClient />
    </div>
  )
}
```

### 4. Создать `app/(admin)/notifications/broadcast-form-client.tsx`

Клиентский компонент с формой отправки broadcast-уведомления.

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { BroadcastTargetRole, BroadcastResult } from '@/types'

const ROLE_LABELS: Record<BroadcastTargetRole, string> = {
  all: 'Все пользователи',
  investor: 'Инвесторы',
  project: 'Владельцы проектов',
  manager: 'Менеджеры',
  moderator: 'Модераторы',
  admin: 'Администраторы',
  superadmin: 'Суперадмины',
}

export default function BroadcastFormClient() {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [link, setLink] = useState('')
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>('all')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BroadcastResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setResult(null)

    const res = await fetch('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        target_role: targetRole,
      }),
    })

    if (res.ok) {
      const data = (await res.json()) as BroadcastResult
      setResult(data)
      setTitle('')
      setBody('')
      setLink('')
      setTargetRole('all')
    } else {
      const data = (await res.json()) as { error: string }
      setError(data.error ?? 'Ошибка при отправке')
    }

    setLoading(false)
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      {/* Получатели */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">Получатели</label>
        <select
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value as BroadcastTargetRole)}
          className="w-full rounded-md border px-3 py-2 text-sm"
          required
        >
          {(Object.keys(ROLE_LABELS) as BroadcastTargetRole[]).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </div>

      {/* Заголовок */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">Заголовок</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          placeholder="Краткий заголовок объявления"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <div className="text-right text-xs text-gray-400">{title.length}/120</div>
      </div>

      {/* Текст */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">Текст</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          required
          rows={4}
          placeholder="Текст объявления"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
        <div className="text-right text-xs text-gray-400">{body.length}/1000</div>
      </div>

      {/* Ссылка (опционально) */}
      <div className="space-y-1">
        <label className="block text-sm font-medium">
          Ссылка <span className="text-gray-400">(необязательно)</span>
        </label>
        <input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="/catalog или https://..."
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      {/* Результат / ошибка */}
      {result && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Объявление отправлено: {result.sent}{' '}
          {result.sent === 1 ? 'пользователю' : 'пользователям'} (
          {ROLE_LABELS[result.target_role]})
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Button type="submit" disabled={loading || !title.trim() || !body.trim()}>
        {loading ? 'Отправка...' : 'Отправить объявление'}
      </Button>
    </form>
  )
}
```

### 5. Добавить ссылку в навигацию admin-панели

Обновить `app/(admin)/layout.tsx` — добавить пункт «Объявления» в меню.

> Проверь текущий layout и добавь ссылку на `/admin/notifications` (или соответствующий
> вложенный путь в зависимости от структуры layout'а).
> Ориентируйся на стиль существующих ссылок в меню.
> Не изменяй другие элементы layout'а.

### 6. Тесты — `__tests__/t48.test.ts`

```typescript
// 1. POST /api/admin/notifications/broadcast — 401 без авторизации
// 2. POST /api/admin/notifications/broadcast — 403 для роли investor
// 3. POST /api/admin/notifications/broadcast — 400 если title пустой
// 4. POST /api/admin/notifications/broadcast — 400 если body пустой
// 5. POST /api/admin/notifications/broadcast — 400 если title > 120 символов
// 6. POST /api/admin/notifications/broadcast — 400 если body > 1000 символов
// 7. POST /api/admin/notifications/broadcast — 400 при невалидном target_role
// 8. POST /api/admin/notifications/broadcast — успех для admin, target_role='all', возвращает { sent, target_role }
// 9. POST /api/admin/notifications/broadcast — успех для superadmin
// 10. POST /api/admin/notifications/broadcast — target_role='investor' фильтрует только investor-пользователей
// 11. POST /api/admin/notifications/broadcast — если нет пользователей в target_role, возвращает { sent: 0 }
// 12. POST /api/admin/notifications/broadcast — вставляет уведомления с type='announcement'
// 13. POST /api/admin/notifications/broadcast — link передаётся в уведомление (опционально)
// 14. POST /api/admin/notifications/broadcast — link='' не записывается (null в БД)
// 15. BroadcastTargetRole и BroadcastResult типы содержат ожидаемые поля
```

#### Структура моков

```typescript
import { createMocks } from 'node-mocks-http'

const mockProfiles = [
  { id: 'u1', role: 'investor' },
  { id: 'u2', role: 'investor' },
  { id: 'u3', role: 'admin' },
]

// mock supabase/server для проверки авторизации пользователя
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

// mock supabase/admin для получения пользователей и вставки
const mockInsert = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          // Возвращает список профилей
          then: jest.fn(),
          // Для простоты — mockImplementation ниже в конкретных тестах
        }
      }
      if (table === 'notifications') {
        return { insert: mockInsert }
      }
      return {}
    }),
  })),
}))

// Примечание: для теста 10 (target_role='investor') используй mockImplementation
// на from('profiles').select().eq('role', 'investor') — возвращай только investor-записи.
// Для теста 8 (target_role='all') — возвращай всех пользователей (mockProfiles).
```

## Файлы для изменения / создания

- `types/index.ts` — добавить `'announcement'` в `NotificationType`, типы `BroadcastTargetRole`, `BroadcastRequest`, `BroadcastResult`
- `app/api/admin/notifications/broadcast/route.ts` (новый) — POST endpoint
- `app/(admin)/notifications/page.tsx` (новый) — серверная страница
- `app/(admin)/notifications/broadcast-form-client.tsx` (новый) — клиентский компонент
- `app/(admin)/layout.tsx` — добавить пункт меню «Объявления»
- `__tests__/t48.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Никаких новых миграций — используем существующую таблицу `notifications`
- Доступ к endpoint только для `admin` и `superadmin`
- Максимум `title` — 120 символов, `body` — 1000 символов (защита от злоупотреблений)
- Не трогать файлы кроме указанных выше
- `link` — необязательное поле, если пустая строка — сохранить как `null`
- Использовать `createAdminClient()` для вставки уведомлений (обход RLS)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t48.test.ts)
4. `POST /api/admin/notifications/broadcast` — возвращает `{ sent, target_role }`
5. `target_role='all'` отправляет всем пользователям платформы
6. Конкретная роль отправляет только пользователям этой роли
7. Страница `/admin/notifications` (или соответствующий путь в admin layout) доступна admin/superadmin
8. Форма позволяет выбрать получателей, ввести заголовок и текст, отправить
9. После успешной отправки показывается сообщение с числом получателей
10. В навигации admin-панели есть ссылка «Объявления»
11. Записать в `progress.md`: `DONE: T48 + что создано/изменено`
