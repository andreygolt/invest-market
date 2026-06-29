# T38 — Уведомления инвесторов об обновлениях проекта

## Контекст

В T18 реализована публикация обновлений проекта (`POST /api/project/updates`).
В T35 реализована система in-app уведомлений.

Сейчас эти две системы не связаны: когда владелец проекта публикует обновление,
заинтересованные инвесторы не узнают об этом. Они обязаны вручную проверять
страницу проекта в deal room.

T38 закрывает этот пробел: при публикации обновления проекта все заинтересованные
инвесторы получают in-app уведомление с типом `project_update`.

**Заинтересованные инвесторы** — это те, у кого данный проект:
1. Есть в таблице `applications` (статус `pending` или `approved`)
2. Есть в таблице `investor_portfolio`
3. Есть в таблице `investor_favorites`

(При пересечении — дедуплицировать, уведомление отправляется один раз.)

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить `'project_update'` в `NotificationType`:

```typescript
// БЫЛО:
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected';

// СТАЛО:
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update';
```

Не трогать остальные типы.

### 2. Создать `lib/notifications/notify-project-investors.ts`

Функция получает `project_id`, `project_name`, `update_title` и отправляет уведомления
всем заинтересованным инвесторам через `createNotification` (fire-and-forget).

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import { createNotification } from '@/lib/notifications/create'

export async function notifyProjectInvestors(
  projectId: string,
  projectName: string,
  updateTitle: string,
): Promise<void> {
  const adminSupabase = createAdminClient()

  // Собрать investor_id из applications (pending/approved)
  const { data: appRows } = await adminSupabase
    .from('applications')
    .select('investor_id')
    .eq('project_id', projectId)
    .in('status', ['pending', 'approved'])

  // Собрать investor_id из investor_portfolio
  const { data: portfolioRows } = await adminSupabase
    .from('investor_portfolio')
    .select('investor_id')
    .eq('project_id', projectId)

  // Собрать investor_id из investor_favorites
  const { data: favRows } = await adminSupabase
    .from('investor_favorites')
    .select('investor_id')
    .eq('project_id', projectId)

  // Дедуплицировать
  const investorIds = new Set<string>([
    ...(appRows ?? []).map((r) => r.investor_id),
    ...(portfolioRows ?? []).map((r) => r.investor_id),
    ...(favRows ?? []).map((r) => r.investor_id),
  ])

  // Отправить уведомление каждому инвестору
  const notifications = Array.from(investorIds).map((investorId) =>
    createNotification({
      user_id: investorId,
      type: 'project_update',
      title: `Обновление: ${projectName}`,
      body: updateTitle,
      link: `/deals/${projectId}`,
    }),
  )

  await Promise.allSettled(notifications)
}
```

> Используем `Promise.allSettled` чтобы ошибка одного уведомления не блокировала остальные.
> Функция не выбрасывает исключений — оберни вызов в try/catch на стороне caller.

### 3. Обновить `app/api/project/updates/route.ts`

#### 3a. Обновить `getCurrentProject` — добавить `name` в select:

```typescript
// БЫЛО:
const { data, error } = await supabase
  .from('projects')
  .select('id')
  .eq('owner_id', userId)
  .maybeSingle();

// СТАЛО:
const { data, error } = await supabase
  .from('projects')
  .select('id, name')
  .eq('owner_id', userId)
  .maybeSingle();
```

Обновить возвращаемый тип (inline, без создания лишних интерфейсов):

```typescript
// вместо { project: data, error } — data теперь { id: string; name: string } | null
```

#### 3b. В `POST` handler — после успешного insert вызвать notify (fire-and-forget):

```typescript
// После:
const created = data as ProjectUpdate;
void generateUpdateSummary(created.id);

// Добавить:
void notifyProjectInvestors(project.id, project.name, parsed.title).catch(() => {})
```

Импорт добавить в начало файла:
```typescript
import { notifyProjectInvestors } from '@/lib/notifications/notify-project-investors'
```

### 4. Тесты — `__tests__/t38.test.ts`

```typescript
// 1. notifyProjectInvestors — вызывает createNotification для каждого investor_id из applications
// 2. notifyProjectInvestors — вызывает createNotification для каждого investor_id из investor_portfolio
// 3. notifyProjectInvestors — вызывает createNotification для каждого investor_id из investor_favorites
// 4. notifyProjectInvestors — дедуплицирует: если investor присутствует в нескольких таблицах,
//    createNotification вызывается только один раз для него
// 5. notifyProjectInvestors — не вызывает createNotification если нет заинтересованных инвесторов
// 6. notifyProjectInvestors — уведомление имеет type='project_update', title содержит projectName,
//    body = updateTitle, link = `/deals/${projectId}`
// 7. notifyProjectInvestors — приложения со статусом 'rejected' и 'cancelled' НЕ попадают в список
// 8. POST /api/project/updates — 201 успешный ответ (регрессия: route работает как прежде)
// 9. POST /api/project/updates — 401 без авторизации
// 10. POST /api/project/updates — 400 при пустом title
// 11. NotificationType включает 'project_update' (проверка типа через ts-expect-error)
// 12. notifyProjectInvestors — не выбрасывает если adminSupabase возвращает ошибку (resilience)
```

### Структура моков для тестов

```typescript
// Mock createNotification
jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}))

// Mock createAdminClient
jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      // вернуть данные в зависимости от таблицы
      then: /* ... */
    })),
  })),
}))
```

> Подсказка: используй `mockResolvedValueOnce` для разных таблиц в одном тесте.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не трогать файлы кроме указанных в этом ТЗ
- `notifyProjectInvestors` — всегда fire-and-forget, не влияет на время ответа POST /api/project/updates
- Не добавлять новые миграции — все таблицы уже существуют
- RLS: чтение `applications`, `investor_portfolio`, `investor_favorites` происходит через admin client (обходит RLS)
- Уведомление отправляется только при успешном создании update (после `insert ... select`)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t38.test.ts)
4. `NotificationType` содержит `'project_update'`
5. `lib/notifications/notify-project-investors.ts` создан и экспортирует `notifyProjectInvestors`
6. `POST /api/project/updates` вызывает `notifyProjectInvestors` fire-and-forget после успешного insert
7. Дедупликация инвесторов работает корректно (Set по investor_id)
8. Записать в `progress.md`: `DONE: T38 + что создано/изменено`
