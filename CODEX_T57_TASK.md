# T57 — Admin: настройки платформы (platform_settings)

## Контекст

После T56 (детальная страница пользователя) панель администратора содержит полный набор
инструментов управления: пользователи, проекты, заявки, аналитика, уведомления, экспорт,
аудит-лог, поиск.

Однако все операционные параметры платформы (комиссия, минимальный чек инвестиции,
контактный email и т.д.) жёстко захардкожены в коде или в БД-миграциях. Чтобы изменить,
например, процент success fee по умолчанию или контактный email службы поддержки —
требуется менять код или лезть напрямую в Supabase.

T57 добавляет страницу **«Настройки платформы»** (`/admin/settings`), где superadmin
может менять ключевые параметры платформы через UI без деплоя.

**Принцип:** таблица `platform_settings` хранит пары `key → value` (все значения как
`text`, приводятся к нужному типу на уровне кода). API поддерживает чтение и пакетное
обновление. Страница доступна только `superadmin`.

## Настройки для управления

| Ключ | Тип | Описание | Дефолт |
|------|-----|----------|--------|
| `platform_name` | string | Название платформы | `Invest Market` |
| `contact_email` | string | Email поддержки для инвесторов | `support@invest-market.ru` |
| `success_fee_default` | number | % success fee по умолчанию в коммерческих условиях | `5` |
| `min_investment_amount` | number | Минимальная сумма заявки (₽) | `1000000` |
| `max_investment_amount` | number | Максимальная сумма заявки (₽) | `500000000` |
| `catalog_page_size` | number | Проектов на страницу в каталоге | `12` |

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/021_platform_settings.sql`

```sql
CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Только admin и superadmin могут читать
CREATE POLICY "admin_read_settings" ON platform_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Только superadmin может изменять
CREATE POLICY "superadmin_write_settings" ON platform_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

-- Начальные значения
INSERT INTO platform_settings (key, value) VALUES
  ('platform_name',        'Invest Market'),
  ('contact_email',        'support@invest-market.ru'),
  ('success_fee_default',  '5'),
  ('min_investment_amount','1000000'),
  ('max_investment_amount','500000000'),
  ('catalog_page_size',    '12')
ON CONFLICT (key) DO NOTHING;
```

### 2. Обновить `types/index.ts`

Добавить типы настроек:

```typescript
export type PlatformSettingKey =
  | 'platform_name'
  | 'contact_email'
  | 'success_fee_default'
  | 'min_investment_amount'
  | 'max_investment_amount'
  | 'catalog_page_size'

export interface PlatformSetting {
  key: PlatformSettingKey
  value: string
  updated_at: string
  updated_by: string | null
}

export type PlatformSettings = Record<PlatformSettingKey, string>
```

### 3. Создать `app/api/admin/settings/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlatformSettingKey, PlatformSettings } from '@/types'

const ALLOWED_ROLES = ['admin', 'superadmin']
const WRITE_ROLES = ['superadmin']

const VALID_KEYS: PlatformSettingKey[] = [
  'platform_name',
  'contact_email',
  'success_fee_default',
  'min_investment_amount',
  'max_investment_amount',
  'catalog_page_size',
]

async function getActorProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  return data ? { id: user.id, role: data.role as string } : null
}

// GET /api/admin/settings — возвращает все настройки как объект { key: value }
export async function GET() {
  const actor = await getActorProfile()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('platform_settings')
    .select('key, value, updated_at, updated_by')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const settings: PlatformSettings = {} as PlatformSettings
  for (const row of (data ?? [])) {
    settings[row.key as PlatformSettingKey] = row.value as string
  }

  return NextResponse.json({ settings })
}

