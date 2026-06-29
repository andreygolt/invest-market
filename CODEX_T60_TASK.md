# T60 — Email-уведомления: отправка писем через Resend REST API

## Контекст

Система уведомлений работает в реальном времени (T47, T48, T59). Однако пользователи
получают уведомления только когда браузер открыт. Для критичных событий (изменение
статуса заявки, broadcast от администратора, одобрение/отклонение проекта) необходима
доставка email.

T60 реализует отправку email-уведомлений через Resend REST API (`fetch`, без новых
npm-зависимостей). Email диспатчится fire-and-forget при создании notification.

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/022_notifications_email.sql`

Аддитивно расширить таблицу `notifications`:

```sql
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
```

### 2. Создать `lib/email/send.ts`

Отправка email через Resend REST API. Только `fetch` — никаких npm.

```typescript
const RESEND_API_URL = 'https://api.resend.com/emails'

interface EmailPayload {
  to: string
  subject: string
  html: string
}

interface SendEmailResult {
  ok: boolean
  error?: string
}

/**
 * Отправляет email через Resend REST API.
 * Если RESEND_API_KEY не задан — mock-режим (console.log, ok: true).
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.EMAIL_FROM ?? 'noreply@invest-market.ru'

  if (!apiKey) {
    console.log('[email] Mock send to:', payload.to, '| subject:', payload.subject)
    return { ok: true }
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: text }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: String(err) }
  }
}
```

### 3. Создать `lib/email/templates.ts`

Минималистичный HTML-шаблон для email-уведомлений.

```typescript
const PLATFORM_NAME = process.env.PLATFORM_NAME ?? 'Invest Market'

export function notificationEmailTemplate(params: {
  recipientName: string
  subject: string
  message: string
  ctaUrl?: string
  ctaLabel?: string
}): string {
  const cta = params.ctaUrl
    ? `<p style="margin:24px 0;">
        <a href="${params.ctaUrl}"
           style="background:#111827;color:#fff;padding:10px 20px;
                  border-radius:6px;text-decoration:none;font-size:14px;">
          ${params.ctaLabel ?? 'Открыть'}
        </a>
       </p>`
    : ''

  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><title>${params.subject}</title></head>
<body style="font-family:sans-serif;color:#111827;background:#f9fafb;padding:40px 0;">
  <div style="max-width:520px;margin:0 auto;background:#fff;
              border-radius:8px;border:1px solid #e5e7eb;padding:32px;">
    <h2 style="margin:0 0 16px;font-size:20px;">${PLATFORM_NAME}</h2>
    <p style="color:#6b7280;margin:0 0 16px;">Здравствуйте, ${params.recipientName}!</p>
    <p style="line-height:1.6;">${params.message}</p>
    ${cta}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="color:#9ca3af;font-size:12px;margin:0;">
      Автоматическое письмо от платформы ${PLATFORM_NAME}. Не отвечайте на него.
    </p>
  </div>
</body>
</html>`
}
```

### 4. Создать `lib/email/dispatch.ts`

Fire-and-forget хелпер для вызова dispatch-email роута из других API routes.

```typescript
/**
 * Fire-and-forget: отправить email для уведомления с данным ID.
 * Не блокирует основной запрос. Ошибки игнорируются — email не критичен.
 */
