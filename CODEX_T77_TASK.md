# T77 — Уведомление при отзыве заявки инвестором

## Контекст

T76 завершил цепочку уведомлений для коммерческих условий.

Однако при отзыве заявки инвестором (`pending → withdrawn`) ни владелец проекта,
ни менеджеры **не получают уведомление** ✗.

Текущее состояние:
- Инвестор подаёт заявку → владелец получает «Новая заявка от инвестора» ✓ (T71/T73)
- Менеджер одобряет/отклоняет заявку → инвестор и владелец уведомлены ✓ (T73)
- Новая заявка → менеджеры уведомлены ✓ (T74)
- Инвестор отзывает заявку (`DELETE /api/investor/applications/[id]`) → **никто не уведомлён** ✗

Владелец проекта и менеджеры должны знать об отзыве заявки,
чтобы актуализировать ожидания по раунду.

Инфраструктура уведомлений уже существует (T47–T62, T71–T76):
- `notifications` таблица
- `createAdminClient` в `lib/supabase/admin.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-application-withdrawn.ts`

Хелпер уведомляет владельца проекта и всех менеджеров/администраторов
об отзыве заявки инвестором. Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить владельца проекта и менеджеров об отзыве заявки инвестором.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyApplicationWithdrawn(params: {
  applicationId: string
  projectId: string
  baseUrl: string
}): Promise<void> {
  const { applicationId, projectId, baseUrl } = params
  const admin = createAdminClient()

  try {
    // Получить владельца проекта и название
    const { data: project } = await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()

    if (!project) return

    // Получить всех менеджеров, администраторов и суперадминов
    const { data: staff } = await admin
      .from('users')
      .select('id')
      .in('role', ['manager', 'admin', 'superadmin'])

    const title = 'Инвестор отозвал заявку'
    const body = `По проекту «${project.name}» инвестор отозвал свою заявку.`
    const link = `/manager/applications`

    const ownerRow = project.owner_id
      ? [{ user_id: project.owner_id, title, body, link: '/project' }]
      : []

    const staffRows = (staff ?? []).map((u: { id: string }) => ({
      user_id: u.id,
      title,
      body,
      link,
    }))

    const rows = [...ownerRow, ...staffRows]
    if (rows.length === 0) return

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

### 2. Обновить `app/api/investor/applications/[id]/route.ts`

Прочитать файл целиком. В DELETE-обработчике, после успешного обновления
статуса на `withdrawn` (строки с `.update({ status: 'withdrawn' })`),
добавить вызов `notifyApplicationWithdrawn`.

```typescript
import { notifyApplicationWithdrawn } from '@/lib/notifications/notify-application-withdrawn'

// После успешного .update({ status: 'withdrawn' ... }):
notifyApplicationWithdrawn({
  applicationId,
  projectId: app.project_id,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику
DELETE-обработчика (проверку investor_id, статус pending, ответ `{ ok: true }`).
`app.project_id` нужно добавить в SELECT если его нет в текущем запросе.

### 3. Создать `__tests__/t77.test.ts`

```typescript
// notifyApplicationWithdrawn (unit-тесты хелпера)
// 1.  проект не найден (data = null) → ранний return, не вызывает insert
// 2.  owner_id = null, нет staff → rows пустой → ранний return, не вызывает insert
// 3.  title всегда 'Инвестор отозвал заявку'
// 4.  body содержит название проекта
// 5.  owner получает link = '/project'
// 6.  staff получают link = '/manager/applications'
// 7.  после вставки вызывает fetch для dispatch-email (по одному разу на notification)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)
// 9.  вставляет строку для owner + строки для каждого staff-пользователя
// 10. notificationId и userId передаются в dispatch-email payload

// DELETE /api/investor/applications/[id] (интеграция)
// 11. при успешном withdraw — вызывает notifyApplicationWithdrawn (mock)
// 12. notifyApplicationWithdrawn получает applicationId
// 13. notifyApplicationWithdrawn получает projectId
// 14. при статусе не pending (400) — notifyApplicationWithdrawn не вызывается
// 15. при чужой заявке (403) — notifyApplicationWithdrawn не вызывается
```

#### Структура тестов

```typescript
import { notifyApplicationWithdrawn } from '@/lib/notifications/notify-application-withdrawn'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { owner_id: 'owner-uuid', name: 'Тестовый проект', project_id: 'proj-uuid' },
        error: null,
      }),
      single: jest.fn().mockResolvedValue({
        data: { id: 'notif-uuid' },
        error: null,
      }),
    })),
  })),
}))

// Для тестов DELETE API:
jest.mock('@/lib/notifications/notify-application-withdrawn', () => ({
  notifyApplicationWithdrawn: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyApplicationWithdrawn(...)` с проверкой mock-вызовов.
Для DELETE API — прямой вызов обработчика с mock-запросом и параметрами маршрута.

При тесте «проект не найден» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
  })),
})
```

При тесте DELETE API «чужая заявка» — mock maybeSingle возвращает
`{ data: { id: 'app-id', status: 'pending', investor_id: 'other-user', project_id: 'proj-id' } }`,
запрос с `investor_id=current-user` → ожидать 403.

При тесте «статус не pending» — mock maybeSingle возвращает
`{ data: { id: 'app-id', status: 'approved', investor_id: 'investor-uuid', project_id: 'proj-id' } }` → ожидать 400.

Для мока GET staff в хелпере нужно настроить цепочку:
первый вызов `.from('projects')...maybeSingle()` — проект,
второй вызов `.from('users')...in()` — список staff.
Если mock `createAdminClient` возвращает одну цепочку, использовать
`jest.fn().mockReturnValueOnce()` последовательно или настроить `from`
через переменную со счётчиком вызовов.

## Файлы для создания / изменения

- `lib/notifications/notify-application-withdrawn.ts` (новый)
- `app/api/investor/applications/[id]/route.ts` (добавить вызов notifyApplicationWithdrawn в DELETE)
- `__tests__/t77.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyApplicationWithdrawn` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику DELETE (проверку investor_id, статус, ответ)
- Читать `app/api/investor/applications/[id]/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T76
- Если `project_id` не входит в текущий SELECT заявки — добавить его в запрос

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t77.test.ts)
4. При отзыве заявки инвестором — владелец проекта получает уведомление «Инвестор отозвал заявку» со ссылкой `/project`
5. При отзыве заявки инвестором — менеджеры/admins получают уведомление «Инвестор отозвал заявку» со ссылкой `/manager/applications`
6. Уведомление содержит название проекта
7. Записать в `progress.md`: `DONE: T77 + что создано/изменено`
