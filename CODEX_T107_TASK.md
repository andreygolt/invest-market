# T107 — Slate-тема для компонентов кабинета проекта и оставшихся admin-файлов

## Контекст

T101-T106 перевели большинство компонентов с `gray-*` → `slate-*`.
T107 охватывает оставшиеся файлы: кабинет проекта, анкеты, компонент таймлайна и два admin-файла.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

1. `app/(project)/dashboard/project-dashboard-client.tsx` (14 вхождений)
2. `components/project/status-timeline.tsx` (10 вхождений)
3. `app/(project)/questionnaire/sections58/page.tsx` (10 вхождений)
4. `app/(project)/questionnaire/page.tsx` (10 вхождений)
5. `app/(admin)/admin/applications/applications-client.tsx` (6 вхождений)
6. `app/(admin)/invites/invites-client.tsx` (4 вхождения)

---

## Правило замены

| Было | Стало |
|------|-------|
| `bg-gray-50` | `bg-slate-50` |
| `bg-gray-100` | `bg-slate-100` |
| `bg-gray-200` | `bg-slate-200` |
| `text-gray-400` | `text-slate-400` |
| `text-gray-500` | `text-slate-500` |
| `text-gray-600` | `text-slate-600` |
| `text-gray-700` | `text-slate-700` |
| `text-gray-900` | `text-slate-900` |
| `border-gray-200` | `border-slate-200` |
| `border-gray-300` | `border-slate-300` |
| `hover:bg-gray-50` | `hover:bg-slate-50` |

---

## Детали по файлам

### `app/(project)/dashboard/project-dashboard-client.tsx`

14 вхождений:

```tsx
// STATUS_LABELS — draft (строка 9):
draft: { label: 'Черновик', color: 'bg-slate-100 text-slate-700' },

// fallback color (строка 64):
color: 'bg-slate-100 text-slate-700',

// Нет проекта — текст (строка 49):
<p className="mb-6 text-sm text-slate-500">

// Категория проекта (строка 72):
{project.category && <p className="mt-1 text-sm text-slate-500">{project.category}</p>}

// Метрика 1 — подпись (строка 82):
<p className="mt-1 text-sm text-slate-500">Просмотров deal room</p>

// Метрика 2 — подпись (строка 85):
<p className="mt-1 text-sm text-slate-500">Заявок от инвесторов</p>

// Кнопка «Редактировать анкету» (строка 96):
className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"

// Кнопка «Опубликовать обновление» (строка 109):
className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"

// Кнопка «Документы» (строка 113):
className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"

// Ссылка «Все обновления» (строка 123):
<Link href="/updates" className="text-xs text-slate-500 hover:underline">

// AI-summary обновления (строка 132):
<p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{update.ai_summary}</p>

// Дата обновления (строка 134):
<p className="mt-0.5 text-xs text-slate-400">
```

### `components/project/status-timeline.tsx`

10 вхождений:

```tsx
// STATUS_LABELS — draft (строка 6):
draft: { label: 'Черновик', color: 'bg-slate-200 text-slate-700' },

// StatusBadge fallback (строка 14):
const meta = STATUS_LABELS[status] ?? { label: status, color: 'bg-slate-100 text-slate-600' };

// Пустое состояние (строка 28):
return <p className="text-sm text-slate-400">История изменений статуса пока пуста.</p>;

// Линия таймлайна (строка 32):
<ol className="relative ml-3 space-y-6 border-l border-slate-200">

// Кружок-номер — граница и цвет (строка 35):
<span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-xs font-bold text-slate-500">

// Стрелка → (строка 43):
<span className="text-xs text-slate-400">→</span>

// Время (строка 48):
<time className="text-xs text-slate-400">
```

### `app/(project)/questionnaire/sections58/page.tsx`

10 вхождений:

