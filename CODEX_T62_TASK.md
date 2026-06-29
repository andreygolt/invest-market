# T62 — Подписка на обновления проекта: уведомления инвесторам при публикации апдейтов

## Контекст

T18 реализовал систему обновлений проекта (`project_updates`): проект может публиковать
апдейты о ходе дел. T11 — избранное инвестора. T10 — заявки инвесторов на проекты.

Сейчас инвестор не узнаёт о новых апдейтах проекта, пока сам не зайдёт на deal room.
T62 подключает эти системы к уведомлениям: при публикации нового апдейта проекта
все инвесторы, добавившие этот проект в избранное или подавшие заявку, получают
in-app уведомление (и email, если не отписались — через существующий pipeline T60/T61).

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-project-update.ts`

Хелпер — находит подписчиков проекта (избранное + заявки) и создаёт им уведомления.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { dispatchNotificationEmail } from '@/lib/email/dispatch'

/**
 * Создаёт уведомления для всех инвесторов, подписанных на проект:
 *  — добавивших проект в избранное (investor_favorites)
 *  — подавших заявку (investor_applications)
 * Дубли по user_id удаляются. Fire-and-forget вызов email dispatch.
 */
export async function notifyProjectUpdate(params: {
  projectId: string
  projectName: string
  updateTitle: string
  updateId: string
}): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  // Собрать уникальные user_id из избранного и заявок
  const [favResult, appResult] = await Promise.all([
    admin
      .from('investor_favorites')
      .select('user_id')
      .eq('project_id', params.projectId),
    admin
      .from('investor_applications')
      .select('user_id')
      .eq('project_id', params.projectId),
  ])

  const userIds = [
    ...new Set([
      ...(favResult.data ?? []).map((r) => r.user_id as string),
      ...(appResult.data ?? []).map((r) => r.user_id as string),
    ]),
  ]

  if (userIds.length === 0) return

  const notifications = userIds.map((userId) => ({
    user_id: userId,
    title: `Новое обновление: ${params.projectName}`,
    message: params.updateTitle,
    link: `${appUrl}/deals/${params.projectId}`,
    read: false,
  }))

  const { data, error } = await admin
    .from('notifications')
    .insert(notifications)
    .select('id')

  if (error || !data) return

  for (const notif of data) {
    if (notif.id) dispatchNotificationEmail(notif.id as string)
  }
}
```

### 2. Обновить `app/api/project/updates/route.ts`

Прочитать файл. Найти POST-обработчик — после успешного INSERT апдейта вызвать
`notifyProjectUpdate`.

Нужно загрузить название проекта (`projects.name`) чтобы передать в уведомление:

```typescript
import { notifyProjectUpdate } from '@/lib/notifications/notify-project-update'

// После успешного insert апдейта (data содержит новый апдейт):
// Загрузить название проекта
const { data: project } = await supabaseAdmin  // или существующий клиент
  .from('projects')
  .select('name')
  .eq('id', projectId)
  .single()

notifyProjectUpdate({
  projectId,
  projectName: project?.name ?? 'Проект',
  updateTitle: body.title,   // поле заголовка апдейта из body
  updateId: data.id,
}).catch(() => {/* intentionally silent */})
```

**Важно:** вызов `notifyProjectUpdate` — fire-and-forget (`.catch(() => {})`).
Не менять логику создания апдейта. Только добавить вызов после успешного insert.

Если POST-обработчик использует user-клиент (не admin) — для загрузки проекта
использовать тот же клиент (он уже прошёл RLS, раз проект виден пользователю).

### 3. Обновить `types/index.ts`

Добавить (если ещё нет) вспомогательный тип для уведомления о проекте:

```typescript
export interface ProjectUpdateNotification {
  projectId: string
  projectName: string
  updateTitle: string
  updateId: string
}
```

### 4. Создать `__tests__/t62.test.ts`

```typescript
// notifyProjectUpdate()
// 1.  возвращает undefined (не бросает) если userIds пустой
// 2.  собирает user_id из investor_favorites
// 3.  собирает user_id из investor_applications
// 4.  дедуплицирует user_id (один пользователь в избранном И с заявкой)
// 5.  вставляет уведомление для каждого уникального user_id
// 6.  формирует title = "Новое обновление: {projectName}"
// 7.  формирует link = "{appUrl}/deals/{projectId}"
// 8.  вызывает dispatchNotificationEmail для каждого вставленного уведомления
// 9.  не вызывает insert если userIds пустой
// 10. не вызывает dispatchNotificationEmail если insert вернул error
// 11. не вызывает dispatchNotificationEmail если insert вернул пустой data

// POST /api/project/updates
// 12. 401 без авторизации
// 13. 400 если обязательное поле отсутствует (title или content)
// 14. 201/200 при успешном создании апдейта
// 15. вызывает notifyProjectUpdate после успешного создания апдейта
// 16. не вызывает notifyProjectUpdate если insert апдейта вернул ошибку
```

#### Структура моков

```typescript
import { notifyProjectUpdate } from '@/lib/notifications/notify-project-update'

// ── notifyProjectUpdate ───────────────────────────────────────────
const mockFavSelect = jest.fn()
const mockAppSelect = jest.fn()
const mockNotifInsert = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'investor_favorites') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn(() => ({ data: [{ user_id: 'user-1' }], error: null })),
        }
      }
      if (table === 'investor_applications') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn(() => ({ data: [{ user_id: 'user-2' }], error: null })),
        }
      }
      if (table === 'notifications') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn(() =>
            Promise.resolve({ data: [{ id: 'notif-1' }, { id: 'notif-2' }], error: null })
          ),
        }
      }
      return {}
    }),
  })),
}))

jest.mock('@/lib/email/dispatch', () => ({
  dispatchNotificationEmail: jest.fn(),
}))

// ── POST /api/project/updates ─────────────────────────────────────
jest.mock('@/lib/notifications/notify-project-update', () => ({
  notifyProjectUpdate: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'project-owner-1' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'update-1', title: 'Тест', content: 'Текст', project_id: 'proj-1' },
        error: null,
      }),
    })),
  })),
}))
```

## Файлы для создания / изменения

- `lib/notifications/notify-project-update.ts` (новый)
- `app/api/project/updates/route.ts` (обновить: добавить вызов notifyProjectUpdate в POST)
- `types/index.ts` (добавить ProjectUpdateNotification)
- `__tests__/t62.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- `notifyProjectUpdate` — fire-and-forget, не блокирует ответ
- Не менять логику создания апдейта, только добавить вызов после успешного insert
- Не трогать другие файлы кроме указанных
- Использовать существующие таблицы `investor_favorites` и `investor_applications`
- Использовать существующий `dispatchNotificationEmail` из `lib/email/dispatch.ts` (T60)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t62.test.ts)
4. `notifyProjectUpdate()` — не бросает ошибку если подписчиков нет
5. `notifyProjectUpdate()` — дедуплицирует user_id из favorites и applications
6. `notifyProjectUpdate()` — вызывает `dispatchNotificationEmail` для каждого вставленного уведомления
7. `POST /api/project/updates` — вызывает `notifyProjectUpdate` fire-and-forget после успешного insert
8. Записать в `progress.md`: `DONE: T62 + что создано/изменено`
