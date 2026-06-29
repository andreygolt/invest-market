# T71 — Уведомления при изменении статуса проекта

## Контекст

T70 добавил таймлайн изменений статуса в кабинете проекта.
Владелец теперь видит историю статусов — но узнаёт об изменениях только
при заходе на страницу.

Инфраструктура уведомлений (in-app + email) уже существует (T47–T62):
- `notifications` таблица с триггером email (T60)
- `notification_preferences` — подписка на email (T61)
- `POST /api/notifications/dispatch-email` — диспатч письма

Сейчас:
- Проект отправляет заявку (`draft → submitted`) → модераторы **не получают** уведомление
- Администратор одобряет/отклоняет проект → владелец проекта **не получает** уведомление

T71 подключает статусные переходы проекта к системе уведомлений:

1. `lib/notifications/notify-project-status.ts` — хелпер создания уведомлений
2. Обновить `app/api/project/submit/route.ts` — при успешной отправке на модерацию
   создавать уведомление всем `moderator` + `admin` + `superadmin`
3. Обновить `app/api/admin/projects/[id]/approve/route.ts` — при одобрении
   создавать уведомление владельцу проекта
4. Обновить `app/api/admin/projects/[id]/reject/route.ts` — при отклонении
   создавать уведомление владельцу проекта
5. `__tests__/t71.test.ts` — тесты

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-project-status.ts`

Хелпер создаёт уведомления в таблице `notifications` (fire-and-forget).
После вставки вызывает `dispatch-email` через `fetch` (аналогично T62).

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить пользователей об изменении статуса проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyProjectStatus(params: {
  projectId: string
  projectName: string
  newStatus: 'submitted' | 'approved' | 'rejected'
  rejectionReason?: string | null
  recipientIds: string[]          // user.id получателей
  baseUrl: string                 // process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}): Promise<void> {
  const { projectId, projectName, newStatus, rejectionReason, recipientIds, baseUrl } = params
  if (recipientIds.length === 0) return

  const admin = createAdminClient()

  const titleMap: Record<string, string> = {
    submitted:    'Новый проект на проверке',
    approved:     'Проект одобрен',
    rejected:     'Проект отклонён',
  }
  const bodyMap = (name: string, reason?: string | null): Record<string, string> => ({
    submitted:    `Проект «${name}» подан на проверку и ожидает модерации.`,
    approved:     `Поздравляем! Проект «${name}» одобрен и будет опубликован в каталоге.`,
    rejected:     `Проект «${name}» отклонён.${reason ? ` Причина: ${reason}` : ''}`,
  })

  const title = titleMap[newStatus]
  const body = bodyMap(projectName, rejectionReason)[newStatus]

  const rows = recipientIds.map((userId) => ({
    user_id:   userId,
    title,
    body,
    link:      newStatus === 'submitted'
                 ? `/moderation/${projectId}`
                 : `/project`,
  }))

  try {
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

### 2. Обновить `app/api/project/submit/route.ts`

Прочитать файл целиком. После успешного обновления статуса на `submitted` добавить
вызов `notifyProjectStatus` для всех модераторов/админов.

```typescript
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status'

// После успешного update статуса проекта на 'submitted':

// Найти всех модераторов и админов
const { data: staff } = await admin
  .from('users')
  .select('id')
  .in('role', ['moderator', 'admin', 'superadmin'])

const recipientIds = (staff ?? []).map((u: { id: string }) => u.id)

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

notifyProjectStatus({
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  newStatus: 'submitted',
  recipientIds,
  baseUrl,
})
// fire-and-forget — не await
```

**Важно:** `project` уже загружен в этом route. Читать файл перед изменением.
Не менять существующую логику статусного перехода.

### 3. Обновить `app/api/admin/projects/[id]/approve/route.ts`

Прочитать файл целиком. После успешного одобрения проекта добавить уведомление
владельцу (`owner_id`).

```typescript
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status'

// После успешного approve — project.owner_id уже доступен:
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

