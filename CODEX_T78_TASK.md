# T78 — Уведомление пользователю при изменении роли или статуса аккаунта администратором

## Контекст

T77 завершил цепочку уведомлений при отзыве заявки инвестором.

Однако при изменении администратором роли пользователя или статуса аккаунта
(`PATCH /api/admin/users/[id]`) **пользователь не получает никакого уведомления** ✗.

Текущее состояние:
- Администратор меняет роль пользователя (`role`) → **пользователь не уведомлён** ✗
- Администратор деактивирует/активирует аккаунт (`is_active`) → **пользователь не уведомлён** ✗

Пользователь узнаёт об изменениях только при следующем входе в систему,
когда обнаруживает другие права доступа или блокировку.

Инфраструктура уведомлений уже существует (T47–T62, T71–T77):
- `notifications` таблица
- `createAdminClient` в `lib/supabase/admin.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-user-account-change.ts`

Хелпер уведомляет пользователя об изменении его роли или статуса аккаунта.
Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types'

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Супер-администратор',
  admin: 'Администратор',
  moderator: 'Модератор',
  manager: 'Менеджер',
  investor: 'Инвестор',
  project: 'Проект',
}

/**
 * Уведомить пользователя об изменении роли или статуса аккаунта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyUserAccountChange(params: {
  userId: string
  newRole?: UserRole
  newIsActive?: boolean
  baseUrl: string
}): Promise<void> {
  const { userId, newRole, newIsActive, baseUrl } = params

  // Нечего уведомлять если ни роль, ни статус не переданы
  if (newRole === undefined && newIsActive === undefined) return

  const admin = createAdminClient()

  try {
    let title: string
    let body: string

    if (newRole !== undefined && newIsActive !== undefined) {
      // Оба поля изменены
      const roleLabel = ROLE_LABELS[newRole] ?? newRole
      const activeText = newIsActive ? 'активирован' : 'деактивирован'
      title = 'Изменены роль и статус аккаунта'
      body = `Ваша роль изменена на «${roleLabel}», аккаунт ${activeText}.`
    } else if (newRole !== undefined) {
      const roleLabel = ROLE_LABELS[newRole] ?? newRole
      title = 'Ваша роль изменена'
      body = `Администратор изменил вашу роль на платформе: «${roleLabel}».`
    } else {
      // newIsActive !== undefined
      const activeText = newIsActive ? 'активирован' : 'деактивирован'
      title = newIsActive ? 'Аккаунт активирован' : 'Аккаунт деактивирован'
      body = `Ваш аккаунт на платформе ${activeText} администратором.`
    }

    const link = '/profile'

    const { data: inserted } = await admin
      .from('notifications')
      .insert({ user_id: userId, title, body, link })
      .select('id')
      .single()

    if (!inserted?.id) return

    // fire-and-forget email dispatch
    fetch(`${baseUrl}/api/notifications/dispatch-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: inserted.id, userId }),
    }).catch(() => {/* ignore */})
  } catch {
    // fire-and-forget: не пробрасывать ошибки
  }
}
```

### 2. Обновить `app/api/admin/users/[id]/route.ts`

Прочитать файл целиком. В PATCH-обработчике, после успешного получения `data`
из `.update(...).select(...).single()`, добавить вызов `notifyUserAccountChange`.

```typescript
import { notifyUserAccountChange } from '@/lib/notifications/notify-user-account-change'

// После получения data из update:
notifyUserAccountChange({
  userId: id,
  newRole: update.role,
  newIsActive: update.is_active,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику
PATCH-обработчика (проверку `id === auth.user.id`, валидацию `update`,
проверку прав для роли `superadmin`, возврат `data`).

### 3. Создать `__tests__/t78.test.ts`

```typescript
// notifyUserAccountChange (unit-тесты хелпера)
// 1.  newRole и newIsActive оба undefined → ранний return, не вызывает insert
// 2.  только newRole → title 'Ваша роль изменена', body содержит метку роли
// 3.  только newIsActive=false → title 'Аккаунт деактивирован'
// 4.  только newIsActive=true  → title 'Аккаунт активирован'
// 5.  оба newRole и newIsActive переданы → title 'Изменены роль и статус аккаунта'
// 6.  link = '/profile'
// 7.  после вставки вызывает fetch для dispatch-email (один раз)
// 8.  notificationId и userId передаются в dispatch-email payload
// 9.  при ошибке insert — не бросает исключение (fire-and-forget)
// 10. insert вызывается с корректным user_id

// PATCH /api/admin/users/[id] (интеграция)
// 11. при изменении role — вызывает notifyUserAccountChange (mock)
// 12. при изменении is_active — вызывает notifyUserAccountChange (mock)
// 13. notifyUserAccountChange получает userId из params
// 14. notifyUserAccountChange получает newRole из тела запроса
// 15. при невалидных данных (400) — notifyUserAccountChange не вызывается
// 16. при изменении собственного аккаунта (400) — notifyUserAccountChange не вызывается
```

#### Структура тестов

```typescript
import { notifyUserAccountChange } from '@/lib/notifications/notify-user-account-change'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'notif-uuid' },
        error: null,
      }),
    })),
  })),
}))

// Для тестов PATCH API:
jest.mock('@/lib/notifications/notify-user-account-change', () => ({
  notifyUserAccountChange: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyUserAccountChange(...)` с проверкой mock-вызовов.
Для PATCH API — прямой вызов обработчика с mock-запросом и mock-параметрами маршрута.

При тесте ошибки insert переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
  })),
})
```

Для тестов PATCH API необходим mock `lib/supabase/server` с `createClient`,
возвращающим авторизованного admin-пользователя:

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'admin-uuid' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      }),
    })),
  }),
}))
```

При тестах «невалидные данные» и «свой аккаунт» — передавать соответствующие тела/параметры
и проверять что `notifyUserAccountChange` не вызывается (expect не был вызван).

Для теста «изменение собственного аккаунта» установить `id` в params равным
`auth.user.id` ('admin-uuid') — ожидать 400 без вызова `notifyUserAccountChange`.

## Файлы для создания / изменения

- `lib/notifications/notify-user-account-change.ts` (новый)
- `app/api/admin/users/[id]/route.ts` (добавить вызов notifyUserAccountChange в PATCH)
- `__tests__/t78.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyUserAccountChange` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику PATCH (валидацию update, проверку прав superadmin, ответ)
- Читать `app/api/admin/users/[id]/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T77
- Если `update` не содержит `role` или `is_active` — уведомление не отправляется
  (хелпер сам возвращает early return при обоих undefined)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t78.test.ts)
4. При изменении роли пользователя администратором — пользователь получает уведомление «Ваша роль изменена» с меткой новой роли
5. При деактивации аккаунта администратором — пользователь получает уведомление «Аккаунт деактивирован»
6. При активации аккаунта администратором — пользователь получает уведомление «Аккаунт активирован»
7. Уведомление содержит ссылку `/profile`
8. Записать в `progress.md`: `DONE: T78 + что создано/изменено`
