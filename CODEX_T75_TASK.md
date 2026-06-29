# T75 — Уведомление реферера при изменении статуса реферального вознаграждения

## Контекст

T74 закрыл последний пробел в основной цепочке уведомлений для менеджеров.

Однако реферальная система (T16–T17, T50–T55) не подключена к уведомлениям:
- Администратор одобряет реферальное вознаграждение (`pending → approved`) →
  **реферер не получает уведомление** ✗
- Администратор отмечает вознаграждение выплаченным (`approved → paid`) →
  **реферер не получает уведомление** ✗

Реферер узнаёт об изменении статуса только при ручном заходе в кабинет
партнёрской программы `/referral`.

T75 добавляет уведомление реферера при смене статуса реферального вознаграждения
на `approved` или `paid`.

Инфраструктура уведомлений уже существует (T47–T62, T71–T74):
- `notifications` таблица
- `createNotification` хелпер в `lib/notifications/create.ts`
- `POST /api/notifications/dispatch-email` — диспатч письма

## Что нужно создать / изменить

### 1. Создать `lib/notifications/notify-referral-reward.ts`

Хелпер уведомляет реферера об изменении статуса вознаграждения.
Fire-and-forget — не бросает исключений.

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Уведомить реферера об изменении статуса реферального вознаграждения.
 * Fire-and-forget — не бросает исключений.
 */
export async function notifyReferralReward(params: {
  rewardId: string
  referrerId: string
  newStatus: 'approved' | 'paid'
  amount: number
  baseUrl: string
}): Promise<void> {
  const { rewardId, referrerId, newStatus, amount, baseUrl } = params
  const admin = createAdminClient()

  try {
    const isApproved = newStatus === 'approved'
    const title = isApproved
      ? 'Реферальное вознаграждение одобрено'
      : 'Реферальное вознаграждение выплачено'
    const body = isApproved
      ? `Ваше реферальное вознаграждение в размере ${amount.toLocaleString('ru-RU')} ₽ одобрено и будет выплачено в ближайшее время.`
      : `Ваше реферальное вознаграждение в размере ${amount.toLocaleString('ru-RU')} ₽ выплачено.`
    const link = '/referral'

    const { data: inserted } = await admin
      .from('notifications')
      .insert({
        user_id: referrerId,
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
      body: JSON.stringify({ notificationId: inserted.id, userId: referrerId }),
    }).catch(() => {/* ignore */})
  } catch {
    // fire-and-forget: не пробрасывать ошибки
  }
}
```

### 2. Обновить `app/api/admin/referral-rewards/[id]/route.ts`

Прочитать файл целиком. В PATCH-обработчике, после успешного обновления
статуса (получения `data`), добавить вызов `notifyReferralReward`
для реферера.

```typescript
import { notifyReferralReward } from '@/lib/notifications/notify-referral-reward'

// После получения data из .update().select().single():
if (data.referrer_id && (data.status === 'approved' || data.status === 'paid')) {
  notifyReferralReward({
    rewardId: data.id,
    referrerId: data.referrer_id,
    newStatus: data.status,
    amount: Number(data.amount),
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  })
  // fire-and-forget — не await
}
```

**Важно:** читать файл перед изменением. Не менять существующую логику
PATCH-обработчика. `data` уже содержит `referrer_id` и `amount` из `.select(...)`.

### 3. Создать `__tests__/t75.test.ts`

```typescript
// notifyReferralReward (unit-тесты хелпера)
// 1.  newStatus = 'approved' → title 'Реферальное вознаграждение одобрено'
// 2.  newStatus = 'paid'     → title 'Реферальное вознаграждение выплачено'
// 3.  body содержит сумму вознаграждения
// 4.  link = '/referral'
// 5.  после вставки вызывает fetch для dispatch-email (один раз)
// 6.  при ошибке insert — не бросает исключение (fire-and-forget)
// 7.  notificationId и referrerId передаются в dispatch-email payload

// PATCH /api/admin/referral-rewards/[id] (интеграция)
// 8.  при status='approved' — вызывает notifyReferralReward (mock)
// 9.  при status='paid'     — вызывает notifyReferralReward (mock)
// 10. notifyReferralReward получает referrerId из data
// 11. notifyReferralReward получает amount из data
// 12. notifyReferralReward получает newStatus = 'approved' или 'paid'
// 13. при невалидном статусе (400) — notifyReferralReward не вызывается
```

#### Структура тестов

```typescript
import { notifyReferralReward } from '@/lib/notifications/notify-referral-reward'

// Mock global fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'notif-uuid' },
        error: null,
      }),
    })),
  })),
}))

// Для тестов PATCH API:
jest.mock('@/lib/notifications/notify-referral-reward', () => ({
  notifyReferralReward: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/referral/admin-auth', () => ({
  requireReferralAdmin: jest.fn().mockResolvedValue({ error: null }),
}))
```

Для хелпера — прямой вызов `notifyReferralReward(...)` с проверкой mock-вызовов.
Для PATCH API — прямой вызов обработчика с mock-запросом и mock-контекстом.

При тесте ошибки insert переопределить mock `createAdminClient` локально:
```typescript
const { createAdminClient } = require('@/lib/supabase/admin')
createAdminClient.mockReturnValueOnce({
  from: jest.fn(() => ({
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
  })),
})
```

## Файлы для создания / изменения

- `lib/notifications/notify-referral-reward.ts` (новый)
- `app/api/admin/referral-rewards/[id]/route.ts` (добавить вызов notifyReferralReward)
- `__tests__/t75.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- fire-and-forget: `notifyReferralReward` НЕ awaitable в route handler — не блокировать ответ
- Не менять существующую логику PATCH и валидацию статуса
- Читать `app/api/admin/referral-rewards/[id]/route.ts` перед изменением
- Таблица `notifications` уже существует — миграция не нужна
- `dispatch-email` вызывается через `fetch` (не import), аналогично T71–T74

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t75.test.ts)
4. При одобрении вознаграждения администратором — реферер получает уведомление «Реферальное вознаграждение одобрено»
5. При выплате вознаграждения администратором — реферер получает уведомление «Реферальное вознаграждение выплачено»
6. Уведомление содержит сумму вознаграждения и ссылку `/referral`
7. Записать в `progress.md`: `DONE: T75 + что создано/изменено`