// PUT /api/admin/settings — пакетное обновление { key: value, ... }
// Только superadmin
export async function PUT(request: NextRequest) {
  const actor = await getActorProfile()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!WRITE_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Валидация ключей
  const updates = Object.entries(body)
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No settings provided' }, { status: 400 })
  }

  for (const [key] of updates) {
    if (!VALID_KEYS.includes(key as PlatformSettingKey)) {
      return NextResponse.json(
        { error: `Unknown setting key: ${key}` },
        { status: 400 }
      )
    }
  }

  // Валидация значений числовых полей
  const numericKeys: PlatformSettingKey[] = [
    'success_fee_default',
    'min_investment_amount',
    'max_investment_amount',
    'catalog_page_size',
  ]
  for (const [key, value] of updates) {
    if (numericKeys.includes(key as PlatformSettingKey)) {
      const num = Number(value)
      if (isNaN(num) || num < 0) {
        return NextResponse.json(
          { error: `Setting "${key}" must be a non-negative number` },
          { status: 400 }
        )
      }
    }
    if (typeof value !== 'string' && typeof value !== 'number') {
      return NextResponse.json(
        { error: `Setting "${key}" must be a string or number` },
        { status: 400 }
      )
    }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Upsert каждого ключа
  const rows = updates.map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: now,
    updated_by: actor.id,
  }))

  const { error } = await admin
    .from('platform_settings')
    .upsert(rows, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

### 4. Создать `app/(admin)/settings/page.tsx`

Серверный компонент — только для `superadmin`.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SettingsClient from './settings-client'
import type { PlatformSettings, PlatformSettingKey } from '@/types'

const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: 'Invest Market',
  contact_email: 'support@invest-market.ru',
  success_fee_default: '5',
  min_investment_amount: '1000000',
  max_investment_amount: '500000000',
  catalog_page_size: '12',
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'superadmin') {
    redirect('/')
  }

  const admin = createAdminClient()
  const { data } = await admin
    .from('platform_settings')
    .select('key, value')

  const settings: PlatformSettings = { ...DEFAULT_SETTINGS }
  for (const row of (data ?? [])) {
    settings[row.key as PlatformSettingKey] = row.value as string
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Настройки платформы</h1>
      <SettingsClient initialSettings={settings} />
    </div>
  )
}
```

### 5. Создать `app/(admin)/settings/settings-client.tsx`

Клиентский компонент: форма со всеми полями настроек.

```tsx
'use client'

import { useState } from 'react'
import type { PlatformSettings } from '@/types'

const SETTING_META: {
  key: keyof PlatformSettings
  label: string
  hint: string
  type: 'text' | 'email' | 'number'
}[] = [
  {
    key: 'platform_name',
    label: 'Название платформы',
    hint: 'Отображается в заголовках и уведомлениях',
    type: 'text',
  },
  {
    key: 'contact_email',
    label: 'Email поддержки',
    hint: 'Показывается инвесторам и проектам как контакт платформы',
    type: 'email',
  },
  {
    key: 'success_fee_default',
    label: 'Success fee по умолчанию (%)',
    hint: 'Процент успешной комиссии при создании коммерческих условий',
    type: 'number',
  },
  {
    key: 'min_investment_amount',
    label: 'Минимальная сумма заявки (₽)',
    hint: 'Нижняя граница суммы в форме заявки инвестора',
    type: 'number',
  },
  {
    key: 'max_investment_amount',
    label: 'Максимальная сумма заявки (₽)',
    hint: 'Верхняя граница суммы в форме заявки инвестора',
    type: 'number',
  },
  {
    key: 'catalog_page_size',
    label: 'Проектов на страницу в каталоге',
    hint: 'Количество карточек проектов на одной странице каталога',
    type: 'number',
  },
]

interface Props {
  initialSettings: PlatformSettings
}

