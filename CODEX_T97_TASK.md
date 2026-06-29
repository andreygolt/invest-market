# T97 — Светлая тема: каталог, dashboard, deal room + горизонтальный фильтр

## Контекст

T91, T92, T93, T94, T95, T96 не были выполнены (usage limit). Это повтор задачи T96.

T85–T90 перевели на тёмную тему страницы инвестора, кабинет проекта, профиль, уведомления.
Теперь принято решение перевести публичную часть приложения (каталог, dashboard, deal room) на **светлую тему** — белый фон, тёмный текст, карточки с тенями.

**Лендинг `app/page.tsx` остаётся тёмным — НЕ ТРОГАТЬ.**

---

## Файлы для изменения

Обязательно прочитать файл полностью перед изменением:

- `app/layout.tsx` — глобальный layout
- `app/(investor)/layout.tsx` — navbar инвестора
- `app/(investor)/catalog/page.tsx` — страница каталога
- `app/(investor)/catalog/catalog-card.tsx` — карточка проекта в каталоге
- `app/(investor)/catalog/catalog-filters.tsx` — боковой фильтр (убрать sidebar → горизонталь)
- `app/dashboard/page.tsx` — корневой dashboard (если существует)
- `app/(investor)/deals/[id]/page.tsx` — deal room

### НЕ трогать:
- `app/page.tsx` (лендинг)
- `app/(auth)/` (login, invite, pending)
- `app/(project)/` (кабинет проекта)
- `app/(admin)/` (панель администратора)
- Все API routes
- Логику данных, fetch, handlers, state — только UI-классы и структуру JSX

---

## Часть 1: Глобальный layout

### `app/layout.tsx`

Body должен быть светлым:
```tsx
<body className="min-h-full flex flex-col bg-white text-slate-900 antialiased">
```

---

## Часть 2: Navbar инвестора

### `app/(investor)/layout.tsx`

Светлый navbar:
```tsx
// header: bg-white border-b border-slate-200
// текст навигации: text-slate-600 hover:text-slate-900
// активный пункт: text-slate-900 font-medium
// фон страницы: bg-slate-50
```

Пример:
```tsx
<header className="bg-white border-b border-slate-200">
  <div className="container mx-auto px-4 py-3 flex items-center gap-6">
    <span className="font-semibold text-slate-900">Invest Market</span>
    <nav className="flex gap-4 text-sm">
      <Link href="/catalog" className="text-slate-600 hover:text-slate-900 transition-colors">Каталог</Link>
      {/* остальные ссылки аналогично */}
    </nav>
  </div>
</header>
```

---

## Часть 3: Каталог — светлая тема + горизонтальный фильтр

### `app/(investor)/catalog/catalog-card.tsx`

Светлая карточка:
```
bg-white border border-slate-200 rounded-xl p-6
hover:shadow-md hover:border-slate-300 transition-all
```

- Название: `text-slate-900 font-semibold`
- Описание: `text-slate-500 text-sm`
- Метрики: `text-slate-600`
- Бейдж отрасли: `bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-md`
- AI Score >= 80: `bg-emerald-50 text-emerald-700 border border-emerald-200`
- AI Score >= 60: `bg-amber-50 text-amber-700 border border-amber-200`
- AI Score < 60: `bg-slate-100 text-slate-600 border border-slate-200`
- Кнопка/ссылка: `text-slate-500 hover:text-slate-900`

### `app/(investor)/catalog/page.tsx` и `catalog-filters.tsx`

Убрать боковой sidebar с фильтрами. Сделать горизонтальную строку фильтров под заголовком.

**Заголовок:**
```tsx
<div className="mb-6">
  <h1 className="text-2xl font-bold text-slate-900">Каталог проектов</h1>
  <p className="text-slate-500 text-sm mt-1">Проверенные инвестиционные возможности</p>
</div>
```

**Горизонтальные фильтры:**
```tsx
<div className="flex gap-3 items-center mb-6 flex-wrap">
  <input
    type="text"
    placeholder="Поиск по названию..."
    className="flex-1 min-w-48 border border-slate-300 rounded-lg px-4 py-2 text-sm bg-white text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
  />
  <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400">
    <option value="">Все отрасли</option>
    {/* options */}
  </select>
  <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400">
    <option value="">Все стадии</option>
    {/* options */}
  </select>
  <select className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700 focus:outline-none focus:border-slate-400">
    <option value="updated_at_desc">Новые сначала</option>
    <option value="ai_score_desc">По AI Score</option>
    <option value="min_investment_asc">По мин. инвестиции</option>
  </select>
</div>
```

- Убрать блок с активными фильтрами (chips) если есть
- Сетка карточек: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-2`
- Фон страницы: `min-h-screen bg-slate-50`
- Контейнер: `container mx-auto max-w-7xl px-4 py-8`

---

## Часть 4: Dashboard — светлая тема

### `app/dashboard/page.tsx` (или соответствующий client-компонент)

Прочитать файл полностью перед изменением.

- Фон страницы: убрать `bg-[#0a0a0a]` / `bg-slate-950` → `bg-slate-50`
- Заголовок: `text-slate-900`
- Карточки статистики: `bg-white border border-slate-200 rounded-xl shadow-sm p-5`
- Метки: `text-slate-500 text-sm`
- Значения: `text-slate-900 text-2xl font-bold`
- Секции: `bg-white border border-slate-200 rounded-xl p-6`
- Текст: `text-slate-600`
- Таблицы: `divide-y divide-slate-100`, ячейки `text-slate-700`
- Кнопки: заменить тёмные hover на светлые (`hover:bg-slate-100`)

---

## Часть 5: Deal Room — светлая тема

### `app/(investor)/deals/[id]/page.tsx`

Прочитать файл полностью перед изменением.

- Фон: `bg-slate-50` или `bg-white`
- Убрать все `bg-slate-900`, `bg-[#0a0a0a]`, `bg-slate-950`, `text-white`, `text-slate-400` → заменить на светлые эквиваленты
- Карточки/секции: `bg-white border border-slate-200 rounded-xl p-6`
- AI Score блок: `bg-slate-50 border border-slate-200 rounded-xl`
- AI Score высокий (>=80): `text-emerald-600 font-bold`
- AI Score средний (>=60): `text-amber-600 font-bold`
- AI Score низкий: `text-slate-600 font-bold`
- Кнопка «Подать заявку»: `bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-6 py-3 font-medium`
- Документы: `bg-slate-50 border border-slate-200 rounded-lg`
- Обновления: `bg-white border border-slate-200 rounded-lg`

---

## Ограничения

- Лендинг `app/page.tsx` — НЕ ТРОГАТЬ
- `app/(auth)/` — НЕ ТРОГАТЬ
- `app/(project)/` — НЕ ТРОГАТЬ
- `app/(admin)/` — НЕ ТРОГАТЬ
- Все API routes — НЕ ТРОГАТЬ
- Читать каждый файл полностью перед изменением
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не трогать логику (fetch, handlers, state) — только UI-классы и структуру JSX

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/catalog` — светлый фон `bg-slate-50`, горизонтальные фильтры в одну строку, светлые карточки `bg-white`
4. `/dashboard` — светлый фон, светлые карточки статистики
5. `/deals/[id]` — светлый фон, светлые секции
6. Лендинг `/` — остаётся тёмным (не изменён)
7. Записать в progress.md: `DONE: T97` + что создано/изменено
