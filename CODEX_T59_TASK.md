# T59 — Realtime-счётчик непрочитанных уведомлений

## Контекст

После T47 (история уведомлений) и T48 (broadcast) платформа имеет полную систему
уведомлений. Счётчик непрочитанных в навигации отображается, но обновляется только
при перезагрузке страницы. Если приходит новое уведомление, пользователь не видит
изменения до refresh.

T59 подключает Supabase Realtime к компоненту счётчика уведомлений: при INSERT новой
строки в таблицу `notifications` для текущего пользователя значок обновляется
мгновенно.

## Что нужно создать / изменить

### 1. Создать `components/notifications/notification-bell.tsx`

Клиентский компонент — «колокольчик» с живым счётчиком непрочитанных.

```typescript
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'

interface NotificationBellProps {
  initialUnread: number
  userId: string
}

export function NotificationBell({ initialUnread, userId }: NotificationBellProps) {
  const [unread, setUnread] = useState(initialUnread)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          setUnread((prev) => prev + 1)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        async () => {
          // При массовом прочтении (read-all) — пересчитать с сервера
          const { count } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('read', false)
          setUnread(count ?? 0)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  return (
    <Link href="/notifications" className="relative inline-flex items-center">
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  )
}
```

### 2. Создать `lib/notifications/get-unread-count.ts`

Серверный хелпер для получения начального счётчика непрочитанных.

```typescript
import { createServerClient } from '@/lib/supabase/server'

/**
 * Возвращает количество непрочитанных уведомлений текущего пользователя.
 * При ошибке или отсутствии сессии возвращает 0.
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 0

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)

    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}
```

Также экспортировать userId из сессии для передачи в компонент:

```typescript
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}
```

### 3. Обновить `app/(investor)/layout.tsx`

Заменить статическую ссылку/иконку уведомлений на `<NotificationBell>`.

```typescript
import { NotificationBell } from '@/components/notifications/notification-bell'
import { getUnreadCount, getCurrentUserId } from '@/lib/notifications/get-unread-count'

export default async function InvestorLayout({ children }: { children: React.ReactNode }) {
  // ... существующий код auth ...

  const [unread, userId] = await Promise.all([
    getUnreadCount(),
    getCurrentUserId(),
  ])

  return (
    <div ...>
      <nav ...>
        {/* существующие ссылки */}
        {userId && (
          <NotificationBell initialUnread={unread} userId={userId} />
        )}
      </nav>
      {children}
    </div>
  )
}
```

### 4. Обновить `app/(admin)/layout.tsx`

Аналогично добавить `<NotificationBell>` в admin nav.

```typescript
import { NotificationBell } from '@/components/notifications/notification-bell'
import { getUnreadCount, getCurrentUserId } from '@/lib/notifications/get-unread-count'

// В функции layout — добавить получение данных:
const [unread, userId] = await Promise.all([
  getUnreadCount(),
  getCurrentUserId(),
])

// В nav — добавить колокольчик рядом с ссылкой «Уведомления»:
{userId && <NotificationBell initialUnread={unread} userId={userId} />}
```

### 5. Обновить `app/(project)/layout.tsx` (если существует)

Аналогично — добавить `<NotificationBell>` если в layout есть навигация.

Проверить: если файл существует и содержит `<nav>` — добавить компонент.
Если файл не существует или не содержит nav — пропустить.

### 6. Создать `__tests__/t59.test.ts`

```typescript
// 1.  getUnreadCount() — возвращает 0 при отсутствии пользователя
// 2.  getUnreadCount() — возвращает 0 при ошибке БД
// 3.  getUnreadCount() — возвращает count непрочитанных для авторизованного пользователя
// 4.  getCurrentUserId() — возвращает null при отсутствии сессии
// 5.  getCurrentUserId() — возвращает user.id при наличии сессии
// 6.  NotificationBell — рендерится с initialUnread=0 (нет бейджа)
// 7.  NotificationBell — рендерится с initialUnread=3 (показывает бейдж "3")
// 8.  NotificationBell — показывает "99+" при initialUnread=100
// 9.  NotificationBell — показывает "99+" при initialUnread=999
// 10. NotificationBell — подписывается на канал Supabase Realtime при mount
// 11. NotificationBell — отписывается от канала при unmount
// 12. NotificationBell — увеличивает счётчик на 1 при INSERT-событии
```

#### Структура моков

```typescript
import { render, screen, act } from '@testing-library/react'
import { NotificationBell } from '@/components/notifications/notification-bell'

// Mock Supabase client
const mockRemoveChannel = jest.fn()
const mockSubscribe = jest.fn(() => ({ unsubscribe: jest.fn() }))
let mockInsertCallback: (() => void) | null = null

const mockOn = jest.fn((event, filter, cb) => {
  if (filter?.event === 'INSERT') mockInsertCallback = cb
  return { on: mockOn, subscribe: mockSubscribe }
})
const mockChannel = jest.fn(() => ({ on: mockOn, subscribe: mockSubscribe }))

jest.mock('@/lib/supabase/client', () => ({
  createClient: jest.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}))

// Для тестов getUnreadCount / getCurrentUserId:
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(),
}))
```

## Файлы для создания / изменения

- `components/notifications/notification-bell.tsx` (новый)
- `lib/notifications/get-unread-count.ts` (новый)
- `app/(investor)/layout.tsx` (обновить: добавить NotificationBell)
- `app/(admin)/layout.tsx` (обновить: добавить NotificationBell)
- `app/(project)/layout.tsx` (обновить если содержит nav, иначе пропустить)
- `__tests__/t59.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей (`lucide-react` уже есть в проекте как часть shadcn/ui)
- TypeScript strict — никаких `any`
- Supabase Realtime использует `createClient()` (браузерный клиент), не серверный
- Не трогать логику существующих API routes и page-компонентов
- RLS на таблице `notifications` уже настроена — Realtime автоматически учитывает её

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t59.test.ts)
4. `NotificationBell` подписывается на `postgres_changes` при mount
5. `NotificationBell` отписывается (`removeChannel`) при unmount
6. При initialUnread=0 — бейдж не отображается
7. При initialUnread>0 — бейдж показывает число (до 99) или "99+"
8. `getUnreadCount()` корректно возвращает 0 при отсутствии сессии
9. Layout инвестора содержит `<NotificationBell>`
10. Записать в `progress.md`: `DONE: T59 + что создано/изменено`