export function dispatchNotificationEmail(notificationId: string): void {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const secret = process.env.INTERNAL_API_SECRET ?? ''

  fetch(`${appUrl}/api/notifications/dispatch-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify({ notification_id: notificationId }),
  }).catch(() => {
    // intentionally silent
  })
}
```

### 5. Создать `app/api/notifications/dispatch-email/route.ts`

Внутренний POST роут — принимает notification_id, отправляет email, помечает email_sent.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/send'
import { notificationEmailTemplate } from '@/lib/email/templates'

/**
 * POST /api/notifications/dispatch-email
 * Body: { notification_id: string }
 * Защищён заголовком x-internal-secret.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-internal-secret')
  if (!process.env.INTERNAL_API_SECRET || secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { notification_id?: string }
  try {
    body = (await request.json()) as { notification_id?: string }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { notification_id } = body
  if (!notification_id) {
    return NextResponse.json({ error: 'notification_id required' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: notification, error: notifError } = await admin
    .from('notifications')
    .select('id, title, message, user_id, email_sent')
    .eq('id', notification_id)
    .single()

  if (notifError || !notification) {
    return NextResponse.json({ error: 'Notification not found' }, { status: 404 })
  }

  if (notification.email_sent) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('email, full_name')
    .eq('id', notification.user_id)
    .single()

  if (!profile?.email) {
    return NextResponse.json({ error: 'User email not found' }, { status: 404 })
  }

  const html = notificationEmailTemplate({
    recipientName: profile.full_name ?? 'Пользователь',
    subject: notification.title,
    message: notification.message,
    ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/notifications`,
    ctaLabel: 'Перейти к уведомлениям',
  })

  const result = await sendEmail({
    to: profile.email,
    subject: notification.title,
    html,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  await admin
    .from('notifications')
    .update({ email_sent: true, email_sent_at: new Date().toISOString() })
    .eq('id', notification_id)

  return NextResponse.json({ ok: true })
}
```

### 6. Обновить `app/api/admin/notifications/broadcast/route.ts`

После успешного INSERT уведомлений — диспатчить email каждому получателю.

Прочитать файл, найти место где вставляются уведомления (`supabase.from('notifications').insert(...)`).
После успешного `insert` добавить:

```typescript
import { dispatchNotificationEmail } from '@/lib/email/dispatch'

// После insert, если data — массив уведомлений:
for (const notif of (data ?? [])) {
  if (notif.id) dispatchNotificationEmail(notif.id as string)
}
```

Если `insert` не возвращает `data` — сделать отдельный SELECT id только что созданных уведомлений
по `user_id IN (recipients)` и `created_at >= now()` — или добавить `select()` в цепочку insert.

**Важно:** не менять существующую логику broadcast — только добавить вызов dispatchNotificationEmail.

### 7. Обновить `app/api/notifications/route.ts`

В POST-обработчике после успешного создания уведомления:

```typescript
import { dispatchNotificationEmail } from '@/lib/email/dispatch'

// После успешного insert, если есть data.id:
if (data?.id) {
  dispatchNotificationEmail(data.id as string)
}
```

Если файл не содержит POST для создания уведомлений — пропустить этот пункт.

### 8. Обновить `types/index.ts`

В тип `Notification` (или аналогичный) добавить поля:

```typescript
email_sent?: boolean
email_sent_at?: string | null
```

### 9. Создать `__tests__/t60.test.ts`

```typescript
// sendEmail()
// 1.  sendEmail() — возвращает { ok: true } если RESEND_API_KEY не задан (mock-режим)
// 2.  sendEmail() — вызывает fetch с правильным Authorization header
// 3.  sendEmail() — вызывает fetch с телом { from, to, subject, html }
// 4.  sendEmail() — возвращает { ok: true } при HTTP 200 от Resend
// 5.  sendEmail() — возвращает { ok: false, error } при HTTP 422 от Resend
// 6.  sendEmail() — возвращает { ok: false, error } при сетевой ошибке (fetch throws)

// notificationEmailTemplate()
// 7.  содержит subject в теге <title>
// 8.  содержит message в теле письма
// 9.  содержит CTA ссылку если ctaUrl указан
// 10. не содержит тег <a> если ctaUrl не указан
// 11. содержит recipientName в приветствии

// POST /api/notifications/dispatch-email
// 12. 401 при неверном x-internal-secret
// 13. 400 если notification_id отсутствует в теле
// 14. 404 если уведомление не найдено
// 15. возвращает { ok: true, skipped: true } если email_sent уже true
// 16. 404 если profile.email не найден
// 17. 200 { ok: true } при успешной отправке
// 18. помечает email_sent=true и email_sent_at после успешной отправки
// 19. 500 если sendEmail вернул { ok: false }
```

#### Структура моков

```typescript
import { sendEmail } from '@/lib/email/send'
import { notificationEmailTemplate } from '@/lib/email/templates'
import { POST } from '@/app/api/notifications/dispatch-email/route'
import { NextRequest } from 'next/server'

// ── sendEmail тесты ──────────────────────────────────────────────
const mockFetch = jest.fn()
global.fetch = mockFetch

// Сохранить оригинальный RESEND_API_KEY и восстанавливать в afterEach
const ORIGINAL_ENV = { ...process.env }

// ── dispatch-email route тесты ───────────────────────────────────
const mockNotifSingle = jest.fn()
const mockProfileSingle = jest.fn()
const mockUpdate = jest.fn(() => ({ eq: jest.fn().mockResolvedValue({ error: null }) }))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'notifications') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockNotifSingle,
          update: mockUpdate,
        }
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: mockProfileSingle,
        }
      }
      return {}
    }),
  })),
}))

jest.mock('@/lib/email/send', () => ({
  sendEmail: jest.fn().mockResolvedValue({ ok: true }),
}))

function makeRequest(
  body: Record<string, unknown>,
  secret = 'test-secret'
): NextRequest {
  return new NextRequest('http://localhost/api/notifications/dispatch-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(body),
  })
}

// В beforeAll: process.env.INTERNAL_API_SECRET = 'test-secret'
// В afterAll: восстановить process.env
```

## Файлы для создания / изменения

- `supabase/migrations/022_notifications_email.sql` (новый)
- `lib/email/send.ts` (новый)
- `lib/email/templates.ts` (новый)
- `lib/email/dispatch.ts` (новый)
- `app/api/notifications/dispatch-email/route.ts` (новый)
- `app/api/admin/notifications/broadcast/route.ts` (обновить: добавить dispatchNotificationEmail)
- `app/api/notifications/route.ts` (обновить: добавить dispatchNotificationEmail в POST, если есть)
- `types/index.ts` (обновить: добавить email_sent/email_sent_at в Notification)
- `__tests__/t60.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей — email через нативный `fetch`
- TypeScript strict — никаких `any`
- `RESEND_API_KEY` — опциональная env; при отсутствии mock-режим (возвращает ok: true)
- `INTERNAL_API_SECRET` — env для защиты внутреннего роута; в тестах задаётся через `process.env`
- Миграция только аддитивная: `ALTER TABLE notifications ADD COLUMN IF NOT EXISTS`
- Не менять бизнес-логику broadcast/notifications — только добавить dispatchNotificationEmail
- RLS на `notifications` уже настроена; `dispatch-email` использует `createAdminClient()` (bypass RLS)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t60.test.ts)
4. `sendEmail()` — возвращает `{ ok: true }` если `RESEND_API_KEY` не задан
5. `sendEmail()` — вызывает `fetch` с `Authorization: Bearer <key>` при наличии ключа
6. `POST /api/notifications/dispatch-email` — 401 при неверном x-internal-secret
7. `POST /api/notifications/dispatch-email` — `{ ok: true, skipped: true }` если email_sent=true
8. `POST /api/notifications/dispatch-email` — помечает email_sent=true после успешной отправки
9. Broadcast route вызывает dispatchNotificationEmail для каждого вставленного уведомления
10. Записать в `progress.md`: `DONE: T60 + что создано/изменено`
