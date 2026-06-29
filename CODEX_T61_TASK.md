# T61 — Email-предпочтения: управление подпиской на email-уведомления

## Контекст

T60 реализовал отправку email-уведомлений: каждое созданное уведомление
fire-and-forget диспатчит письмо через `/api/notifications/dispatch-email`.
Однако пользователь не может отказаться от email-рассылки. На загруженной
платформе это может привести к спаму в inbox.

T61 добавляет управление email-предпочтениями:

1. Таблица `notification_preferences` — хранит флаг `email_enabled` на пользователя
2. Хелпер `lib/email/preferences.ts` — проверяет, хочет ли пользователь email
3. `dispatch-email` route — проверяет предпочтения **до** отправки письма
4. API route `GET/PATCH /api/profile/notification-preferences` — чтение и обновление
5. Секция «Уведомления» на странице профиля (`/profile`) — переключатель email

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/023_notification_preferences.sql`

```sql
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

-- Пользователь читает и обновляет только свою строку
CREATE POLICY "user_manage_own_prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);
```

### 2. Создать `lib/email/preferences.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Возвращает true если пользователь согласен получать email-уведомления.
 * Если записи нет — email разрешён по умолчанию (opt-out модель).
 * При ошибке БД — возвращает true (fail-open: лучше отправить лишнее письмо).
 */
export async function isEmailEnabled(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('notification_preferences')
      .select('email_enabled')
      .eq('user_id', userId)
      .single()

    if (error || !data) return true   // нет записи → opt-out не активирован
    return data.email_enabled as boolean
  } catch {
    return true
  }
}
```

### 3. Обновить `app/api/notifications/dispatch-email/route.ts`

После получения `profile` и **до** вызова `sendEmail` — добавить проверку предпочтений:

```typescript
import { isEmailEnabled } from '@/lib/email/preferences'

// После получения profile.email, перед sendEmail():
const emailEnabled = await isEmailEnabled(notification.user_id as string)
if (!emailEnabled) {
  return NextResponse.json({ ok: true, skipped: true, reason: 'email_disabled' })
}
```

**Важно:** не менять остальную логику route — только добавить проверку.

### 4. Создать `app/api/profile/notification-preferences/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/profile/notification-preferences
 * Возвращает { email_enabled: boolean } текущего пользователя.
 * Если записи нет — email_enabled: true (дефолт).
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ email_enabled: data?.email_enabled ?? true })
}

