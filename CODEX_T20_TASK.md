# CODEX TASK T20 — Полировка, дисклеймеры, production deploy

## Цель

Финальная полировка платформы: унифицированный компонент дисклеймера,
глобальный footer с дисклеймером в investor-разделе, 404-страница,
loading-скелетоны для ключевых страниц, `.env.example` для деплоя.

## Контекст

Уже существует:
- Дисклеймеры добавлены вручную на нескольких страницах (каталог, yield-calculator,
  portfolio, apply-form, dashboard) — но в разном формате и без единого компонента
- `app/(investor)/layout.tsx` — layout без footer
- `app/(admin)/layout.tsx` — layout без footer
- `components/ui/` — shadcn компоненты (badge, button, card, input, label, select,
  table, textarea)
- Нет `app/not-found.tsx`
- Нет `.env.example`
- Нет loading.tsx ни на одной странице

## Что создать

### 1. Shared Disclaimer component

**Файл:** `components/disclaimer.tsx`

Клиентский компонент (без `'use client'` — просто серверный JSX):

```tsx
// Props: variant?: 'default' | 'compact'
// variant='default' — полный текст в Card с отступами
// variant='compact' — текст в <p> с text-xs text-muted-foreground

const DISCLAIMER_TEXT =
  'Платформа не является брокером, инвестиционным советником или ' +
  'организатором торгов. Размещённая информация носит ознакомительный ' +
  'характер и не является офертой, гарантией доходности или инвестиционной ' +
  'рекомендацией. Все сделки заключаются вне платформы. Инвестирование ' +
  'связано с риском потери вложенных средств.'
```

Экспортировать как `export function Disclaimer({ variant = 'default' }: Props)`.

### 2. Footer с дисклеймером в investor layout

**Файл:** `app/(investor)/layout.tsx`

Изучи существующий файл перед редактированием. Добавить `<footer>` после `<main>`:

```tsx
<footer className="border-t mt-auto py-4">
  <div className="container mx-auto px-4">
    <Disclaimer variant="compact" />
  </div>
</footer>
```

Импортировать `Disclaimer` из `@/components/disclaimer`.

### 3. Кастомная 404-страница

**Файл:** `app/not-found.tsx`

```tsx
// Серверный компонент
// Показывает: заголовок «404 — Страница не найдена»
// Подзаголовок: «Запрашиваемая страница не существует или была перемещена»
// Кнопка-ссылка «На главную» → href="/"
// Используй Card из shadcn, центровка по экрану
// Без импорта Disclaimer — не нужен на 404
```

### 4. Loading-скелетоны

Добавить файлы `loading.tsx` для двух ключевых маршрутов инвестора.
Использовать только Tailwind animate-pulse div-ы (без новых зависимостей).

**Файл:** `app/(investor)/catalog/loading.tsx`

```tsx
// Серверный компонент
// Показывает: заголовок-заглушка + 6 карточек-скелетонов в grid
// Каждый скелетон: rounded-lg border p-4 space-y-3 animate-pulse
// Высота блоков: h-4 bg-muted rounded для текста, h-6 для заголовка
```

**Файл:** `app/(investor)/portfolio/loading.tsx`

```tsx
// Серверный компонент
// Показывает: заголовок-заглушка + 3 строки-скелетона
// Простые animate-pulse блоки
```

### 5. .env.example

**Файл:** `.env.example` (в корне invest_market/)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...

# App
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 6. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец:

```ts
// T20 — Disclaimer
export type DisclaimerVariant = 'default' | 'compact'
```

### 7. Тесты

**Файл:** `__tests__/t20.test.ts`

Тесты (без мока Supabase — тестируем только pure функции и типы):

1. `Disclaimer` рендерится без ошибок с `variant='default'`
2. `Disclaimer` рендерится без ошибок с `variant='compact'`
3. Текст дисклеймера содержит «не является» (проверка текста)
4. Текст дисклеймера содержит «риском потери»
5. Текст дисклеймера содержит «вне платформы»
6. Тип `DisclaimerVariant` принимает значения `'default'` и `'compact'`
7. `loading.tsx` каталога — рендерится без ошибок (импорт + вызов)
8. `loading.tsx` портфеля — рендерится без ошибок (импорт + вызов)

Паттерн теста компонентов — без `@testing-library/react`, только проверка
что функции-компоненты не бросают исключения при вызове:

```ts
import { Disclaimer } from '@/components/disclaimer'
// ...
test('Disclaimer default renders', () => {
  expect(() => Disclaimer({ variant: 'default' })).not.toThrow()
})
```

Для проверки текста — вынеси `DISCLAIMER_TEXT` из компонента как
именованный export константы.

## Что НЕ делать

- Не добавлять новые npm-зависимости (в том числе @testing-library/react)
- Не изменять существующие миграции или API routes
- Не переписывать существующие дисклеймеры на страницах — они уже есть
- Не добавлять footer в admin layout — он не нужен модераторам
- Не создавать vercel.json — Vercel подхватывает Next.js без конфигурации

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t20.test.ts)
4. `components/disclaimer.tsx` — компонент с двумя вариантами
5. `app/(investor)/layout.tsx` — footer с compact дисклеймером
6. `app/not-found.tsx` — кастомная 404-страница
7. `app/(investor)/catalog/loading.tsx` — loading state для каталога
8. `app/(investor)/portfolio/loading.tsx` — loading state для портфеля
9. `.env.example` — документация всех переменных среды
10. Запись в `progress.md`: `DONE: T20 + список созданных/изменённых файлов`