```tsx
// Checkbox border (строка 51):
className="h-4 w-4 rounded border-slate-300"

// Дисклеймер в Section6 (строка 69):
<p className="text-xs text-slate-500 bg-slate-50 border rounded p-3">

// Loading (строка 282):
<p className="text-slate-500">Загрузка...</p>

// Done screen — фон (строка 287):
<main className="min-h-screen flex items-center justify-center bg-slate-50">

// Done screen — подпись (строка 291):
<p className="text-slate-500 text-sm mb-4">Все 8 секций заполнены. Теперь загрузите документы.</p>

// Main background (строка 301):
<main className="min-h-screen bg-slate-50 py-10 px-4">

// Шаг N из M (строка 305):
<p className="text-sm text-slate-500 mt-1">Шаг {step + 1} из {TOTAL}</p>

// Progress bar — неактивные шаги (строка 312):
`h-1 rounded-full mb-1 ${i <= step ? 'bg-slate-900' : 'bg-slate-200'}`

// Progress label — неактивный (строка 313):
`text-xs ${i === step ? 'font-medium text-slate-900' : 'text-slate-400'}`
```

### `app/(project)/questionnaire/page.tsx`

10 вхождений:

```tsx
// Основатель N — подпись (строка 97):
<span className="text-sm font-medium text-slate-500">Основатель {i + 1}</span>

// Loading (строка 279):
<p className="text-slate-500">Загрузка...</p>

// Нет проекта — фон (строка 284):
<main className="min-h-screen flex items-center justify-center bg-slate-50">

// Нет проекта — подпись (строка 287):
<p className="text-slate-500 text-sm mb-6">Введите название вашего проекта, чтобы начать анкету.</p>

// Done — фон (строка 307):
<main className="min-h-screen flex items-center justify-center bg-slate-50">

// Done — подпись (строка 311):
<p className="text-slate-500 text-sm">Продолжите заполнение анкеты в следующем этапе (секции 5-8) и загрузите документы.</p>

// Main background (строка 318):
<main className="min-h-screen bg-slate-50 py-10 px-4">

// Шаг N из M (строка 322):
<p className="text-sm text-slate-500 mt-1">Анкета проекта — шаг {step + 1} из {TOTAL}</p>

// Progress bar — неактивные шаги (строка 328):
`h-1 rounded-full mb-1 ${i <= step ? 'bg-slate-900' : 'bg-slate-200'}`

// Progress label — неактивный (строка 329):
`text-xs ${i === step ? 'font-medium text-slate-900' : 'text-slate-400'}`
```

### `app/(admin)/admin/applications/applications-client.tsx`

6 вхождений:

```tsx
// STATUS_BADGES — cancelled (строка 40):
cancelled: 'border-slate-200 bg-slate-100 text-slate-900',

// Счётчик строка (строка 151):
<div className="mb-4 text-sm text-slate-600">

// Пустое состояние (строка 157):
<div className="rounded-md border py-12 text-center text-sm text-slate-500">

// Нет действий — прочерк (строка 206):
<span className="text-sm text-slate-500">-</span>
```

**ВАЖНО:** Остальные статусные бейджи (pending=yellow, approved=green, rejected=red) — семантические, НЕ менять.

### `app/(admin)/invites/invites-client.tsx`

4 вхождения:

```tsx
// STATUS_BADGE_CLASSES — unused (строка 41):
unused: 'border-slate-200 bg-slate-50 text-slate-700',

// Пустое состояние таблицы (строка 248):
<TableCell colSpan={8} className="py-10 text-center text-slate-500">
```

**ВАЖНО:** Остальные статусные бейджи (used=green, expired=red) — семантические, НЕ менять.

---

## Ограничения

- Менять ТОЛЬКО `gray-*` → `slate-*` в классах Tailwind CSS
- НЕ трогать красные/зелёные/синие/жёлтые цвета (они семантические)
- НЕ трогать `bg-gray-900`, `hover:bg-gray-700`, `hover:bg-gray-800` на тёмных кнопках (семантические)
- НЕ трогать `components/ui/*.tsx` (shadcn/ui — не трогать)
- НЕ трогать другие файлы вне списка
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. В 6 указанных файлах нет классов `bg-gray-{50,100,200}`, `text-gray-{4,5,6,7,9}00`, `border-gray-{200,300}`, `hover:bg-gray-50`
4. Записать в progress.md: `DONE: T107` + что изменено
