# T46 — Уведомление модераторов при поступлении нового проекта на модерацию

## Контекст

В T44 реализовано уведомление менеджеров/администраторов при поступлении новой заявки
инвестора. В T35/T36 реализована система уведомлений и процесс повторной подачи проекта.

Однако когда владелец проекта отправляет проект на модерацию (`POST /api/project/submit`),
модераторы и администраторы платформы **не получают никакого уведомления**. Они узнают
о новых проектах только если вручную зайдут в `/moderation` и проверят список.
Это критический операционный пробел: рассмотрение проектов задерживается, владельцы ждут ответа.

T46 закрывает этот пробел по аналогии с T44: при отправке проекта на модерацию
все пользователи с ролью `moderator`, `admin` и `superadmin` получают in-app уведомление
`new_project_submission`.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить `'new_project_submission'` в `NotificationType`:

```typescript
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application'
  | 'new_application_manager'
  | 'new_project_submission'  // добавить
```

Не трогать остальные типы.

### 2. Создать `lib/notifications/notify-moderators.ts`

Функция получает `projectId` и `projectName`, отправляет уведомления
всем модераторам/администраторам через `createNotification` (fire-and-forget).

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications/create'

export async function notifyModerators(
  projectId: string,
  projectName: string,
): Promise<void> {
  const adminSupabase = createAdminClient()

  // Получить всех пользователей с ролью moderator/admin/superadmin
  const { data: moderators } = await adminSupabase
    .from('profiles')
    .select('id')
    .in('role', ['moderator', 'admin', 'superadmin'])

  if (!moderators || moderators.length === 0) return

  const notifications = moderators.map((m) =>
    createNotification({
      user_id: m.id,
      type: 'new_project_submission',
      title: 'Новый проект на модерацию',
      body: `Проект «${projectName}» отправлен на рассмотрение. Требуется проверка.`,
      link: `/moderation/${projectId}`,
    }),
  )

  await Promise.allSettled(notifications)
}
```

> `Promise.allSettled` — ошибка одного уведомления не блокирует остальные.
> Функция не выбрасывает исключений.

### 3. Обновить `app/api/project/submit/route.ts`

#### 3a. Добавить `name` в select проекта

```typescript
// БЫЛО:
const { data: project } = await supabase
  .from('projects')
  .select('id, status')
  .eq('owner_id', user.id)
  .maybeSingle();

// СТАЛО:
const { data: project } = await supabase
  .from('projects')
  .select('id, status, name')
  .eq('owner_id', user.id)
  .maybeSingle();
```

#### 3b. Добавить fire-and-forget уведомление модераторов

После блока записи в `project_status_log` (и перед запуском AI-извлечения), добавить:

```typescript
import { notifyModerators } from '@/lib/notifications/notify-moderators'

// После await adminSupabase.from('project_status_log').insert({...}):
void notifyModerators(project.id, project.name ?? 'Без названия').catch(() => {})
```

> Ошибка `notifyModerators` не должна влиять на HTTP-ответ.
> `void ... .catch(() => {})` — полностью fire-and-forget.

> `project.name` может быть `null` если анкета ещё не содержит названия —
> поэтому используем фоллбэк `'Без названия'`.

### 4. Тесты — `__tests__/t46.test.ts`

```typescript
// 1. notifyModerators — вызывает createNotification для каждого модератора/администратора
// 2. notifyModerators — запрашивает profiles с ролями moderator, admin, superadmin
// 3. notifyModerators — уведомление type === 'new_project_submission'
// 4. notifyModerators — уведомление title === 'Новый проект на модерацию'
// 5. notifyModerators — уведомление link содержит projectId ('/moderation/[id]')
// 6. notifyModerators — уведомление body содержит projectName
// 7. notifyModerators — если нет модераторов, createNotification не вызывается
// 8. notifyModerators — ошибка одного createNotification не прерывает остальные (Promise.allSettled)
// 9. notifyModerators — не выбрасывает если adminSupabase возвращает ошибку
// 10. POST /api/project/submit — 200 отправляет проект (регрессия)
// 11. POST /api/project/submit — вызывает notifyModerators после успешного обновления статуса
// 12. NotificationType включает 'new_project_submission'
```

### Структура моков для тестов

```typescript
import { notifyModerators } from '@/lib/notifications/notify-moderators'

jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}))

const mockMaybeSingleProject = jest.fn().mockResolvedValue({
  data: { id: 'proj-1', status: 'draft', name: 'Тестовый проект' },
  error: null,
})
const mockMaybeSingleQuestionnaire = jest.fn().mockResolvedValue({
  data: [{ section: 's1' }],
  error: null,
})
const mockUpdateProject = jest.fn().mockResolvedValue({ error: null })
const mockInsertLog = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: mockMaybeSingleProject,
        }
      }
      if (table === 'project_questionnaire') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: mockMaybeSingleQuestionnaire,
        }
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis() }
    }),
  })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'projects') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: mockUpdateProject,
        }
      }
      if (table === 'project_status_log') {
        return { insert: mockInsertLog }
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          in: jest.fn().mockResolvedValue({
            data: [{ id: 'mod-1' }, { id: 'admin-1' }],
            error: null,
          }),
        }
      }
      return {}
    }),
  })),
}))

// Для интеграционных тестов POST route — мокай notifyModerators:
jest.mock('@/lib/notifications/notify-moderators', () => ({
  notifyModerators: jest.fn().mockResolvedValue(undefined),
}))
```

> Для unit-тестов `notifyModerators` — мокай `createAdminClient` так, чтобы
> `.from('profiles').select('id').in('role', [...])` резолвился в список модераторов.
> Используй `mockReturnThis()` на `.select()`, финальный промис через
> `.in(...)` с `mockResolvedValue`.

## Файлы для изменения

- `types/index.ts` — добавить `'new_project_submission'` в `NotificationType`
- `lib/notifications/notify-moderators.ts` (новый)
- `app/api/project/submit/route.ts` — добавить `name` в select + вызов `notifyModerators`
- `__tests__/t46.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не добавлять новые миграции — таблицы `profiles` и `notifications` уже существуют
- `notifyModerators` — всегда fire-and-forget, не влияет на время ответа POST
- Не трогать файлы кроме указанных выше
- Уведомления отправляются только при успешном обновлении статуса проекта
- Ошибка `notifyModerators` не должна менять HTTP-ответ (всегда `{ status: 'submitted' }`)
- Работает при первичной подаче (`draft → submitted`) и повторной (`rejected → submitted`)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t46.test.ts)
4. `NotificationType` содержит `'new_project_submission'`
5. `lib/notifications/notify-moderators.ts` создан и экспортирует `notifyModerators`
6. `POST /api/project/submit` вызывает `notifyModerators` fire-and-forget после успешного update
7. Модераторы и администраторы получают уведомление с ссылкой на проект в `/moderation/[id]`
8. Записать в `progress.md`: `DONE: T46 + что создано/изменено`
