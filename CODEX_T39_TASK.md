# T39 — Пагинация каталога инвестора

## Контекст

В T8 реализован каталог инвестора (`GET /api/investor/catalog`).
Сейчас выборка ограничена захардкоженным `limit(50)` без возможности
перейти на следующую страницу. При росте числа проектов инвестор не
увидит проекты, выходящие за первые 50 записей.

T39 добавляет offset-пагинацию к API каталога и отображает
навигацию по страницам в UI.

## Что нужно создать / изменить

### 1. Обновить `app/api/investor/catalog/route.ts`

#### 1a. Принять query-параметры `page` и `per_page`

```typescript
// Считать из searchParams (с дефолтами):
const page    = Math.max(1, parseInt(searchParams.get('page')    ?? '1', 10))
const perPage = Math.min(50, Math.max(1, parseInt(searchParams.get('per_page') ?? '12', 10)))
const offset  = (page - 1) * perPage
```

> `per_page` ограничен максимумом 50 во избежание перегрузки.

#### 1b. Добавить `range` к запросу

```typescript
// БЫЛО:
query = query.limit(50)

// СТАЛО:
query = query.range(offset, offset + perPage - 1)
```

#### 1c. Получить общее количество через отдельный count-запрос

```typescript
// Повторить те же фильтры, но с { count: 'exact', head: true }
let countQuery = supabase
  .from('v_investor_catalog')
  .select('*', { count: 'exact', head: true })

// Применить те же фильтры (industry, stage, min_amount, max_amount, sort)
// ...

const { count } = await countQuery
const total = count ?? 0
```

#### 1d. Обновить формат ответа

```typescript
// БЫЛО:
return NextResponse.json(data)

// СТАЛО:
return NextResponse.json({
  items: data ?? [],
  total,
  page,
  per_page: perPage,
  total_pages: Math.ceil(total / perPage),
})
```

### 2. Обновить `types/index.ts`

Добавить тип ответа каталога:

```typescript
export interface CatalogResponse {
  items: InvestorCatalogItem[]
  total: number
  page: number
  per_page: number
  total_pages: number
}
```

Не трогать остальные типы.

### 3. Обновить `app/(investor)/catalog/page.tsx`

#### 3a. Принять `page` из searchParams

```typescript
interface PageProps {
  searchParams: Promise<{
    industry?: string
    stage?: string
    min_amount?: string
    max_amount?: string
    sort?: string
    page?: string
  }>
}
```

#### 3b. Передать `page` в запрос к API и получить `CatalogResponse`

Использовать `CatalogResponse` вместо `InvestorCatalogItem[]`:

```typescript
const params = new URLSearchParams()
// ...существующие фильтры...
if (sp.page) params.set('page', sp.page)
params.set('per_page', '12')

const res = await fetch(`${baseUrl}/api/investor/catalog?${params}`, { cache: 'no-store' })
const catalog: CatalogResponse = await res.json()
```

#### 3c. Рендеринг карточек из `catalog.items`

```typescript
// БЫЛО: items.map(...)
// СТАЛО: catalog.items.map(...)
```

#### 3d. Добавить компонент пагинации

После блока карточек:

```tsx
{catalog.total_pages > 1 && (
  <PaginationControls
    page={catalog.page}
    totalPages={catalog.total_pages}
    searchParams={sp}
  />
)}
```

### 4. Создать `app/(investor)/catalog/pagination-controls.tsx`

Клиентский компонент (`'use client'`):

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Props {
  page: number
  totalPages: number
  searchParams: Record<string, string | undefined>
}

export default function PaginationControls({ page, totalPages, searchParams }: Props) {
  const pathname = usePathname()

  function buildHref(p: number) {
    const params = new URLSearchParams()
    Object.entries(searchParams).forEach(([k, v]) => {
      if (v && k !== 'page') params.set(k, v)
    })
    params.set('page', String(p))
    return `${pathname}?${params}`
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {page > 1 && (
        <Link
          href={buildHref(page - 1)}
          className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
        >
          ← Назад
        </Link>
      )}

      <span className="text-sm text-gray-600">
        Страница {page} из {totalPages}
      </span>

      {page < totalPages && (
        <Link
          href={buildHref(page + 1)}
          className="px-3 py-1 rounded border text-sm hover:bg-gray-50"
        >
          Вперёд →
        </Link>
      )}
    </div>
  )
}
```

### 5. Тесты — `__tests__/t39.test.ts`

```typescript
// 1. GET /api/investor/catalog — 200, возвращает { items, total, page, per_page, total_pages }
// 2. GET /api/investor/catalog?page=2&per_page=5 — offset = 5, range вызван с (5, 9)
// 3. GET /api/investor/catalog?page=1&per_page=12 — дефолтный page=1, offset=0
// 4. GET /api/investor/catalog?per_page=100 — per_page ограничен до 50
// 5. GET /api/investor/catalog?per_page=0 — per_page не меньше 1 (min clamp)
// 6. GET /api/investor/catalog?page=-1 — page не меньше 1 (min clamp)
// 7. GET /api/investor/catalog — total_pages = ceil(total / per_page)
// 8. GET /api/investor/catalog — фильтр industry работает совместно с пагинацией (регрессия)
// 9. GET /api/investor/catalog — фильтр stage работает совместно с пагинацией (регрессия)
// 10. GET /api/investor/catalog — сортировка работает совместно с пагинацией (регрессия)
// 11. GET /api/investor/catalog — 401 без авторизации
// 12. CatalogResponse тип содержит поля items, total, page, per_page, total_pages
```

### Структура моков для тестов

```typescript
// Mock supabase chain: .from().select().eq()...range() + count query
const mockRange = jest.fn().mockResolvedValue({ data: mockItems, error: null })
const mockHead  = jest.fn().mockResolvedValue({ count: 42, error: null })

// Для count-запроса (head: true) и data-запроса используй разные mockResolvedValueOnce
// или дифференцируй по наличию { count: 'exact', head: true } в select
```

> Подсказка: count-запрос делается через `.select('*', { count: 'exact', head: true })`.
> В mock-цепочке он вызывается отдельно от основного data-запроса, поэтому используй
> `mockResolvedValueOnce` дважды или проверяй аргументы `.select`.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не трогать файлы кроме указанных в этом ТЗ
- Не добавлять новые миграции — `v_investor_catalog` уже существует
- `PaginationControls` — клиентский компонент, не делает fetch, только строит URL
- `per_page` по умолчанию 12 (3 колонки × 4 строки), максимум 50
- Фильтры каталога продолжают работать совместно с пагинацией
- При смене фильтра `page` сбрасывается на 1 (фильтры уже строят URL без `page`)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t39.test.ts)
4. `GET /api/investor/catalog` возвращает `{ items, total, page, per_page, total_pages }`
5. `GET /api/investor/catalog?page=2&per_page=5` возвращает данные со смещением 5
6. `per_page` зажат в диапазоне [1, 50], `page` не меньше 1
7. В UI каталога отображаются кнопки «← Назад» / «Вперёд →» при `total_pages > 1`
8. Записать в `progress.md`: `DONE: T39 + что создано/изменено`
