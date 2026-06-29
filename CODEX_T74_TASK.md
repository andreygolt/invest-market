# T74 — Уведомление менеджеров при новой заявке инвестора

## Контекст

T73 закрыл пробел: владелец проекта теперь получает уведомление о смене статуса
заявки инвестора.

Однако цепочка уведомлений для **менеджеров и администраторов** при поступлении
новой заявки не реализована.

Текущее состояние:
- Инвестор подаёт заявку → владелец проекта получает уведомление «Новая заявка от инвестора» ✓
  (реализовано в `app/api/investor/applications/route.ts`)
- Инвестор подаёт заявку → **менеджеры и администраторы НЕ получают уведомление** ✗

Менеджер обрабатывает заявки через `/manager/applications/[id]` (T37, T45, T64).
Без уведомления менеджер узнаёт о новых заявках только при ручном заходе в список.

T74 добавляет уведомление всем пользователям с ролями `manager`, `admin`, `superadmin`
при поступлении новой заявки от инвестора — с указанием проекта и ссылкой на кабинет
менеджера.

Инфраструктура уведомлений уже существует (T47–T62, T71–T73):
- `notifications` таблица
- `createNotification` хелпер в `lib/notifications/create.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-managers-new-application.ts`

Хелпер уведомляет всех пользователей с ролями `manager`, `admin`, `superadmin`
о новой заявке инвестора. Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить всех менеджеров и администраторов о новой заявке инвестора.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyManagersNewApplication(params: {
  applicationId: string
  projectId: string
  projectName: string
  baseUrl: string
}): Promise<void> {
  const { applicationId, projectId, projectName, baseUrl } = params
  const admin = createAdminClient()

  try {
    // Получить всех менеджеров, администраторов и суперадминов
    const { data: managers } = await admin
      .from('users')
      .select('id')
      .in('role', ['manager', 'admin', 'superadmin'])

    if (!managers || managers.length === 0) return

    const title = 'Новая заявка инвестора'
    const body = `По проекту «${projectName}» поступила новая заявка инвестора. Требуется обработка.`
    const link = `/manager/applications`

    const rows = managers.map((u: { id: string }) => ({
      user_id: u.id,
      title,
      body,
      link,
    }))

    const { data: inserted } = await admin
      .from('notifications')
      .insert(rows)
      .select('id, user_id')

    if (!inserted) return

    // fire-and-forget email dispatch
    for (const n of inserted) {
      fetch(`${baseUrl}/api/notifications/dispatch-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId: n.id, userId: n.user_id }),
      }).catch(() => {/* ignore */})
    }
  } catch {
    // fire-and-forget: не пробрасывать ошибки
  }
}
```

### 2. Обновить `app/api/investor/applications/route.ts`

Прочитать файл целиком. В POST-обработчике, после существующего вызова
уведомления для владельца проекта (строки 77–85), добавить вызов
`notifyManagersNewApplication`.

Для получения названия проекта — прочитать поле `name` из `projects`
при запросе проекта (оно уже запрашивается в этом route).

```typescript
import { notifyManagersNewApplication } from '@/lib/notifications/notify-managers-new-application'

// После существующего уведомления для владельца проекта:
notifyManagersNewApplication({
  applicationId: newApplication.id,
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику
POST-обработчика и существующее уведомление для владельца проекта.
Если `name` не входит в текущий SELECT проекта — добавить его в запрос.

### 3. Создать `__tests__/t74.test.ts`

```typescript
// notifyManagersNewApplication (unit-тесты хелпера)
// 1.  нет менеджеров (managers = []) → не вызывает insert (ранний return)
// 2.  нет менеджеров (managers = null) → не вызывает insert (ранний return)
// 3.  title всегда 'Новая заявка инвестора'
// 4.  body содержит имя проекта
// 5.  link = '/manager/applications'
// 6.  вставляет по одной строке на каждого менеджера
// 7.  после вставки вызывает fetch для dispatch-email (по одному разу на notification)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)
// 9.  запрашивает пользователей с ролями manager, admin, superadmin

// POST /api/investor/applications (интеграция)
// 10. при успешном POST — вызывает notifyManagersNewApplication (mock)
// 11. notifyManagersNewApplication получает projectId заявки
// 12. notifyManagersNewApplication получает projectName проекта
// 13. существующее уведомление владельцу проекта всё ещё вызывается (не сломано)
// 14. при ошибке создания заявки — notifyManagersNewApplication не вызывается
```

#### Структура тестов

```typescript
import { notifyManagersNewApplication } from '@/lib/notifications/notify-managers-new-application'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
    })),
  })),
}))

// Для тестов POST API:
jest.mock('@/lib/notifications/notify-managers-new-application', () => ({
  notifyManagersNewApplication: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyManagersNewApplication(...)` с проверкой mock-вызовов.
Для POST API — прямой вызов обработчика с mock-запросом.

При тесте «нет менеджеров» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: [], error: null }),
    insert: jest.fn().mockReturnThis(),
  })),
})
```

## Файлы для создания / изменения

- `lib/notifications/notify-managers-new-application.ts` (новый)
- `app/api/investor/applications/route.ts` (добавить вызов notifyManagersNewApplication)
- `__tests__/t74.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyManagersNewApplication` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику POST и существующее уведомление владельца проекта
- Читать `app/api/investor/applications/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T73

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t74.test.ts)
4. При подаче заявки инвестором — все менеджеры, admins и superadmins получают уведомление «Новая заявка инвестора»
5. Уведомление содержит ссылку `/manager/applications`
6. Существующее уведомление владельцу проекта не сломано
7. Записать в `progress.md`: `DONE: T74 + что создано/изменено`
