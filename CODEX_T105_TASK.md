# T105 — Slate-тема для компонентов административного кабинета (часть 2)

## Контекст

T104 перевёл 6 файлов административного кабинета с наибольшим числом gray-классов.
T105 охватывает следующие 6 файлов по убыванию числа gray-вхождений.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

1. `app/(admin)/admin/search/search-client.tsx` (16 вхождений)
2. `app/(admin)/admin/funnel/funnel-client.tsx` (14 вхождений)
3. `app/(admin)/audit-log/audit-log-client.tsx` (13 вхождений)
4. `app/(admin)/admin/investors-activity/investors-activity-client.tsx` (13 вхождений)
5. `app/(admin)/admin/dashboard/admin-dashboard-client.tsx` (12 вхождений)
6. `app/(admin)/users/[id]/user-detail-client.tsx` (7 вхождений)

---

## Правило замены

Во всех 6 файлах применить замены:

| Было | Стало |
|------|-------|
| `bg-gray-50` | `bg-slate-50` |
| `bg-gray-100` | `bg-slate-100` |
| `bg-gray-200` | `bg-slate-200` |
| `text-gray-400` | `text-slate-400` |
| `text-gray-500` | `text-slate-500` |
| `text-gray-600` | `text-slate-600` |
| `text-gray-700` | `text-slate-700` |
| `border-gray-200` | `border-slate-200` |
| `hover:bg-gray-50` | `hover:bg-slate-50` |
| `focus:border-gray-400` | `focus:border-slate-400` |

---

## Детали по файлам

### `app/(admin)/admin/search/search-client.tsx`

Конкретные замены (16 вхождений):

```tsx
// statusBadge — fallback и draft:
draft: 'bg-slate-100 text-slate-600',
map[status] ?? 'bg-slate-100 text-slate-600'

// Input:
className="w-full rounded-lg border border-slate-200 px-4 py-3 text-base outline-none focus:border-slate-400 focus:ring-0"

// Loading:
<div className="py-6 text-center text-sm text-slate-400">Поиск...</div>

// Empty state:
<div className="py-6 text-center text-sm text-slate-400">

// Section headings:
<h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">

// Project rows:
className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
<div className="text-xs text-slate-500">{project.category}</div>

// Investor rows:
className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
<div className="text-xs text-slate-500">{investor.email}</div>
<span className="text-xs text-slate-400">

// Application rows:
className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
<div className="text-xs text-slate-500">{application.investor_email}</div>
<span className="text-sm tabular-nums text-slate-700">
```

### `app/(admin)/admin/funnel/funnel-client.tsx`

Конкретные замены (14 вхождений):

```tsx
// ConversionBadge fallback:
'bg-slate-100 text-slate-600'

// Loading:
<div className="py-12 text-center text-slate-400">Загрузка...</div>

// Empty state:
<div className="py-12 text-center text-slate-400">

// Thead:
<thead className="bg-slate-50">

// Все th заголовки:
<th className="px-4 py-3 text-left font-medium text-slate-600">

// Hover строк:
<tr key={row.project_id} className="hover:bg-slate-50">

// Category cell:
<td className="px-4 py-3 text-slate-500">{row.category}</td>
```

### `app/(admin)/audit-log/audit-log-client.tsx`

Конкретные замены (13 вхождений):

```tsx
// Счётчик:
<span className="text-sm text-slate-500">Всего: {total}</span>

// Thead:
<thead className="bg-slate-50">

// Все th:
<th className="px-4 py-2 text-left font-medium text-slate-600">

// Empty/loading td:
className="px-4 py-6 text-center text-slate-400"

// Hover:
<tr key={row.id} className="hover:bg-slate-50">

// Дата:
<td className="whitespace-nowrap px-4 py-2 text-slate-500">

// Объект и Исполнитель td:
<td className="px-4 py-2 text-slate-600">

// Страница пагинации:
<span className="text-sm text-slate-600">
```

### `app/(admin)/admin/investors-activity/investors-activity-client.tsx`

Конкретные замены (13 вхождений):

```tsx
// Loading:
<div className="py-12 text-center text-slate-400">Загрузка...</div>

// Empty state:
<div className="py-12 text-center text-slate-400">

// Thead:
<thead className="bg-slate-50">

// Все th:
<th className="px-4 py-3 text-left font-medium text-slate-600">
<th className="px-4 py-3 text-right font-medium text-slate-600">

// Hover:
<tr key={row.investor_id} className="hover:bg-slate-50">

// Email cell:
<td className="max-w-[200px] truncate px-4 py-3 text-slate-500">{row.email}</td>

// Последняя активность:
<td className="px-4 py-3 text-right text-slate-500">
```

### `app/(admin)/admin/dashboard/admin-dashboard-client.tsx`

Конкретные замены (12 вхождений):

```tsx
// STATUS_BADGE_CLASSES — строка 'draft':
draft: 'border-slate-200 bg-slate-50 text-slate-700',

// CardTitle текст во всех 4 карточках метрик:
<CardTitle className="text-sm font-medium text-slate-500">

// Описания под числами:
<p className="mt-2 text-sm text-slate-500">

// Последние события — пустое состояние:
<p className="text-sm text-slate-500">Нет последних событий</p>

// Дата события:
<span className="text-slate-500">{formatDate(item.changed_at)}</span>

// Стрелка:
<span className="text-slate-400">-&gt;</span>
```

### `app/(admin)/users/[id]/user-detail-client.tsx`

Конкретные замены (7 вхождений):

```tsx
// dt labels в dl:
<dt className="text-xs font-medium text-slate-500">Имя</dt>
<dt className="text-xs font-medium text-slate-500">Email</dt>
<dt className="text-xs font-medium text-slate-500">Текущая роль</dt>
<dt className="text-xs font-medium text-slate-500">Дата регистрации</dt>
<dt className="text-xs font-medium text-slate-500">Статус</dt>

// TableCell с датой в секции Заявки:
<TableCell className="text-slate-500">

// TableCell с датой в секции Портфель:
<TableCell className="text-slate-500">
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
3. В 6 указанных файлах нет классов `bg-gray-*`, `text-gray-*`, `border-gray-*`, `hover:bg-gray-*`, `focus:border-gray-*`
4. Записать в progress.md: `DONE: T105` + что изменено
