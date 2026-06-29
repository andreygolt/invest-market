# T104 — Slate-тема для компонентов административного кабинета (часть 1)

## Контекст

T103 перевёл кабинет менеджера на slate-стиль. В административном кабинете
остаются файлы с `gray` классами Tailwind — они визуально конфликтуют с
единой slate-темой остальных кабинетов.

T104 охватывает 6 файлов с наибольшим числом gray-классов.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

1. `app/(admin)/admin-dashboard-client.tsx`
2. `app/(admin)/admin/analytics/analytics-client.tsx`
3. `app/(admin)/settings/settings-client.tsx`
4. `app/(admin)/moderation/page.tsx`
5. `app/(admin)/moderation/[id]/page.tsx`
6. `app/(admin)/moderation/[id]/moderation-actions.tsx`

---

## Правило замены

Во всех 6 файлах применить замены:

| Было | Стало |
|------|-------|
| `bg-gray-50` | `bg-slate-50` |
| `bg-gray-100` | `bg-slate-100` |
| `bg-gray-200` | `bg-slate-200` |
| `bg-gray-400` | `bg-slate-400` |
| `text-gray-400` | `text-slate-400` |
| `text-gray-500` | `text-slate-500` |
| `text-gray-600` | `text-slate-600` |
| `text-gray-700` | `text-slate-700` |
| `border-gray-200` | `border-slate-200` |
| `hover:bg-gray-50` | `hover:bg-slate-50` |

---

## Детали по файлам

### `app/(admin)/admin-dashboard-client.tsx`

Конкретные замены (16 вхождений):

```tsx
// STATUS_BADGE_CLASSES — строка 'draft':
draft: 'border-slate-200 bg-slate-50 text-slate-700',

// STATUS_BAR_CLASSES — строка 'draft':
draft: 'bg-slate-400',

// CardTitle текст:
<CardTitle className="text-sm font-medium text-slate-500">

// Описания в карточках:
<p className="mt-1 text-sm text-slate-500">...</p>

// Прогресс-бар bg:
<div className="h-2 overflow-hidden rounded bg-slate-100">

// Строки в таблице (пустое состояние):
<TableCell colSpan={4} className="text-center text-slate-500">

// Span с числом-значением в chart:
<span className="text-slate-500">{item.value}</span>
```

### `app/(admin)/admin/analytics/analytics-client.tsx`

Конкретные замены (8 вхождений):

```tsx
// Неактивная кнопка периода:
'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'

// Loading text:
<div className="py-12 text-center text-slate-400">Загрузка...</div>

// Текст столбца в тотале:
<div className="mt-1 text-xs text-slate-500">{col.label}</div>

// Thead таблицы:
<thead className="bg-slate-50">

// Заголовки столбцов в таблице:
<th className="px-4 py-3 text-left font-medium text-slate-600">

// Hover строк:
<tr key={bucket.date_from} className="hover:bg-slate-50">

// MiniBar фон:
<div className="h-2 w-24 rounded-full bg-slate-100">
```

### `app/(admin)/settings/settings-client.tsx`

```tsx
// Label:
<label className="block text-sm font-medium text-slate-700">

// Hint:
<p className="mt-0.5 text-xs text-slate-500">{hint}</p>

// Input border:
className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
```

### `app/(admin)/moderation/page.tsx`

```tsx
// Счётчик проектов:
<p className="text-slate-500 mt-1">Проекты, ожидающие проверки: {items.length}</p>

// Empty state:
<CardContent className="py-12 text-center text-slate-500">

// Дата:
<p className="text-sm text-slate-500">
```

### `app/(admin)/moderation/[id]/page.tsx`

```tsx
// ID проекта:
<span className="text-sm text-slate-500">ID: {project.id}</span>

// Пустые состояния и описания:
text-gray-500 → text-slate-500

// Pre-блоки с кодом/JSON:
<pre className="bg-slate-100 rounded p-3 text-xs overflow-auto whitespace-pre-wrap">
<pre className="bg-slate-100 rounded p-3 text-xs overflow-auto max-h-48">
```

### `app/(admin)/moderation/[id]/moderation-actions.tsx`

```tsx
// Подсказка про причину отклонения:
<p className="text-xs text-slate-500 mt-1">Причина будет видна владельцу проекта</p>
```

---

## Ограничения

- Менять ТОЛЬКО `gray-*` → `slate-*` в классах Tailwind CSS
- НЕ трогать логику компонентов
- НЕ трогать красные/зелёные/синие/жёлтые цвета (они семантические)
- НЕ трогать другие файлы вне списка
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. В 6 указанных файлах нет классов `bg-gray-*`, `text-gray-*`, `border-gray-*`, `hover:bg-gray-*`
4. Записать в progress.md: `DONE: T104` + что изменено
