# T76 — Уведомление владельца проекта при установке коммерческих условий

## Контекст

T75 завершил цепочку уведомлений для реферальной системы.

Однако при установке администратором коммерческих условий проекта
(success fee, fixed fee) владелец проекта **не получает уведомление** ✗.
Он узнаёт об условиях только при ручном заходе в кабинет `/project`
или через прямой контакт с администратором.

Текущее состояние:
- Администратор устанавливает/обновляет условия через `POST /api/admin/commercial-terms`
  (upsert по `project_id`) → **владелец проекта не уведомлён** ✗
- Владелец видит условия на странице `/project` или `/api/project/commercial-terms` ✓

T76 добавляет уведомление владельца проекта при установке или обновлении
коммерческих условий администратором.

Инфраструктура уведомлений уже существует (T47–T62, T71–T75):
- `notifications` таблица
- `createNotification` хелпер в `lib/notifications/create.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-commercial-terms.ts`

Хелпер уведомляет владельца проекта об установке / обновлении коммерческих условий.
Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить владельца проекта об установке/обновлении коммерческих условий.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyCommercialTerms(params: {
  projectId: string
  successFeePct: number
  fixedFee: number
  baseUrl: string
}): Promise<void> {
  const { projectId, successFeePct, fixedFee, baseUrl } = params
  const admin = createAdminClient()

  try {
    const { data: project } = await admin
      .from('projects')
      .select('owner_id, name')
      .eq('id', projectId)
      .maybeSingle()

    if (!project?.owner_id) return

    const title = 'Коммерческие условия установлены'
    const feeLine = fixedFee > 0
      ? `Success fee: ${successFeePct}%, фиксированное вознаграждение: ${fixedFee.toLocaleString('ru-RU')} ₽.`
      : `Success fee: ${successFeePct}%.`
    const body = `По проекту «${project.name}» администратор установил коммерческие условия. ${feeLine} Подробности в кабинете проекта.`
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

### 2. Обновить `app/api/admin/commercial-terms/route.ts`

Прочитать файл целиком. В POST-обработчике, после получения `data` из
`.upsert(...).select(...).single()`, добавить вызов `notifyCommercialTerms`.

```typescript
import { notifyCommercialTerms } from '@/lib/notifications/notify-commercial-terms'

// После получения data из upsert:
notifyCommercialTerms({
  projectId: data.project_id,
  successFeePct: data.success_fee_pct,
  fixedFee: data.fixed_fee,
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
})
// fire-and-forget — не await
```

**Важно:** читать файл перед изменением. Не менять существующую логику
POST-обработчика и валидацию полей. `data` уже содержит `project_id`,
`success_fee_pct`, `fixed_fee` из `.select(...)`.

### 3. Создать `__tests__/t76.test.ts`

```typescript
// notifyCommercialTerms (unit-тесты хелпера)
// 1.  проект не найден (data = null) → не вызывает insert (ранний return)
// 2.  owner_id = null → не вызывает insert (ранний return)
// 3.  title всегда 'Коммерческие условия установлены'
// 4.  body содержит название проекта
// 5.  body содержит success_fee_pct
// 6.  link = '/project'
// 7.  после вставки вызывает fetch для dispatch-email (один раз)
// 8.  при ошибке insert — не бросает исключение (fire-and-forget)
// 9.  при fixedFee > 0 body содержит fixedFee
// 10. notificationId и owner_id передаются в dispatch-email payload

// POST /api/admin/commercial-terms (интеграция)
// 11. при успешном upsert — вызывает notifyCommercialTerms (mock)
// 12. notifyCommercialTerms получает projectId из data
// 13. notifyCommercialTerms получает successFeePct и fixedFee из data
// 14. при невалидных данных (400) — notifyCommercialTerms не вызывается
```

#### Структура тестов

```typescript
import { notifyCommercialTerms } from '@/lib/notifications/notify-commercial-terms'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { owner_id: 'owner-uuid', name: 'Тестовый проект' },
        error: null,
      }),
      single: jest.fn().mockResolvedValue({
        data: { id: 'notif-uuid' },
        error: null,
      }),
    })),
  })),
}))

// Для тестов POST API:
jest.mock('@/lib/notifications/notify-commercial-terms', () => ({
  notifyCommercialTerms: jest.fn().mockResolvedValue(undefined),
}))
```

Для хелпера — прямой вызов `notifyCommercialTerms(...)` с проверкой mock-вызовов.
Для POST API — прямой вызов обработчика с mock-запросом и корректным телом запроса.

При тесте «проект не найден» переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    insert: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
  })),
})
```

При тесте «невалидные данные» передать тело без `project_id` или с некорректным
`success_fee_pct` — ожидать ответ 400 и отсутствие вызова `notifyCommercialTerms`.

Для POST API mock Supabase-клиента должен возвращать корректный upsert-ответ:
```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'admin-uuid' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      }),
      upsert: jest.fn().mockReturnThis(),
    })),
  }),
}))
```

## Файлы для создания / изменения

- `lib/notifications/notify-commercial-terms.ts` (новый)
- `app/api/admin/commercial-terms/route.ts` (добавить вызов notifyCommercialTerms в POST)
- `__tests__/t76.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyCommercialTerms` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику POST (валидацию, upsert, возврат данных)
- Читать `app/api/admin/commercial-terms/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T75

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t76.test.ts)
4. При установке или обновлении коммерческих условий администратором — владелец проекта получает уведомление «Коммерческие условия установлены»
5. Уведомление содержит название проекта, success_fee_pct и (если > 0) fixed_fee
6. Уведомление содержит ссылку `/project`
7. Записать в `progress.md`: `DONE: T76 + что создано/изменено`