notifyProjectStatus({
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  newStatus: 'approved',
  recipientIds: [project.owner_id],
  baseUrl,
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять логику approve.

### 4. Обновить `app/api/admin/projects/[id]/reject/route.ts`

Прочитать файл целиком. После успешного отклонения проекта добавить уведомление
владельцу с указанием причины отклонения.

```typescript
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status'

// После успешного reject — project.owner_id и rejectionReason доступны:
const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

notifyProjectStatus({
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  newStatus: 'rejected',
  rejectionReason: rejectionReason, // из тела запроса
  recipientIds: [project.owner_id],
  baseUrl,
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять логику reject.

### 5. Создать `__tests__/t71.test.ts`

```typescript
// notifyProjectStatus (unit-тесты хелпера)
// 1.  recipientIds пустой → не вызывает admin.from (ранний return)
// 2.  newStatus = 'submitted' → title 'Новый проект на проверке'
// 3.  newStatus = 'approved' → title 'Проект одобрен'
// 4.  newStatus = 'rejected' → title 'Проект отклонён'
// 5.  newStatus = 'rejected' с rejectionReason → body содержит причину
// 6.  newStatus = 'submitted' → link = '/moderation/{projectId}'
// 7.  newStatus = 'approved' → link = '/project'
// 8.  newStatus = 'rejected' → link = '/project'
// 9.  вставляет по одной строке на каждого получателя
// 10. после вставки вызывает fetch для dispatch-email (по одному разу на notification)

// POST /api/project/submit (интеграция)
// 11. при успешном submit — вызывает notifyProjectStatus (mock)
// 12. recipientIds содержат только moderator/admin/superadmin (не investor, не project)

// POST /api/admin/projects/[id]/approve (интеграция)
// 13. при успешном approve — вызывает notifyProjectStatus с newStatus='approved'
// 14. recipientIds содержит owner_id проекта

// POST/PATCH /api/admin/projects/[id]/reject (интеграция)
// 15. при успешном reject — вызывает notifyProjectStatus с newStatus='rejected'
// 16. rejectionReason передаётся в notifyProjectStatus
```

#### Структура тестов

```typescript
import { notifyProjectStatus } from '@/lib/notifications/notify-project-status'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue({
        data: [
          { id: 'notif-1', user_id: 'user-1' },
          { id: 'notif-2', user_id: 'user-2' },
        ],
        error: null,
      }),
      in:     jest.fn().mockReturnThis(),
    })),
  })),
}))

// Для тестов API-роутов — mock notifyProjectStatus:
jest.mock('@/lib/notifications/notify-project-status', () => ({
  notifyProjectStatus: jest.fn().mockResolvedValue(undefined),
}))
```

Для API-роутов — прямой вызов обработчика (POST/PATCH) с mock-запросом.
Для хелпера — вызов `notifyProjectStatus(...)` напрямую и проверка вызовов моков.

## Файлы для создания / изменения

- `lib/notifications/notify-project-status.ts` (новый)
- `app/api/project/submit/route.ts` (добавить вызов notifyProjectStatus)
- `app/api/admin/projects/[id]/approve/route.ts` (добавить вызов notifyProjectStatus)
- `app/api/admin/projects/[id]/reject/route.ts` (добавить вызов notifyProjectStatus)
- `__tests__/t71.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyProjectStatus` НЕ awaitable в route handlers — не блокировать ответ
- Не менять существующую логику submit/approve/reject
- Читать все 4 изменяемых файла перед правкой
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T62

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t71.test.ts)
4. При submit проекта — moderator/admin получают уведомление «Новый проект на проверке»
5. При одобрении проекта — владелец получает уведомление «Проект одобрен»
6. При отклонении проекта — владелец получает уведомление «Проект отклонён» + причина
7. Уведомления попадают в таблицу `notifications` и диспатчатся на email (fire-and-forget)
8. Записать в `progress.md`: `DONE: T71 + что создано/изменено`
