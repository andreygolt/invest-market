# T79 — Уведомление инвесторов при публикации обновления проекта

## Контекст

T78 завершил цепочку уведомлений при изменении роли/статуса пользователя администратором.

Однако когда проект публикует новое обновление (`POST /api/project/updates`),
инвесторы, подавшие заявку на этот проект, **не получают уведомление** ✗.

Текущее состояние:
- Проект публикует обновление → инвесторы **не уведомлены** ✗
- Инвестор видит обновления только при ручном заходе в Deal Room `/deals/[id]`

Обновления проекта (T18) уже реализованы:
- `POST /api/project/updates` — создаёт новое обновление
- `GET /api/investor/deals/[id]/updates` — инвесторы могут читать обновления
- Таблица `project_updates` существует

Инфраструктура уведомлений уже существует (T47–T62, T71–T78):
- `notifications` таблица
- `createAdminClient` в `lib/supabase/admin.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-project-update.ts`

Хелпер уведомляет всех инвесторов, имеющих заявку (в статусе не `withdrawn` и не `rejected`)
на данный проект, о новом обновлении. Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить инвесторов с активными заявками о новом обновлении проекта.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyProjectUpdate(params: {
  projectId: string
  projectName: string
  updateTitle: string
  baseUrl: string
}): Promise<void> {
  const { projectId, projectName, updateTitle, baseUrl } = params
  const admin = createAdminClient()

  try {
    // Получить всех инвесторов с активными заявками на этот проект
    const { data: applications } = await admin
      .from('applications')
      .select('investor_id')
      .eq('project_id', projectId)
      .not('status', 'in', '("withdrawn","rejected")')

    if (!applications || applications.length === 0) return

    // Дедупликация: один инвестор может иметь несколько заявок
    const uniqueInvestorIds = [...new Set(
      (applications as { investor_id: string }[]).map((a) => a.investor_id)
    )]

    const title = 'Новое обновление от проекта'
    const body = `Проект «${projectName}» опубликовал новое обновление: «${updateTitle}».`
    const link = `/deals/${projectId}`

    const rows = uniqueInvestorIds.map((userId) => ({
      user_id: userId,
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

### 2. Обновить `app/api/project/updates/route.ts`

Прочитать файл целиком. В POST-обработчике, после успешного создания обновления
(получения `data` из `.insert(...).select(...).single()`), добавить вызов
`notifyProjectUpdate`.

```typescript
import { notifyProjectUpdate } from '@/lib/notifications/notify-project-update'

// После успешного создания обновления (data содержит созданную запись):
// project уже доступен в route (или получить его отдельно)
notifyProjectUpdate({
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  updateTitle: data.title,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику
POST-обработчика (проверку авторизации, валидацию полей, вставку обновления).
Если `project.name` не входит в текущий SELECT проекта — добавить `name` в запрос.

### 3. Создать `__tests__/t79.test.ts`

```typescript
// notifyProjectUpdate (unit-тесты хелпера)
// 1.  нет заявок (applications = []) → не вызывает insert (ранний return)
// 2.  нет заявок (applications = null) → не вызывает insert (ранний return)
// 3.  title всегда 'Новое обновление от проекта'
// 4.  body содержит имя проекта
// 5.  body содержит updateTitle
// 6.  link = '/deals/{projectId}'
// 7.  вставляет по одной строке на уникального инвестора
// 8.  дедупликация: несколько заявок от одного инвестора → одно уведомление
// 9.  после вставки вызывает fetch для dispatch-email (по одному разу на notification)
// 10. при ошибке insert — не бросает исключение (fire-and-forget)
// 11. запрашивает заявки только для данного project_id
// 12. исключает статусы 'withdrawn' и 'rejected'

// POST /api/project/updates (интеграция)
// 13. при успешном POST — вызывает notifyProjectUpdate (mock)
// 14. notifyProjectUpdate получает projectId проекта
// 15. notifyProjectUpdate получает updateTitle из тела запроса
// 16. при ошибке создания обновления (400) — notifyProjectUpdate не вызывается
// 17. при неавторизованном запросе (401) — notifyProjectUpdate не вызывается
```

#### Структура тестов

```typescript
import { notifyProjectUpdate } from '@/lib/notifications/notify-project-update'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      not:    jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      // По умолчанию возвращает 2 инвестора
      // Отдельные тест-кейсы переопределяют mock
    })),
  })),
}))

// Для тестов POST API:
jest.mock('@/lib/notifications/notify-project-update', () => ({
  notifyProjectUpdate: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyProjectUpdate(...)` с проверкой mock-вызовов.
Для POST API — прямой вызов обработчика с mock-запросом и mock-параметрами маршрута.

При тесте «нет заявок» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    not:    jest.fn().mockResolvedValue({ data: [], error: null }),
    insert: jest.fn().mockReturnThis(),
  })),
})
```

При тесте «дедупликация» передать массив с двумя заявками от одного `investor_id`
и проверить, что `insert` вызван с одной строкой (один `user_id`).

Для тестов POST API необходим mock `lib/supabase/server` с `createClient`,
возвращающим авторизованного project-пользователя:

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'project-owner-uuid' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'project' },
        error: null,
      }),
      insert: jest.fn().mockReturnThis(),
    })),
  }),
}))
```

Для мока adminClient в POST API (получение проекта и вставка обновления) — настроить
`createAdminClient` через переменную с ветвлением по таблице.

## Файлы для создания / изменения

- `lib/notifications/notify-project-update.ts` (новый)
- `app/api/project/updates/route.ts` (добавить вызов notifyProjectUpdate в POST)
- `__tests__/t79.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyProjectUpdate` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику POST (проверку авторизации, валидацию, вставку)
- Читать `app/api/project/updates/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- Уведомлять только инвесторов с активными заявками (не `withdrawn`, не `rejected`)
- Дедупликация по `investor_id` — один инвестор получает одно уведомление
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T78

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t79.test.ts)
4. При публикации нового обновления проектом — инвесторы с активными заявками получают уведомление «Новое обновление от проекта»
5. Уведомление содержит название проекта, заголовок обновления и ссылку `/deals/{projectId}`
6. Один инвестор с несколькими заявками получает только одно уведомление
7. Инвесторы со статусом заявки `withdrawn` или `rejected` не уведомляются
8. Записать в `progress.md`: `DONE: T79 + что создано/изменено`
