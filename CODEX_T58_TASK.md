# T58 — Интеграция `platform_settings` в бизнес-логику

## Контекст

В T57 создана таблица `platform_settings` и страница `/settings` для
superadmin. Однако сами настройки нигде не используются: каталог берёт
дефолтный размер страницы из хардкода (`12`), форма коммерческих условий
хардкодит success fee (`5%`), форма заявки не знает про min/max суммы.

T58 подключает настройки к реальной бизнес-логике:

1. `lib/settings/get-settings.ts` — серверный хелпер, возвращает все настройки
   в виде `PlatformSettings` (с fallback-значениями при отсутствии записей в БД)
2. Каталог инвестора — дефолтный `per_page` берётся из `catalog_page_size`
3. Форма заявки — валидация суммы по `min_investment_amount` /
   `max_investment_amount`
4. Форма коммерческих условий — дефолтный success fee из `success_fee_default`
5. Admin layout — добавить ссылку «Настройки» в навигацию

## Что нужно создать / изменить

### 1. Создать `lib/settings/get-settings.ts`

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { PlatformSettingKey, PlatformSettings } from '@/types'

export const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: 'Invest Market',
  contact_email: 'support@invest-market.ru',
  success_fee_default: '5',
  min_investment_amount: '1000000',
  max_investment_amount: '500000000',
  catalog_page_size: '12',
}

/**
 * Возвращает все настройки платформы.
 * При ошибке БД или пустой таблице возвращает DEFAULT_SETTINGS.
 */
export async function getSettings(): Promise<PlatformSettings> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('platform_settings')
      .select('key, value')

    if (error || !data || data.length === 0) {
      return { ...DEFAULT_SETTINGS }
    }

    const settings: PlatformSettings = { ...DEFAULT_SETTINGS }
    for (const row of data) {
      settings[row.key as PlatformSettingKey] = row.value
    }
    return settings
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** Возвращает одну настройку как число. При ошибке — дефолт. */
export function settingAsNumber(
  settings: PlatformSettings,
  key: PlatformSettingKey,
  fallback: number
): number {
  const num = Number(settings[key])
  return Number.isNaN(num) || num <= 0 ? fallback : num
}
```

### 2. Обновить `app/api/investor/catalog/route.ts`

Заменить хардкод дефолтного `per_page = 12` на значение из настроек.

В начале функции `GET` **до** чтения `searchParams`:

```typescript
import { getSettings, settingAsNumber } from '@/lib/settings/get-settings'
// ...

export async function GET(request: NextRequest) {
  // ... auth check ...

  const settings = await getSettings()
  const defaultPageSize = settingAsNumber(settings, 'catalog_page_size', 12)

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseIntegerParam(searchParams.get('page'), 1))
  const perPage = Math.min(
    50,
    Math.max(1, parseIntegerParam(searchParams.get('per_page'), defaultPageSize))
  )
  // ... остальной код без изменений ...
}
```

### 3. Обновить `app/(investor)/deals/[id]/apply/page.tsx`

Загрузить настройки и передать их в `ApplyForm`:

```typescript
import { getSettings, settingAsNumber } from '@/lib/settings/get-settings'
// ...

export default async function ApplyPage({ params }: PageProps) {
  // ... существующий код получения проекта ...

  const settings = await getSettings()
  const minAmount = settingAsNumber(settings, 'min_investment_amount', 1_000_000)
  const maxAmount = settingAsNumber(settings, 'max_investment_amount', 500_000_000)

  return (
    // ...
    <ApplyForm
      projectId={project.id}
      projectName={project.name}
      investmentAsk={s6.investment_ask ?? null}
      minAmount={minAmount}
      maxAmount={maxAmount}
    />
    // ...
  )
}
```

### 4. Обновить `app/(investor)/deals/[id]/apply/apply-form.tsx`

Добавить props `minAmount` / `maxAmount` и валидацию суммы:

```typescript
interface ApplyFormProps {
  projectId: string
  projectName: string
  investmentAsk: string | null
  minAmount: number   // новый проп
  maxAmount: number   // новый проп
}

// В handleSubmit — добавить валидацию суммы если указана:
if (amount) {
  const parsed = parseFloat(amount)
  if (isNaN(parsed) || parsed < minAmount) {
    setError(`Минимальная сумма заявки — ${minAmount.toLocaleString('ru-RU')} ₽`)
    return
  }
  if (parsed > maxAmount) {
    setError(`Максимальная сумма заявки — ${maxAmount.toLocaleString('ru-RU')} ₽`)
    return
  }
}
```

В JSX — добавить `min`/`max` на `<Input type="number">` для суммы:

```tsx
<Input
  id="amount"
  type="number"
  min={minAmount}
  max={maxAmount}
  // ...
/>
```

### 5. Обновить `app/(admin)/admin/commercial-terms/page.tsx`

Загрузить настройки и передать `defaultSuccessFee` в `TermsForm`:

```typescript
import { getSettings, settingAsNumber } from '@/lib/settings/get-settings'
// ...

export default async function CommercialTermsPage() {
  // ... существующий код ...

  const settings = await getSettings()
  const defaultSuccessFee = settingAsNumber(settings, 'success_fee_default', 5)

  // В рендере:
  <TermsForm projectId={project.id} terms={project.terms} defaultSuccessFee={defaultSuccessFee} />
}
```

### 6. Обновить `app/(admin)/admin/commercial-terms/terms-form.tsx`

Добавить проп `defaultSuccessFee` и использовать его как fallback:

```typescript
interface TermsFormProps {
  projectId: string
  terms: CommercialTermsRow | null
  defaultSuccessFee: number   // новый проп
}

