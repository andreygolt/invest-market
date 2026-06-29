# T47 — Страница истории уведомлений с пагинацией

## Контекст

В T35 реализована система in-app уведомлений: колокольчик с бейджем, попап с последними
30 уведомлениями, кнопки «прочитать» и «прочитать все». Однако:

1. **Ограничение 30** — `GET /api/notifications` жёстко возвращает только последние 30 записей.
   Пользователи с большой историей уведомлений (активные инвесторы, менеджеры) не видят
   старые уведомления.
2. **Нет полной страницы** — единственная точка просмотра уведомлений — попап шириной 320px.
   Нет возможности удобно просмотреть историю, отфильтровать только непрочитанные или
   открыть нужное уведомление.
3. **Счётчик непрочитанных неточный** — `unread_count` считается из возвращённых 30 записей,
   а не из всей таблицы. Если непрочитанных >30 — бейдж показывает некорректное значение.

T47 закрывает эти пробелы:
- Расширяет `GET /api/notifications` пагинацией и корректным `unread_count` из БД
- Создаёт страницу `/notifications` — полный список с фильтром и постраничной навигацией
- Добавляет ссылку «Посмотреть все» в попап колокольчика

## Что нужно создать / изменить

### 1. Обновить `app/api/notifications/route.ts`

Расширить `GET` handler: добавить поддержку пагинации и вернуть точный `unread_count`.

#### 1a. Принять query-параметры `page` и `per_page`

```typescript
const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') ?? '20', 10) || 20))
const offset = (page - 1) * perPage
```

> Дефолт: `page=1`, `per_page=20`. Максимум `per_page=50`.

#### 1b. Считать точный `unread_count` отдельным запросом

```typescript
const { count: totalUnread } = await supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)
  .eq('is_read', false)

const unreadCount = totalUnread ?? 0
```

> Отдельный запрос (head: true) — не зависит от пагинации.

#### 1c. Считать общее количество для пагинации

```typescript
let countQuery = supabase
  .from('notifications')
  .select('*', { count: 'exact', head: true })
  .eq('user_id', user.id)

if (unreadOnly) {
  countQuery = countQuery.eq('is_read', false)
}

const { count: totalCount } = await countQuery
const total = totalCount ?? 0
const totalPages = Math.ceil(total / perPage)
```

#### 1d. Применить пагинацию в основном запросе

```typescript
// БЫЛО:
.limit(30)

// СТАЛО:
.range(offset, offset + perPage - 1)
```

#### 1e. Обновить тип ответа

```typescript
return NextResponse.json({
  notifications,
  unread_count: unreadCount,
  total_count: total,
  page,
  per_page: perPage,
  total_pages: totalPages,
})
```

> `notifications` и `unread_count` — сохранены для обратной совместимости с колокольчиком.
> Новые поля: `total_count`, `page`, `per_page`, `total_pages`.

### 2. Обновить `types/index.ts`

Добавить тип ответа API уведомлений:

```typescript
export interface NotificationsResponse {
  notifications: NotificationRow[]
  unread_count: number
  total_count: number
  page: number
  per_page: number
  total_pages: number
}
```

Не трогать остальные типы.

### 3. Создать `app/notifications/page.tsx`

