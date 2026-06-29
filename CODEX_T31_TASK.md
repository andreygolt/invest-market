# T31 — Система платформенных уведомлений

## Контекст

T28, T29 и T30 не были выполнены (Codex hit usage limit). T31 реализует ту же задачу.

Платформа не информирует пользователей об изменениях статусов: инвестор не знает,
что его заявка одобрена/отклонена, а владелец проекта не знает, что проект прошёл
модерацию — они обязаны заходить и проверять вручную. Это критический UX-пробел.

T31 добавляет систему in-app уведомлений:
- При одобрении/отклонении **заявки** → уведомление инвестору
- При одобрении/отклонении **проекта** → уведомление владельцу проекта
- Колокольчик с бейджем (количество непрочитанных) появляется во всех кабинетах
- Пользователь может пометить уведомление прочитанным или закрыть все сразу

## Что нужно создать / изменить

### 1. Миграция — `supabase/migrations/012_notifications.sql`

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) NOT NULL,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL,
  link        text,
  is_read     boolean NOT NULL DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свои уведомления
CREATE POLICY "users see own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- Пользователь может обновить (пометить прочитанным) только своё
CREATE POLICY "users update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- Только сервисная роль создаёт уведомления (через admin client)
-- INSERT доступен только через service_role key (admin client)
```

### 2. TypeScript типы — `types/index.ts`

Добавить к существующим (не удалять ничего):

```typescript
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'

export interface NotificationRow {
  id: string
  user_id: string
  type: NotificationType
  title: string
  body: string
  link: string | null
  is_read: boolean
  created_at: string
}

export interface NotificationInsert {
  user_id: string
  type: NotificationType
  title: string
  body: string
  link?: string
}
```

### 3. Утилита — `lib/notifications/create.ts`

Функция для создания уведомлений через admin client (обходит RLS):

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { NotificationInsert } from '@/types'

export async function createNotification(data: NotificationInsert): Promise<void> {
  const supabase = createAdminClient()
  await supabase.from('notifications').insert(data)
  // fire-and-forget: ошибки логируем но не пробрасываем
}
```

### 4. API routes

#### `app/api/notifications/route.ts`

**GET** — список уведомлений текущего пользователя:
- 401 если не авторизован
- Возвращает `NotificationRow[]` отсортированных: сначала непрочитанные, потом по дате (`created_at DESC`)
- Лимит: 30 последних
- Query param `?unread_only=true` — только непрочитанные (для подсчёта бейджа)

**Response:**
```json
{ "notifications": [...], "unread_count": 3 }
```

#### `app/api/notifications/[id]/route.ts`

**PATCH** — пометить уведомление прочитанным:
- 401 если не авторизован
- 404 если уведомление не найдено или принадлежит другому пользователю
- Body: `{}` (достаточно PATCH-запроса — is_read устанавливается в true)
- Возвращает `{ ok: true }`

#### `app/api/notifications/read-all/route.ts`

**POST** — пометить все уведомления текущего пользователя прочитанными:
- 401 если не авторизован
- UPDATE всех записей где `user_id = auth.uid() AND is_read = false`
- Возвращает `{ ok: true, updated: N }`

### 5. Обновить существующие routes (trigger уведомлений)

#### `app/api/admin/projects/[id]/approve/route.ts`

После успешного `UPDATE projects SET status = 'approved'`:
1. Получить `owner_id` из проекта (добавить в `select`: `id, status, owner_id, name`)
2. Вызвать `createNotification`:
```typescript
await createNotification({
  user_id: project.owner_id,
  type: 'project_approved',
  title: 'Проект одобрен',
  body: `Ваш проект «${project.name}» прошёл модерацию и теперь виден инвесторам.`,
  link: '/project',
})
```

#### `app/api/admin/projects/[id]/reject/route.ts`

После успешного `UPDATE projects SET status = 'rejected'`:
1. Получить `owner_id` и `name` из проекта
2. Вызвать `createNotification`:
```typescript
await createNotification({
  user_id: project.owner_id,
  type: 'project_rejected',
  title: 'Проект отклонён',
  body: `Ваш проект «${project.name}» был отклонён модератором.`,
  link: '/project',
})
```

#### `app/api/admin/applications/[id]/route.ts`

