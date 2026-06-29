# T72 — Уведомление инвесторов о новом проекте в каталоге

## Контекст

T71 подключил уведомления при изменении статуса проекта:
- submit → модераторы/админы получают «Новый проект на проверке»
- approve/reject → владелец получает уведомление

Однако когда проект одобрен и появляется в каталоге, инвесторы об этом
**не узнают** — им нужно самостоятельно заходить в каталог.

T72 добавляет уведомление всем активным инвесторам при одобрении проекта:
«Новая инвестиционная возможность в каталоге».

Инфраструктура уведомлений уже существует (T47–T62, T71):
- `notifications` таблица
- `POST /api/notifications/dispatch-email` — диспатч письма
- `notifyProjectStatus` хелпер в `lib/notifications/notify-project-status.ts`

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-investors-new-deal.ts`

Хелпер уведомляет всех пользователей с ролью `investor` о новом проекте
в каталоге. Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить всех инвесторов о новом проекте в каталоге.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyInvestorsNewDeal(params: {
  projectId: string
  projectName: string
  baseUrl: string
}): Promise<void> {
  const { projectId, projectName, baseUrl } = params
  const admin = createAdminClient()

  try {
    // Получить всех активных инвесторов
    const { data: investors } = await admin
      .from('users')
      .select('id')
      .eq('role', 'investor')

    if (!investors || investors.length === 0) return

    const title = 'Новая инвестиционная возможность'
    const body = `Проект «${projectName}» доступен в каталоге. Ознакомьтесь с условиями инвестирования.`
    const link = `/deals/${projectId}`

    const rows = investors.map((u: { id: string }) => ({
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

### 2. Обновить `app/api/admin/projects/[id]/approve/route.ts`

Прочитать файл целиком. После существующего вызова `notifyProjectStatus`
(из T71) добавить вызов `notifyInvestorsNewDeal`.

```typescript
import { notifyInvestorsNewDeal } from '@/lib/notifications/notify-investors-new-deal'

// После notifyProjectStatus(...) для owner:
notifyInvestorsNewDeal({
  projectId: project.id,
  projectName: project.name ?? 'Без названия',
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику approve
и вызов `notifyProjectStatus` из T71.

### 3. Создать `__tests__/t72.test.ts`

```typescript
// notifyInvestorsNewDeal (unit-тесты хелпера)
// 1.  нет инвесторов (investors = []) → не вызывает insert (ранний return)
// 2.  нет инвесторов (investors = null) → не вызывает insert (ранний return)
// 3.  title всегда 'Новая инвестиционная возможность'
// 4.  body содержит имя проекта
// 5.  link = '/deals/{projectId}'
// 6.  вставляет по одной строке на каждого инвестора
// 7.  после вставки вызывает fetch для dispatch-email (по одному разу на notification)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)

// POST /api/admin/projects/[id]/approve (интеграция)
// 9.  при успешном approve — вызывает notifyInvestorsNewDeal (mock)
// 10. notifyInvestorsNewDeal получает projectId проекта
// 11. notifyInvestorsNewDeal получает projectName проекта
// 12. notifyProjectStatus (T71) всё ещё вызывается для owner (не сломан T71)
```

#### Структура тестов

```typescript
import { notifyInvestorsNewDeal } from '@/lib/notifications/notify-investors-new-deal'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      // По умолчанию возвращает 2 инвестора
      // Отдельные тест-кейсы переопределяют mock для проверки пустого списка
    })),
  })),
}))

// Для тестов approve API:
jest.mock('@/lib/notifications/notify-investors-new-deal', () => ({
  notifyInvestorsNewDeal: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/notifications/notify-project-status', () => ({
  notifyProjectStatus: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyInvestorsNewDeal(...)` с проверкой mock-вызовов.
Для approve API — прямой вызов обработчика (POST) с mock-запросом.

При тесте «нет инвесторов» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockResolvedValue({ data: [], error: null }),
    insert: jest.fn().mockReturnThis(),
  })),
})
```

## Файлы для создания / изменения

- `lib/notifications/notify-investors-new-deal.ts` (новый)
- `app/api/admin/projects/[id]/approve/route.ts` (добавить вызов notifyInvestorsNewDeal)
- `__tests__/t72.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyInvestorsNewDeal` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику approve и существующий вызов `notifyProjectStatus` (T71)
- Читать `app/api/admin/projects/[id]/approve/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t72.test.ts)
4. При одобрении проекта — все инвесторы получают уведомление «Новая инвестиционная возможность»
5. Уведомление содержит ссылку на `/deals/{projectId}`
6. Существующее уведомление владельцу (T71) не сломано
7. Записать в `progress.md`: `DONE: T72 + что создано/изменено`
