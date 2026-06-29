# T92 — Светлая тема внутри приложения + правильный фильтр каталога

## Контекст

Лендинг (`app/page.tsx`) остаётся тёмным — не трогать.
Всё внутри приложения переводится на светлую тему: белый фон, тёмный текст, карточки с тенями.

## Часть 1: Светлая тема — глобальный layout

### Прочитать и обновить `app/layout.tsx`

Body должен быть светлым:
```tsx
<body className="min-h-full flex flex-col bg-white text-slate-900 antialiased">
```

### Прочитать и обновить `app/(investor)/layout.tsx` (если существует)

Убрать тёмный фон, добавить светлый navbar:
```tsx
// navbar: bg-white border-b border-slate-200
// текст навигации: text-slate-700 hover:text-slate-900
// активный пункт: text-slate-900 font-medium
```

## Часть 2: Каталог — светлая тема + правильный фильтр

### Прочитать `app/(investor)/catalog/page.tsx` и `catalog-card.tsx`

**Карточка (catalog-card.tsx):**
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
- Кнопка: `text-slate-500 hover:text-slate-900`

**Фильтр каталога (page.tsx) — горизонтальная панель сверху:**

Убрать боковой sidebar с фильтрами. Сделать горизонтальную строку фильтров под заголовком:

```
[Поиск_________________] [Отрасль ▼] [Стадия ▼] [Сортировка ▼]
```

- Весь ряд в одну строку: `flex gap-3 items-center mb-6`
- Поиск: `flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm bg-white`
- Дропдауны: нативный `<select>` или shadcn Select, `border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white text-slate-700`
- Убрать блок с активными фильтрами (chips) — не нужен
- Сетка карточек: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mt-6`

**Заголовок каталога:**
```tsx
<div className="mb-6">
  <h1 className="text-2xl font-bold text-slate-900">Каталог проектов</h1>
  <p className="text-slate-500 text-sm mt-1">Проверенные инвестиционные возможности</p>
</div>
```

## Часть 3: Dashboard — светлая тема

Прочитать `app/dashboard/page.tsx`.

- Фон: убрать `bg-[#0a0a0a]`, заменить на `bg-slate-50`
- Заголовок: `text-slate-900`
- Карточки: `bg-white border border-slate-200 rounded-xl`
- Текст: `text-slate-600`
- Кнопки navbar: стандартные светлые

## Часть 4: Deal Room — светлая тема

Прочитать `app/(investor)/deals/[id]/page.tsx`.

- Фон: `bg-white` или `bg-slate-50`
- Убрать все `bg-slate-900`, `bg-[#0a0a0a]`, `text-white`, `text-slate-400` → заменить на светлые эквиваленты
- Карточки: `bg-white border border-slate-200 rounded-xl`
- AI Score блок: `bg-slate-50 border border-slate-200`

## Ограничения

- Лендинг `app/page.tsx` — НЕ ТРОГАТЬ
- Страница `/pending` — НЕ ТРОГАТЬ  
- Страницы `/invite/[code]` — НЕ ТРОГАТЬ
- Читать все файлы перед изменением
- NO новых npm-зависимостей

## Definition of Done

1. npm run build — без ошибок
2. /catalog — светлый фон, горизонтальные фильтры, светлые карточки
3. /dashboard — светлый фон
4. /deals/[id] — светлый фон
5. Лендинг / — остаётся тёмным
6. Записать в progress.md: DONE: T92
