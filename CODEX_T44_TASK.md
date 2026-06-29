# T44 — Уведомление менеджеров о новых заявках инвесторов

## Контекст

В T42 реализовано уведомление владельца проекта при поступлении заявки инвестора.
В T35/T37 реализована система уведомлений и кабинет менеджера.

Однако когда инвестор подаёт заявку, менеджеры и администраторы платформы **не получают
никакого уведомления**. Они узнают о новых заявках только если вручную зайдут в
`/manager/applications` и проверят. Это критический операционный пробел: обработка заявок
задерживается, инвесторы ждут ответа.

T44 закрывает этот пробел: при создании заявки инвестора все пользователи с ролью
`manager`, `admin` и `superadmin` получают in-app уведомление `new_application_manager`.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить `'new_application_manager'` в `NotificationType`:

```typescript
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application'
  | 'new_application_manager'  // добавить
```

Не трогать остальные типы.

### 2. Создать `lib/notifications/notify-managers.ts`

Функция получает `projectId`, `projectName`, `applicationId` и отправляет уведомления
всем менеджерам/администраторам через `createNotification` (fire-and-forget).

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications/create'

export async function notifyManagers(
  projectId: string,
  projectName: string,
  applicationId: string,
): Promise<void> {
  const adminSupabase = createAdminClient()

  // Получить всех пользователей с ролью manager/admin/superadmin
  const { data: managers } = await adminSupabase
    .from('profiles')
    .select('id')
    .in('role', ['manager', 'admin', 'superadmin'])

  if (!managers || managers.length === 0) return

  const notifications = managers.map((m) =>
    createNotification({
      user_id: m.id,
      type: 'new_application_manager',
      title: 'Новая заявка инвестора',
      body: `По проекту «${projectName}» поступила новая заявка. Требуется рассмотрение.`,
      link: `/manager/applications/${applicationId}`,
    }),
  )

  await Promise.allSettled(notifications)
}
```

> `Promise.allSettled` — ошибка одного уведомления не блокирует остальные.
> Функция не выбрасывает исключений.

### 3. Обновить `app/api/investor/applications/route.ts`

В `POST` handler, после fire-and-forget уведомления владельца проекта (T42),
добавить fire-and-forget уведомление менеджеров:

```typescript
import { notifyManagers } from '@/lib/notifications/notify-managers'

// После блока уведомления owner_id (из T42):
if (project.owner_id) {
  void supabase.from('notifications').insert({
    user_id: project.owner_id,
    type: 'new_application',
    title: 'Новая заявка от инвестора',
    body: `По проекту «${project.name}» поступила новая заявка на рассмотрение.`,
    link: '/project',
  })
}

// Добавить после:
void notifyManagers(project.id, project.name, application.id).catch(() => {})
```

Где `application` — данные только что созданной заявки (уже есть в ответе как `data[0]` или `created`).

> Ошибка `notifyManagers` не должна влиять на HTTP-ответ (201 Created).
> `void ... .catch(() => {})` — полностью fire-and-forget.

#### Получение id созданной заявки

В текущем route после `insert` используется `select()` для получения данных — id заявки
уже доступен. Убедиться что `application.id` берётся из результата insert+select:

```typescript
const { data: appData } = await supabase
  .from('investor_applications')
  .insert({ ... })
  .select('id, ...')
  .single()

// appData.id — id заявки для ссылки в уведомлении
```

Если select уже возвращает данные — просто использовать `appData.id`.
Не менять логику insert — только добавить использование id.

### 4. Тесты — `__tests__/t44.test.ts`

```typescript
// 1. notifyManagers — вызывает createNotification для каждого менеджера/администратора
// 2. notifyManagers — запрашивает profiles с ролями manager, admin, superadmin
// 3. notifyManagers — уведомление type === 'new_application_manager'
// 4. notifyManagers — уведомление title === 'Новая заявка инвестора'
// 5. notifyManagers — уведомление link содержит applicationId ('/manager/applications/[id]')
// 6. notifyManagers — уведомление body содержит projectName
// 7. notifyManagers — если нет менеджеров, createNotification не вызывается
// 8. notifyManagers — ошибка одного createNotification не прерывает остальные (Promise.allSettled)
// 9. notifyManagers — не выбрасывает если adminSupabase возвращает ошибку
// 10. POST /api/investor/applications — 201 создаёт заявку (регрессия)
// 11. POST /api/investor/applications — вызывает notifyManagers после успешного создания
// 12. NotificationType включает 'new_application_manager'
```

### Структура моков для тестов

```typescript
// В t44.test.ts

import { notifyManagers } from '@/lib/notifications/notify-managers'

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}))

const mockMaybeSingleManagers = jest.fn().mockResolvedValue({
  data: [
    { id: 'manager-1' },
    { id: 'admin-1' },
  ],
  error: null,
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      // Финальный резолв — список менеджеров
      then: undefined,  // используй mockResolvedValue ниже
    })),
  })),
}))

// Подсказка: для теста "не выбрасывает при ошибке":
// mockCreateNotification.mockRejectedValueOnce(new Error('db error'))
// — notifyManagers не должна reject

// Для интеграционных тестов POST route — мокай notifyManagers:
jest.mock('@/lib/notifications/notify-managers', () => ({
  notifyManagers: jest.fn().mockResolvedValue(undefined),
}))
```

> Для unit-тестов `notifyManagers` — мокай `createAdminClient` так, чтобы
> `.from('profiles').select('id').in('role', [...])` резолвился в список менеджеров.
> Используй `mockReturnThis()` на `.select()` и `.in()`, финальный промис через
> `mockResolvedValue`.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не добавлять новые миграции — таблицы `profiles` и `notifications` уже существуют
- `notifyManagers` — всегда fire-and-forget, не влияет на время ответа POST
- Не трогать файлы кроме указанных:
  `types/index.ts`,
  `lib/notifications/notify-managers.ts` (новый),
  `app/api/investor/applications/route.ts`,
  `__tests__/t44.test.ts` (новый)
- Уведомления отправляются только при успешном создании заявки (201)
- Ошибка `notifyManagers` не должна менять HTTP-ответ

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t44.test.ts)
4. `NotificationType` содержит `'new_application_manager'`
5. `lib/notifications/notify-managers.ts` создан и экспортирует `notifyManagers`
6. `POST /api/investor/applications` вызывает `notifyManagers` fire-and-forget после успешного insert
7. Менеджеры и администраторы получают уведомление с ссылкой на заявку
8. Записать в `progress.md`: `DONE: T44 + что создано/изменено`
