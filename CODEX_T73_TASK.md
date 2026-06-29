# T73 — Уведомление владельца проекта при смене статуса заявки инвестора

## Контекст

T72 завершил цепочку уведомлений при одобрении проекта: все инвесторы
получают «Новая инвестиционная возможность».

Однако цепочка уведомлений для **владельца проекта** неполна.

Текущее состояние:
- Инвестор подаёт заявку → владелец получает уведомление «Новая заявка от инвестора» ✓
  (реализовано в `app/api/investor/applications/route.ts`, строки 77–85)
- Менеджер одобряет/отклоняет заявку → **владелец НЕ получает уведомление** ✗
- Инвестор получает уведомление об итоге заявки ✓
  (реализовано в `app/api/admin/applications/[id]/route.ts`, строки 115–136)

T73 закрывает этот пробел: при смене статуса заявки на `approved` или `rejected`
владелец проекта получает in-app уведомление с указанием инструмента (если есть)
и ссылкой на кабинет проекта.

Инфраструктура уведомлений уже существует (T47–T62, T71, T72):
- `notifications` таблица
- `createNotification` хелпер в `lib/notifications/create.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-owner-application-status.ts`

Хелпер уведомляет владельца проекта о смене статуса заявки инвестора.
Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

export async function notifyOwnerApplicationStatus(params: {
  applicationId: string
  projectId: string
  newStatus: 'approved' | 'rejected'
  baseUrl: string
}): Promise<void> {
  const { applicationId, projectId, newStatus, baseUrl } = params
  const admin = createAdminClient()

  try {
    // Получить владельца проекта и название
    const { data: project } = await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()

    if (!project?.owner_id) return

    const isApproved = newStatus === 'approved'
    const title = isApproved
      ? 'Заявка инвестора одобрена'
      : 'Заявка инвестора отклонена'
    const body = isApproved
      ? `По проекту «${project.name}» одобрена заявка инвестора. Инвестор приглашён к участию.`
      : `По проекту «${project.name}» отклонена заявка инвестора.`
    const link = '/project'

    const { data: inserted } = await admin
      .from('notifications')
      .insert({
        user_id: project.owner_id,
        title,
        body,
        link,
      })
      .select('id')
      .single()

    if (!inserted?.id) return

    // fire-and-forget email dispatch
    fetch(`${baseUrl}/api/notifications/dispatch-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notificationId: inserted.id, userId: project.owner_id }),
    }).catch(() => {/* ignore */})
  } catch {
    // fire-and-forget: не пробрасывать ошибки
  }
}
```

### 2. Обновить `app/api/admin/applications/[id]/route.ts`

Прочитать файл целиком. В PATCH-обработчике, после существующего вызова
`createNotification` для инвестора (строки 115–136), добавить вызов
`notifyOwnerApplicationStatus` для владельца проекта.

```typescript
import { notifyOwnerApplicationStatus } from '@/lib/notifications/notify-owner-application-status'

// После существующего void createNotification({ user_id: app.investor_id, ... }):
if (newStatus === 'approved' || newStatus === 'rejected') {
  notifyOwnerApplicationStatus({
    applicationId,
    projectId: app.project_id,
    newStatus,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  })
  // fire-and-forget — не await
}
```

**Важно:** читать файл перед изменением. Не менять существующую логику
PATCH-обработчика и существующий вызов `createNotification` для инвестора.

### 3. Создать `__tests__/t73.test.ts`

```typescript
// notifyOwnerApplicationStatus (unit-тесты хелпера)
// 1.  проект не найден (data = null) → ранний return, не вызывает insert
// 2.  owner_id = null → ранний return, не вызывает insert
// 3.  newStatus = 'approved' → title 'Заявка инвестора одобрена'
// 4.  newStatus = 'rejected' → title 'Заявка инвестора отклонена'
// 5.  body содержит название проекта
// 6.  link = '/project'
// 7.  после вставки вызывает fetch для dispatch-email (один раз)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)

// PATCH /api/admin/applications/[id] (интеграция)
// 9.  при approve — вызывает notifyOwnerApplicationStatus (mock)
// 10. при reject  — вызывает notifyOwnerApplicationStatus (mock)
// 11. при approve — notifyOwnerApplicationStatus получает newStatus = 'approved'
// 12. при reject  — notifyOwnerApplicationStatus получает newStatus = 'rejected'
// 13. createNotification для инвестора (T43/существующее) всё ещё вызывается — не сломан
// 14. при переходе в недопустимый статус (cancelled → approved) — 400, notifyOwnerApplicationStatus не вызывается
```

#### Структура тестов

```typescript
import { notifyOwnerApplicationStatus } from '@/lib/notifications/notify-owner-application-status'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { owner_id: 'owner-uuid', name: 'Тестовый проект' },
        error: null,
      }),
    })),
  })),
}))

// Для тестов PATCH API:
jest.mock('@/lib/notifications/notify-owner-application-status', () => ({
  notifyOwnerApplicationStatus: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/audit/log', () => ({
  writeAuditLog: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyOwnerApplicationStatus(...)` с проверкой mock-вызовов.
Для PATCH API — прямой вызов обработчика с mock-запросом.

При тесте «проект не найден» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
  })),
})
```

## Файлы для создания / изменения

- `lib/notifications/notify-owner-application-status.ts` (новый)
- `app/api/admin/applications/[id]/route.ts` (добавить вызов notifyOwnerApplicationStatus)
- `__tests__/t73.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyOwnerApplicationStatus` НЕ awaitable в route handler
- Не менять существующую логику PATCH и существующий `createNotification` для инвестора
- Читать `app/api/admin/applications/[id]/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71, T72

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t73.test.ts)
4. При одобрении заявки менеджером — владелец проекта получает уведомление «Заявка инвестора одобрена»
5. При отклонении заявки менеджером — владелец проекта получает уведомление «Заявка инвестора отклонена»
6. Существующее уведомление инвестору (при смене статуса) не сломано
7. Записать в `progress.md`: `DONE: T73 + что создано/изменено`
