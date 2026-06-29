# T106 — Slate-тема для компонентов кабинета менеджера и общих компонентов

## Контекст

T101-T105 перевели все компоненты административного кабинета с `gray-*` → `slate-*`.
T106 охватывает оставшиеся файлы: кабинет менеджера, общие компоненты, и один файл модерации.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

1. `app/(manager)/manager/applications/page.tsx` (5 вхождений)
2. `app/(manager)/manager/applications/[id]/page.tsx` (7 вхождений)
3. `app/(manager)/manager/applications/[id]/application-status-updater.tsx` (1 вхождение)
4. `components/manager/application-notes.tsx` (5 вхождений)
5. `app/(admin)/moderation/[id]/rerun-analysis-button.tsx` (1 вхождение)
6. `components/notifications-bell.tsx` (3 вхождения)

---

## Правило замены

| Было | Стало |
|------|-------|
| `bg-gray-50` | `bg-slate-50` |
| `text-gray-400` | `text-slate-400` |
| `text-gray-500` | `text-slate-500` |
| `text-gray-600` | `text-slate-600` |
| `hover:bg-gray-50` | `hover:bg-slate-50` |
| `focus:ring-gray-400` | `focus:ring-slate-400` |

**ВАЖНО:** В `components/manager/application-notes.tsx` строка с кнопкой:
```
className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700 disabled:opacity-40"
```
`bg-gray-900` и `hover:bg-gray-700` — семантические цвета тёмной кнопки, **НЕ менять**.
Менять только: `focus:ring-gray-400`, `text-gray-400`, `bg-gray-50`.

---

## Детали по файлам

### `app/(manager)/manager/applications/page.tsx`

5 вхождений:

```tsx
// Кнопки фильтра — было hover:bg-gray-50 (3 штуки):
className="rounded border px-3 py-1 text-sm hover:bg-slate-50"

// Пустое состояние — было text-gray-500:
<p className="text-slate-500">Заявок нет.</p>

// Thead — было bg-gray-50:
<thead className="border-b bg-slate-50">
```

### `app/(manager)/manager/applications/[id]/page.tsx`

7 вхождений — все `text-gray-500` в dt-элементах:

```tsx
<span className="text-slate-500">Проект</span>
<span className="text-slate-500">Инвестор</span>
<span className="text-slate-500">Сумма</span>
<span className="text-slate-500">Инструмент</span>
<span className="text-slate-500">Комментарий</span>
<span className="text-slate-500">Статус</span>
<span className="text-slate-500">Дата подачи</span>
```

### `app/(manager)/manager/applications/[id]/application-status-updater.tsx`

1 вхождение — `focus:ring-gray-400`:

```tsx
className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"
```

### `components/manager/application-notes.tsx`

5 вхождений (НЕ трогать `bg-gray-900` и `hover:bg-gray-700` на кнопке):

```tsx
// Пустое состояние:
<p className="text-sm text-slate-400">Заметок пока нет.</p>

// Карточка заметки:
<li key={note.id} className="rounded-md border bg-slate-50 p-3 text-sm">

// Мета-информация:
<div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">

// focus:ring в textarea:
className="w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-slate-400"

// Счётчик символов:
<span className="text-xs text-slate-400">{content.length}/2000</span>
```

### `app/(admin)/moderation/[id]/rerun-analysis-button.tsx`

1 вхождение — `text-gray-600`:

```tsx
{message && <span className="text-sm text-slate-600">{message}</span>}
```

### `components/notifications-bell.tsx`

3 вхождения:

```tsx
// Тело уведомления:
<div className="text-xs leading-5 text-slate-600">{notification.body}</div>

// Время:
<div className="text-xs text-slate-400">

// Пустое состояние:
<div className="py-6 text-center text-sm text-slate-500">Нет уведомлений</div>
```

---

## Ограничения

- Менять ТОЛЬКО `gray-*` → `slate-*` в классах Tailwind CSS
- НЕ трогать `bg-gray-900` и `hover:bg-gray-700` на кнопках (семантические тёмные)
- НЕ трогать красные/зелёные/синие/жёлтые цвета (они семантические)
- НЕ трогать другие файлы вне списка (в частности, НЕ трогать `components/ui/*.tsx`)
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. В 6 указанных файлах нет классов `bg-gray-50`, `text-gray-{4,5,6}00`, `hover:bg-gray-50`, `focus:ring-gray-400`
4. Записать в progress.md: `DONE: T106` + что изменено