export default function SettingsClient({ initialSettings }: Props) {
  const [values, setValues] = useState<PlatformSettings>({ ...initialSettings })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleChange(key: keyof PlatformSettings, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSuccess(false)
    setError(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const json = (await res.json()) as { error?: string }
        setError(json.error ?? 'Ошибка сохранения')
        return
      }
      setSuccess(true)
    } catch {
      setError('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-6">
        <div className="space-y-5">
          {SETTING_META.map(({ key, label, hint, type }) => (
            <div key={key}>
              <label
                htmlFor={key}
                className="block text-sm font-medium text-gray-700"
              >
                {label}
              </label>
              <p className="mt-0.5 text-xs text-gray-500">{hint}</p>
              <input
                id={key}
                type={type}
                value={values[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="mt-1.5 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
                min={type === 'number' ? 0 : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Настройки сохранены
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  )
}
```

### 6. Тесты `__tests__/t57.test.ts`

```typescript
// 1.  GET /api/admin/settings — 401 без авторизации
// 2.  GET /api/admin/settings — 403 для роли investor
// 3.  GET /api/admin/settings — 403 для роли moderator
// 4.  GET /api/admin/settings — 200 для роли admin (read-only)
// 5.  GET /api/admin/settings — 200 для роли superadmin
// 6.  GET /api/admin/settings — возвращает объект { settings: { key: value, ... } }
// 7.  GET /api/admin/settings — 500 если ошибка БД
// 8.  PUT /api/admin/settings — 401 без авторизации
// 9.  PUT /api/admin/settings — 403 для роли admin (только superadmin может писать)
// 10. PUT /api/admin/settings — 403 для роли manager
// 11. PUT /api/admin/settings — 400 если тело пустое {}
// 12. PUT /api/admin/settings — 400 если неизвестный ключ настройки
// 13. PUT /api/admin/settings — 400 если числовое поле содержит нечисло
// 14. PUT /api/admin/settings — 400 если числовое поле отрицательное
// 15. PUT /api/admin/settings — 200 superadmin успешно обновляет одну настройку
// 16. PUT /api/admin/settings — 200 superadmin успешно обновляет несколько настроек сразу
// 17. PUT /api/admin/settings — 200 обновление числовой настройки (success_fee_default)
// 18. PUT /api/admin/settings — 200 обновление строковой настройки (platform_name)
// 19. PUT /api/admin/settings — 500 если ошибка БД при upsert
// 20. PUT /api/admin/settings — принимает числовые значения как числа (не только строки)

#### Структура моков

```typescript
import { GET, PUT } from '@/app/api/admin/settings/route'
import { NextRequest } from 'next/server'

const mockSuperadminId = 'superadmin-1'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: mockSuperadminId } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'superadmin' },
        error: null,
      }),
    })),
  })),
}))

const mockSettingsData = [
  { key: 'platform_name', value: 'Invest Market' },
  { key: 'success_fee_default', value: '5' },
]

const mockSelectResult = jest.fn().mockResolvedValue({
  data: mockSettingsData,
  error: null,
})

const mockUpsertResult = jest.fn().mockResolvedValue({ error: null })

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      upsert: mockUpsertResult,
      // select().select() chain terminates here
      then: undefined,
      // make it thenable for await
      ...{ select: jest.fn().mockReturnValue({ then: (fn: Function) => fn(mockSelectResult()) }) },
    })),
  })),
}))

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings')
}

function makePutRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
```

**Примечание:** поскольку структура mock-цепочек для `from().select()` может
потребовать нестандартной настройки, реализуй mock так, чтобы `GET` возвращал
данные из `mockSettingsData`, а `PUT` возвращал `{ error: null }`.

## Файлы для создания / изменения

- `supabase/migrations/021_platform_settings.sql` (новый) — таблица настроек + RLS + seed
- `types/index.ts` — добавить `PlatformSettingKey`, `PlatformSetting`, `PlatformSettings`
- `app/api/admin/settings/route.ts` (новый) — GET + PUT
- `app/(admin)/settings/page.tsx` (новый) — серверный компонент страницы
- `app/(admin)/settings/settings-client.tsx` (новый) — клиентский компонент формы
- `__tests__/t57.test.ts` (новый) — тесты API

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Миграция только аддитивная — новая таблица `platform_settings`
- Чтение настроек: `admin` + `superadmin`. Запись: только `superadmin`
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t57.test.ts)
4. `GET /api/admin/settings` — возвращает все 6 настроек
5. `PUT /api/admin/settings` — superadmin обновляет значения, 403 для admin
6. Страница `/admin/settings` — форма со всеми 6 полями, кнопка «Сохранить»
7. При сохранении форма вызывает `PUT /api/admin/settings`, показывает success/error
8. Записать в `progress.md`: `DONE: T57 + что создано/изменено`