После успешного UPDATE статуса заявки:
1. Получить `investor_id` и `project_id` из заявки (уже есть в select — добавить `investor_id`)
2. Получить название проекта из `projects` по `project_id`
3. Если `newStatus === 'approved'`:
```typescript
await createNotification({
  user_id: app.investor_id,
  type: 'application_approved',
  title: 'Заявка одобрена',
  body: `Ваша заявка на участие в проекте одобрена.`,
  link: '/applications',
})
```
4. Если `newStatus === 'rejected'`:
```typescript
await createNotification({
  user_id: app.investor_id,
  type: 'application_rejected',
  title: 'Заявка отклонена',
  body: `Ваша заявка на участие в проекте отклонена.`,
  link: '/applications',
})
```

> Примечание: `createNotification` — fire-and-forget, не влияет на основной ответ API.
> Оберни в try/catch или не await — чтобы ошибка в уведомлении не сломала основной ответ.

### 6. UI компонент — `components/notifications-bell.tsx`

Клиентский компонент (`'use client'`):

```
[Колокольчик] [3]   <- бейдж с количеством непрочитанных
```

При клике — открывается `shadcn/ui Popover` со списком уведомлений.

**Внутри Popover:**
- Заголовок «Уведомления» + кнопка «Прочитать все» (POST /api/notifications/read-all)
- Список уведомлений (shadcn/ui `ScrollArea`, max-height: 400px):
  - Каждое уведомление: `div` с:
    - `title` (полужирный если непрочитано)
    - `body` (серый текст)
    - `created_at` -> `toLocaleDateString('ru-RU')`
    - Кнопка «x» — PATCH `/api/notifications/[id]`
    - Если есть `link` — весь элемент кликабелен через `<Link>`
  - Непрочитанные — с синим левым бордером (`border-l-2 border-blue-500`)
- Если список пуст — «Нет уведомлений»

**Логика:**
- При монтировании компонента — GET `/api/notifications?unread_only=true` для бейджа
- При открытии popover — GET `/api/notifications` для полного списка
- После «Прочитать все» — обновить список и сбросить бейдж
- Использовать `useState` + `useEffect` без внешних библиотек

**Иконка:** Простая кнопка с текстом «[N]» или символ без svg-пакетов.

### 7. Добавить колокольчик в навигацию кабинетов

#### `app/(investor)/layout.tsx`
Добавить `<NotificationsBell />` в правую часть nav-бара (рядом с именем пользователя или кнопкой профиля).

#### `app/(project)/layout.tsx`
Аналогично.

#### `app/(admin)/layout.tsx`
Аналогично.

Не трогать другие элементы навигации.

### 8. Тесты — `__tests__/t31.test.ts`

```typescript
// 1. GET /api/notifications — 401 без авторизации
// 2. GET /api/notifications — 200 возвращает { notifications, unread_count } (мок supabase)
// 3. GET /api/notifications?unread_only=true — возвращает только непрочитанные
// 4. PATCH /api/notifications/[id] — 401 без авторизации
// 5. PATCH /api/notifications/[id] — 404 если уведомление не найдено
// 6. PATCH /api/notifications/[id] — 200 помечает прочитанным (мок supabase)
// 7. POST /api/notifications/read-all — 401 без авторизации
// 8. POST /api/notifications/read-all — 200 обновляет все непрочитанные (мок supabase)
// 9. createNotification вызывает supabase.from('notifications').insert(...) с правильными данными
// 10. NotificationRow имеет поля id, user_id, type, title, body, link, is_read, created_at
// 11. GET /api/notifications — unread_count соответствует числу непрочитанных в mock-данных
// 12. PATCH /api/admin/applications/[id] status=approved — ответ 200 (проверить что createNotification не ломает route)
```

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict, никаких `any`
- shadcn/ui компоненты (Popover, ScrollArea, Badge, Button)
- `createNotification` — всегда fire-and-forget, не блокирует основной response
- Не трогать файлы кроме указанных в этом ТЗ
- RLS: только сервисная роль может INSERT в notifications (через admin client)
- Лимит уведомлений в списке: 30 (не нужна пагинация)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t31.test.ts)
4. Таблица `notifications` создана с RLS
5. При одобрении/отклонении проекта — в таблице появляется запись для owner
6. При одобрении/отклонении заявки — в таблице появляется запись для инвестора
7. Колокольчик виден в nav всех трёх кабинетов
8. Popover открывается, уведомления отображаются, «Прочитать все» работает
9. Записать в `progress.md`: `DONE: T31 + что создано/изменено`