Серверный компонент страницы `/notifications`. Доступен всем авторизованным пользователям.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import NotificationsPageClient from './notifications-page-client'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Уведомления</h1>
      <NotificationsPageClient />
    </div>
  )
}
```

### 4. Создать `app/notifications/notifications-page-client.tsx`

Клиентский компонент с фильтром (все / только непрочитанные) и постраничной навигацией.

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { NotificationRow, NotificationsResponse } from '@/types'

export default function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (p: number, unread: boolean) => {
    setLoading(true)
    const params = new URLSearchParams({
      page: String(p),
      per_page: '20',
      ...(unread ? { unread_only: 'true' } : {}),
    })
    const res = await fetch(`/api/notifications?${params.toString()}`)
    if (res.ok) {
      const data = (await res.json()) as NotificationsResponse
      setNotifications(data.notifications)
      setTotalPages(data.total_pages)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load(page, unreadOnly)
  }, [page, unreadOnly, load])

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}`, { method: 'PATCH' })
    void load(page, unreadOnly)
  }

  async function markAllAsRead() {
    await fetch('/api/notifications/read-all', { method: 'POST' })
    void load(page, unreadOnly)
  }

  function toggleUnreadOnly() {
    setUnreadOnly((prev) => !prev)
    setPage(1)
  }

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button
            variant={unreadOnly ? 'outline' : 'default'}
            size="sm"
            onClick={() => { if (unreadOnly) toggleUnreadOnly() }}
          >
            Все
          </Button>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => { if (!unreadOnly) toggleUnreadOnly() }}
          >
            Непрочитанные
          </Button>
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllAsRead()}>
          Прочитать все
        </Button>
      </div>

      {/* Список */}
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">Загрузка...</div>
      ) : notifications.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-500">Нет уведомлений</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const card = (
              <div
                className={`rounded-md border bg-white p-4 ${
                  n.is_read ? '' : 'border-l-4 border-blue-500'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className={`text-sm ${n.is_read ? 'font-medium' : 'font-semibold'}`}>
                      {n.title}
                    </div>
                    <div className="text-sm leading-5 text-gray-600">{n.body}</div>
                    <div className="text-xs text-gray-400">
                      {new Date(n.created_at).toLocaleString('ru-RU')}
                    </div>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 px-2"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        void markAsRead(n.id)
                      }}
                    >
                      x
                    </Button>
                  )}
                </div>
              </div>
            )
            return n.link ? (
              <Link key={n.id} href={n.link} className="block">
                {card}
              </Link>
            ) : (
              <div key={n.id}>{card}</div>
            )
          })}
        </div>
      )}

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Назад
          </Button>
          <span className="text-sm text-gray-600">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд →
          </Button>
        </div>
      )}
    </div>
  )
}
```

### 5. Обновить `components/notifications-bell.tsx`

Добавить ссылку «Посмотреть все» в нижней части попапа:

```tsx
// После закрывающего </ScrollArea>:
<div className="mt-3 border-t pt-3 text-center">
  <Link href="/notifications" className="text-sm text-blue-600 hover:underline">
    Посмотреть все уведомления
  </Link>
</div>
```

> `Link` уже импортирован в компоненте.

Также исправить `unread_count` в bell: текущий код считает `unread_count` из возвращённых
записей. С пагинацией это всегда будет корректно (т.к. API теперь считает из БД),
но нужно убедиться что bell читает `data.unread_count` из ответа API, а не считает сам.
Проверить — если bell уже использует `data.unread_count` (он использует), изменений не нужно.

### 6. Тесты — `__tests__/t47.test.ts`

```typescript
// 1. GET /api/notifications — 401 без авторизации
// 2. GET /api/notifications — возвращает notifications, unread_count, total_count, page, per_page, total_pages
// 3. GET /api/notifications — дефолт page=1, per_page=20
// 4. GET /api/notifications — page=2 использует offset=(page-1)*per_page в запросе
// 5. GET /api/notifications — per_page ограничен максимумом 50
// 6. GET /api/notifications — unread_only=true всё ещё работает (регрессия)
// 7. GET /api/notifications — unread_count считается отдельным запросом (не из notifications.length)
// 8. GET /api/notifications — total_pages = ceil(total_count / per_page)
// 9. GET /api/notifications — per_page=5 возвращает max 5 элементов
// 10. NotificationsResponse тип содержит total_count, page, per_page, total_pages
// 11. GET /api/notifications — некорректный page (строка) → дефолт page=1
// 12. GET /api/notifications — некорректный per_page → дефолт per_page=20
```

### Структура моков для тестов

```typescript
import { createMocks } from 'node-mocks-http'

const mockCountUnread = jest.fn().mockResolvedValue({ count: 3, error: null })
const mockCountTotal = jest.fn().mockResolvedValue({ count: 47, error: null })
const mockRangeData = jest.fn().mockResolvedValue({
  data: [
    { id: 'n1', user_id: 'user-1', type: 'project_approved', title: 'Test', body: 'Body', link: '/project', is_read: false, created_at: new Date().toISOString() },
    { id: 'n2', user_id: 'user-1', type: 'project_rejected', title: 'Test2', body: 'Body2', link: null, is_read: true, created_at: new Date().toISOString() },
  ],
  error: null,
})

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
    },
    from: jest.fn((table: string) => {
      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          range: mockRangeData,
          // Для count-запросов (head: true):
          // jest должен различать вызовы — используй mockImplementation если нужно
        }
      }
      return {}
    }),
  })),
}))

// Подсказка: для тестов 7 (unread_count из отдельного запроса):
// проверь что суммарный count (3) берётся из отдельного count-запроса,
// а не как notifications.filter(n => !n.is_read).length

// Для теста 4 (offset):
// проверь что .range(20, 39) вызывается при page=2, per_page=20

// Для теста 5 (per_page <= 50):
// GET с per_page=100 → API использует per_page=50
// проверь что .range(0, 49) вызывается
```

> Важно: `select('*', { count: 'exact', head: true })` — это count-запрос.
> Для различения в моках используй `mockImplementation` на `select`:
> если второй аргумент содержит `head: true` — возвращай count mock,
> иначе — data mock.

## Файлы для изменения

- `app/api/notifications/route.ts` — добавить пагинацию, точный unread_count, total_count
- `types/index.ts` — добавить `NotificationsResponse`
- `app/notifications/page.tsx` (новый) — серверная страница
- `app/notifications/notifications-page-client.tsx` (новый) — клиентский компонент
- `components/notifications-bell.tsx` — добавить «Посмотреть все» ссылку
- `__tests__/t47.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не добавлять новые миграции — таблица `notifications` уже существует
- Обратная совместимость: `notifications` и `unread_count` в ответе API обязательны
- Не трогать файлы кроме указанных выше
- `per_page` максимум 50 — защита от перегрузки
- Страница `/notifications` — для всех аутентифицированных ролей
- `unread_count` в ответе API должен быть точным (из отдельного count-запроса к БД)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t47.test.ts)
4. `GET /api/notifications` принимает `page` и `per_page` параметры
5. Ответ содержит `total_count`, `page`, `per_page`, `total_pages`
6. `unread_count` в ответе API всегда точный (из БД, не из массива)
7. Страница `/notifications` существует и доступна всем авторизованным пользователям
8. На странице работает фильтр «Все / Непрочитанные» и пагинация
9. В попапе колокольчика есть ссылка «Посмотреть все уведомления» → `/notifications`
10. Записать в `progress.md`: `DONE: T47 + что создано/изменено`
