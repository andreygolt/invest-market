# T40 — Поиск в каталоге инвестора

## Контекст

В T8 реализован каталог инвестора с фильтрами по индустрии, стадии и сумме.
В T39 добавлена offset-пагинация. Однако у инвестора нет возможности искать
проект по ключевым словам — только перебор через фильтры.

T40 добавляет полнотекстовый поиск по названию и краткому описанию проекта
в API каталога и отображает поле поиска в UI.

## Что нужно создать / изменить

### 1. Обновить `app/api/investor/catalog/route.ts`

#### 1a. Принять query-параметр `q`

```typescript
const q = (searchParams.get('q') ?? '').trim()
```

#### 1b. Применить поиск через `ilike` если `q` не пустой

После блока с фильтрами (industry, stage, min_amount, max_amount), до `.range(...)`:

```typescript
if (q) {
  query = query.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`)
  countQuery = countQuery.or(`name.ilike.%${q}%,short_description.ilike.%${q}%`)
}
```

> Поиск применяется к обоим запросам — data и count — чтобы `total` и `total_pages`
> отражали реальное количество результатов поиска.

> Используем `ilike` (case-insensitive LIKE) — без новых расширений Supabase.
> Поля `name` и `short_description` уже есть в `v_investor_catalog`.

#### 1c. Обновить порядок применения условий

Итоговый порядок (после всех фильтров, перед range):

```typescript
// 1. industry filter
// 2. stage filter
// 3. min_amount filter
// 4. max_amount filter
// 5. q search (новое)
// 6. sort
// 7. range (пагинация)
```

### 2. Обновить `types/index.ts`

Добавить поле `q` в `CatalogResponse` (не обязательно — поле не нужно в ответе).

Добавить поле `short_description` в `InvestorCatalogItem` если его ещё нет:

```typescript
export interface InvestorCatalogItem {
  // ... существующие поля ...
  short_description: string | null  // добавить если нет
}
```

Не трогать остальные типы.

### 3. Обновить `app/(investor)/catalog/page.tsx`

#### 3a. Принять `q` из searchParams

```typescript
interface PageProps {
  searchParams: Promise<{
    industry?: string
    stage?: string
    min_amount?: string
    max_amount?: string
    sort?: string
    page?: string
    q?: string          // новое
  }>
}
```

#### 3b. Передать `q` в запрос к API

```typescript
const params = new URLSearchParams()
// ...существующие фильтры...
if (sp.q) params.set('q', sp.q)
if (sp.page) params.set('page', sp.page)
params.set('per_page', '12')
```

#### 3c. Добавить поле поиска перед блоком фильтров

```tsx
<form method="GET" className="flex gap-2 mb-4">
  {/* Сохранить текущие фильтры как hidden inputs */}
  {sp.industry && <input type="hidden" name="industry" value={sp.industry} />}
  {sp.stage    && <input type="hidden" name="stage"    value={sp.stage} />}
  {sp.min_amount && <input type="hidden" name="min_amount" value={sp.min_amount} />}
  {sp.max_amount && <input type="hidden" name="max_amount" value={sp.max_amount} />}
  {sp.sort     && <input type="hidden" name="sort"     value={sp.sort} />}
  {/* При новом поиске сбрасываем page на 1 — не передаём page как hidden */}

  <input
    type="text"
    name="q"
    defaultValue={sp.q ?? ''}
    placeholder="Поиск по названию..."
    className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
  />
  <button
    type="submit"
    className="px-4 py-1.5 rounded-md border text-sm bg-gray-900 text-white hover:bg-gray-700"
  >
    Найти
  </button>
  {sp.q && (
    <a
      href={`/catalog?${new URLSearchParams(
        Object.fromEntries(
          Object.entries({ industry: sp.industry, stage: sp.stage, min_amount: sp.min_amount, max_amount: sp.max_amount, sort: sp.sort })
            .filter(([, v]) => v != null) as [string, string][]
        )
      )}`}
      className="px-3 py-1.5 rounded-md border text-sm hover:bg-gray-50"
    >
      Сбросить
    </a>
  )}
</form>
```

> `page` не включается в hidden inputs — при новом поиске пагинация сбрасывается на 1.

#### 3d. Показать метку активного поиска

Если `sp.q` задан — показать над карточками:

```tsx
{sp.q && (
  <p className="text-sm text-gray-500 mb-2">
    Результаты поиска: «{sp.q}» — {catalog.total} проектов
  </p>
)}
```

### 4. Тесты — `__tests__/t40.test.ts`

```typescript
// 1. GET /api/investor/catalog?q=Tech — применяет or(...ilike...%Tech%...) к data и count запросам
// 2. GET /api/investor/catalog?q=   — пустая строка после trim() игнорируется, ilike не применяется
// 3. GET /api/investor/catalog — без q параметра, ilike не применяется (регрессия)
// 4. GET /api/investor/catalog?q=Test&page=2&per_page=5 — поиск работает совместно с пагинацией
// 5. GET /api/investor/catalog?q=Test&industry=IT — поиск работает совместно с фильтром industry
// 6. GET /api/investor/catalog?q=Test&stage=seed — поиск работает совместно с фильтром stage
// 7. GET /api/investor/catalog?q=Test — ответ содержит { items, total, page, per_page, total_pages }
// 8. GET /api/investor/catalog?q=Test&sort=amount_asc — поиск работает совместно с сортировкой
// 9. GET /api/investor/catalog — 401 без авторизации
// 10. GET /api/investor/catalog?q=Test — total отражает количество найденных (из count-запроса с поиском)
```

### Структура моков для тестов

```typescript
// Mock supabase chain поддерживает .or()
const mockOr     = jest.fn().mockReturnThis()
const mockRange  = jest.fn().mockResolvedValue({ data: mockItems, error: null })
const mockHead   = jest.fn().mockResolvedValue({ count: 7, error: null })

// Проверить что mockOr вызван с правильным аргументом:
expect(mockOr).toHaveBeenCalledWith(
  expect.stringContaining('name.ilike.%Tech%')
)
```

> Подсказка: `or` вызывается в цепочке после `eq` фильтров и до `range`/`head`.
> В mock-цепочке добавь `.or` рядом с `.eq`, `.gte`, `.lte`.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не трогать файлы кроме указанных в этом ТЗ
- Не добавлять новые миграции — `v_investor_catalog` уже существует
- Поиск работает через `ilike` — без Postgres FTS расширений
- Поиск применяется к полям `name` и `short_description` через `.or()`
- Пагинация и фильтры продолжают работать совместно с поиском
- При новом поиске `page` сбрасывается на 1 (не передаётся как hidden input)
- Форма поиска — обычная HTML form с method="GET", без JavaScript

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t40.test.ts)
4. `GET /api/investor/catalog?q=название` фильтрует проекты по name и short_description
5. Пустой `q` (или пробелы) не применяет ilike — запрос без изменений
6. Поиск совместим с фильтрами, сортировкой и пагинацией
7. В UI каталога есть поле поиска с кнопкой «Найти» и «Сбросить»
8. При наличии `q` над карточками отображается «Результаты поиска: «...» — N проектов»
9. Записать в `progress.md`: `DONE: T40 + что создано/изменено`