/**
 * PATCH /api/profile/notification-preferences
 * Body: { email_enabled: boolean }
 * Upsert предпочтений пользователя.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { email_enabled?: unknown }
  try {
    body = (await request.json()) as { email_enabled?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (typeof body.email_enabled !== 'boolean') {
    return NextResponse.json({ error: 'email_enabled must be boolean' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('notification_preferences')
    .upsert(
      {
        user_id: user.id,
        email_enabled: body.email_enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, email_enabled: body.email_enabled })
}
```

### 5. Обновить `types/index.ts`

Добавить тип предпочтений:

```typescript
export interface NotificationPreferences {
  user_id: string
  email_enabled: boolean
  updated_at: string
}
```

### 6. Обновить `app/profile/page.tsx`

Прочитать существующий файл. Загрузить предпочтения и добавить секцию переключателя.

В серверном компоненте добавить загрузку предпочтений:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'

// В теле функции после auth check:
const admin = createAdminClient()
const { data: prefs } = await admin
  .from('notification_preferences')
  .select('email_enabled')
  .eq('user_id', user.id)
  .single()

const emailEnabled = prefs?.email_enabled ?? true
```

В JSX — добавить секцию (после существующих секций профиля):

```tsx
<NotificationPrefsSection initialEmailEnabled={emailEnabled} />
```

### 7. Создать `app/profile/notification-prefs-section.tsx`

Клиентский компонент — переключатель email-уведомлений:

```tsx
'use client'

import { useState } from 'react'

interface Props {
  initialEmailEnabled: boolean
}

export function NotificationPrefsSection({ initialEmailEnabled }: Props) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleToggle() {
    const next = !emailEnabled
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/profile/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_enabled: next }),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Ошибка сохранения')
        return
      }
      setEmailEnabled(next)
      setSuccess(true)
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border p-6">
      <h2 className="mb-4 text-sm font-semibold">Уведомления по email</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-700">Email-уведомления</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Получать письма при изменении статусов и важных событиях
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          role="switch"
          aria-checked={emailEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors
            focus-visible:outline-none disabled:opacity-50
            ${emailEnabled ? 'bg-gray-900' : 'bg-gray-200'}`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform
              ${emailEnabled ? 'translate-x-5' : 'translate-x-0'}`}
          />
        </button>
      </div>
      {error && (
        <p className="mt-3 text-xs text-red-600">{error}</p>
      )}
      {success && (
        <p className="mt-3 text-xs text-green-600">
          {emailEnabled ? 'Email-уведомления включены' : 'Email-уведомления отключены'}
        </p>
      )}
    </div>
  )
}
```

### 8. Создать `__tests__/t61.test.ts`

```typescript
// isEmailEnabled()
// 1.  isEmailEnabled() — возвращает true если записи нет (ошибка .single() → error)
// 2.  isEmailEnabled() — возвращает true если email_enabled=true в БД
// 3.  isEmailEnabled() — возвращает false если email_enabled=false в БД
// 4.  isEmailEnabled() — возвращает true при ошибке БД (fail-open)

// GET /api/profile/notification-preferences
// 5.  GET — 401 без авторизации
// 6.  GET — 200 { email_enabled: true } если записи нет
// 7.  GET — 200 { email_enabled: false } если пользователь отписался

// PATCH /api/profile/notification-preferences
// 8.  PATCH — 401 без авторизации
// 9.  PATCH — 400 если email_enabled не boolean (строка)
// 10. PATCH — 400 если email_enabled не boolean (число)
// 11. PATCH — 400 если тело невалидный JSON
// 12. PATCH — 400 если email_enabled отсутствует в теле
// 13. PATCH — 200 { ok: true, email_enabled: false } при отписке
// 14. PATCH — 200 { ok: true, email_enabled: true } при подписке
// 15. PATCH — 500 если ошибка БД при upsert

// POST /api/notifications/dispatch-email (расширение T60)
// 16. dispatch-email — пропускает отправку если isEmailEnabled возвращает false
//     (возвращает { ok: true, skipped: true, reason: 'email_disabled' })
// 17. dispatch-email — отправляет email если isEmailEnabled возвращает true

// NotificationPrefsSection компонент
// 18. рендерится с initialEmailEnabled=true (toggle включён)
// 19. рендерится с initialEmailEnabled=false (toggle выключен)
// 20. клик по toggle вызывает PATCH /api/profile/notification-preferences
```

#### Структура моков

```typescript
import { isEmailEnabled } from '@/lib/email/preferences'
import { GET, PATCH } from '@/app/api/profile/notification-preferences/route'
import { NextRequest } from 'next/server'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NotificationPrefsSection } from '@/app/profile/notification-prefs-section'

// ── isEmailEnabled ────────────────────────────────────────────────
const mockSingle = jest.fn()

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: mockSingle,
      upsert: jest.fn().mockResolvedValue({ error: null }),
    })),
  })),
}))

// ── GET / PATCH route ─────────────────────────────────────────────
const mockGetUser = jest.fn().mockResolvedValue({
  data: { user: { id: 'user-1' } },
})

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: { getUser: mockGetUser },
  })),
}))

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/profile/notification-preferences')
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/profile/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── NotificationPrefsSection ──────────────────────────────────────
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ ok: true, email_enabled: false }),
}) as jest.Mock
```

## Файлы для создания / изменения

- `supabase/migrations/023_notification_preferences.sql` (новый)
- `types/index.ts` — добавить `NotificationPreferences`
- `lib/email/preferences.ts` (новый)
- `app/api/notifications/dispatch-email/route.ts` (обновить: добавить проверку isEmailEnabled)
- `app/api/profile/notification-preferences/route.ts` (новый)
- `app/profile/page.tsx` (обновить: загрузить prefs, добавить `<NotificationPrefsSection>`)
- `app/profile/notification-prefs-section.tsx` (новый)
- `__tests__/t61.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Миграция только аддитивная: новая таблица `notification_preferences`
- RLS обязателен на новой таблице
- Opt-out модель: если записи нет — email разрешён по умолчанию
- Fail-open для `isEmailEnabled`: при ошибке БД возвращать `true`
- Не менять бизнес-логику dispatch-email — только добавить проверку предпочтений
- Не трогать другие файлы кроме указанных

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t61.test.ts)
4. `isEmailEnabled()` — возвращает `true` если записи нет или при ошибке
5. `isEmailEnabled()` — возвращает `false` если пользователь отписался
6. `PATCH /api/profile/notification-preferences` — upsert записи, 400 если не boolean
7. `dispatch-email` — не отправляет письмо если `email_enabled=false`
8. `dispatch-email` — возвращает `{ ok: true, skipped: true, reason: 'email_disabled' }` при отписке
9. Страница `/profile` содержит переключатель email-уведомлений
10. Записать в `progress.md`: `DONE: T61 + что создано/изменено`