// Изменить строку инициализации successFeePct:
const [successFeePct, setSuccessFeePct] = useState(
  String(terms?.success_fee_pct ?? defaultSuccessFee)
)
```

### 7. Обновить `app/(admin)/layout.tsx`

Добавить ссылку «Настройки» в `<nav>` (добавить после существующих ссылок, перед «Профиль»):

```tsx
<Link href="/settings" className="hover:text-foreground">
  Настройки
</Link>
```

### 8. Создать `__tests__/t58.test.ts`

```typescript
// 1.  getSettings() — возвращает DEFAULT_SETTINGS если таблица пустая
// 2.  getSettings() — возвращает мерж DB-значений с дефолтами
// 3.  getSettings() — при ошибке БД возвращает DEFAULT_SETTINGS
// 4.  settingAsNumber() — возвращает числовое значение настройки
// 5.  settingAsNumber() — возвращает fallback при NaN
// 6.  settingAsNumber() — возвращает fallback при нулевом значении
// 7.  GET /api/investor/catalog — использует catalog_page_size из настроек (mock)
// 8.  GET /api/investor/catalog — per_page из query-параметра имеет приоритет над настройками
// 9.  GET /api/investor/catalog — per_page ограничен 50 даже если настройка больше
// 10. ApplyForm — валидирует минимальную сумму (ниже minAmount → ошибка)
// 11. ApplyForm — валидирует максимальную сумму (выше maxAmount → ошибка)
// 12. ApplyForm — принимает сумму в допустимом диапазоне без ошибки
// 13. ApplyForm — сумма необязательна (пустое поле → нет ошибки по сумме)
// 14. TermsForm — инициализируется с defaultSuccessFee если terms=null
// 15. TermsForm — использует terms.success_fee_pct если terms существуют

#### Структура моков для getSettings тестов

```typescript
import { getSettings, settingAsNumber, DEFAULT_SETTINGS } from '@/lib/settings/get-settings'

const mockSelect = jest.fn()
const mockFrom = jest.fn(() => ({ select: mockSelect }))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({ from: mockFrom })),
}))

describe('getSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns DEFAULT_SETTINGS when table is empty', async () => {
    mockSelect.mockResolvedValue({ data: [], error: null })
    const result = await getSettings()
    expect(result).toEqual(DEFAULT_SETTINGS)
  })

  it('merges DB values with defaults', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { key: 'catalog_page_size', value: '24' },
        { key: 'success_fee_default', value: '7' },
      ],
      error: null,
    })
    const result = await getSettings()
    expect(result.catalog_page_size).toBe('24')
    expect(result.success_fee_default).toBe('7')
    expect(result.platform_name).toBe(DEFAULT_SETTINGS.platform_name)
  })

  it('returns DEFAULT_SETTINGS on DB error', async () => {
    mockSelect.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const result = await getSettings()
    expect(result).toEqual(DEFAULT_SETTINGS)
  })
})

describe('settingAsNumber', () => {
  it('parses number correctly', () => {
    expect(settingAsNumber(DEFAULT_SETTINGS, 'catalog_page_size', 12)).toBe(12)
  })

  it('returns fallback for NaN', () => {
    const s = { ...DEFAULT_SETTINGS, catalog_page_size: 'abc' }
    expect(settingAsNumber(s, 'catalog_page_size', 99)).toBe(99)
  })

  it('returns fallback for zero', () => {
    const s = { ...DEFAULT_SETTINGS, catalog_page_size: '0' }
    expect(settingAsNumber(s, 'catalog_page_size', 12)).toBe(12)
  })
})
```

## Файлы для создания / изменения

- `lib/settings/get-settings.ts` (новый)
- `app/api/investor/catalog/route.ts` (обновить: добавить вызов getSettings)
- `app/(investor)/deals/[id]/apply/page.tsx` (обновить: передать minAmount/maxAmount)
- `app/(investor)/deals/[id]/apply/apply-form.tsx` (обновить: добавить props + валидацию)
- `app/(admin)/admin/commercial-terms/page.tsx` (обновить: передать defaultSuccessFee)
- `app/(admin)/admin/commercial-terms/terms-form.tsx` (обновить: принять defaultSuccessFee prop)
- `app/(admin)/layout.tsx` (обновить: добавить ссылку «Настройки»)
- `__tests__/t58.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не трогать другие файлы кроме указанных выше
- `getSettings()` использует `createAdminClient()` — не `createClient()` (не зависит от сессии)
- Валидация суммы в apply-form — только клиентская (серверная валидация уже есть в API)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t58.test.ts)
4. `getSettings()` возвращает DEFAULT_SETTINGS при пустой таблице
5. Каталог использует `catalog_page_size` из настроек как дефолт
6. Форма заявки показывает ошибку при сумме ниже `min_investment_amount`
7. Форма заявки показывает ошибку при сумме выше `max_investment_amount`
8. Форма коммерческих условий инициализирует success fee из `success_fee_default`
9. Nav в admin layout содержит ссылку «Настройки» (`/settings`)
10. Записать в `progress.md`: `DONE: T58 + что создано/изменено`
