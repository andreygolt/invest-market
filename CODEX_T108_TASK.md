# T108 — Финальная slate-тема: оставшиеся 9 файлов

## Контекст

T101-T107 перевели большинство компонентов с `gray-*` → `slate-*`.
T108 охватывает последние файлы с нейтральными gray-классами, которые не попали в предыдущие задачи.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

1. `app/(investor)/catalog/pagination-controls.tsx` (3 вхождения)
2. `app/(auth)/login/page.tsx` (1 вхождение)
3. `app/(admin)/referral-rewards/referral-rewards-admin.tsx` (1 вхождение)
4. `app/(admin)/admin/commercial-terms/page.tsx` (3 вхождения)
5. `app/(admin)/admin/invites/invite-create-form.tsx` (1 вхождение)
6. `app/(admin)/admin/invites/page.tsx` (2 вхождения)
7. `app/(admin)/admin/notifications/broadcast-form-client.tsx` (3 вхождения)
8. `app/(admin)/users/users-client.tsx` (1 вхождение)
9. `app/(admin)/export/export-page-client.tsx` (1 вхождение)

---

## Правило замены

| Было | Стало |
|------|-------|
| `bg-gray-50` | `bg-slate-50` |
| `text-gray-400` | `text-slate-400` |
| `text-gray-500` | `text-slate-500` |
| `text-gray-600` | `text-slate-600` |
| `text-gray-700` | `text-slate-700` |
| `border-gray-200` | `border-slate-200` |
| `hover:bg-gray-50` | `hover:bg-slate-50` |

---

## Детали по файлам

### `app/(investor)/catalog/pagination-controls.tsx`

3 вхождения:

```tsx
// Кнопки навигации (строки 29 и 42):
className="px-3 py-1 rounded border text-sm hover:bg-slate-50"

// Текст страницы (строка 35):
<span className="text-sm text-slate-600">
```

### `app/(auth)/login/page.tsx`

1 вхождение (строка 29):

```tsx
<main className="min-h-screen flex items-center justify-center bg-slate-50">
```

### `app/(admin)/referral-rewards/referral-rewards-admin.tsx`

1 вхождение (строка 187):

```tsx
<TableCell colSpan={6} className="py-10 text-center text-slate-500">
```

### `app/(admin)/admin/commercial-terms/page.tsx`

3 вхождения:

```tsx
// Подзаголовок (строка 57):
<p className="mt-1 text-sm text-slate-500">Success fee и фиксированные условия по проектам</p>

// Ячейка заметок (строка 83):
<TableCell className="max-w-xs text-slate-600">

// Пустое состояние (строка 97):
<TableCell colSpan={5} className="py-10 text-center text-slate-500">
```

### `app/(admin)/admin/invites/invite-create-form.tsx`

1 вхождение (строка 121):

```tsx
<div className="mb-4 break-all rounded-md bg-slate-50 p-3 font-mono text-sm">
```

### `app/(admin)/admin/invites/page.tsx`

2 вхождения:

```tsx
// Статус «Активен» в функции getInviteStatus (строка 50):
return {
  label: 'Активен',
  className: 'border-slate-200 bg-slate-50 text-slate-700',
};

// Пустое состояние таблицы (строка 144):
<TableCell colSpan={6} className="py-10 text-center text-slate-500">
```

### `app/(admin)/admin/notifications/broadcast-form-client.tsx`

3 вхождения:

```tsx
// Счётчик заголовка (строка 99):
<div className="text-right text-xs text-slate-400">{title.length}/120</div>

// Счётчик текста (строка 112):
<div className="text-right text-xs text-slate-400">{body.length}/1000</div>

// Подпись поля ссылки (строка 117):
Ссылка <span className="text-slate-400">(необязательно)</span>
```

### `app/(admin)/users/users-client.tsx`

1 вхождение (строка 284):

```tsx
<TableCell colSpan={6} className="py-10 text-center text-slate-500">
```

### `app/(admin)/export/export-page-client.tsx`

1 вхождение (строка 54):

```tsx
<p className="text-sm text-slate-600">
```

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
3. В 9 указанных файлах нет нейтральных классов `bg-gray-50`, `text-gray-{4,5,6,7}00`, `border-gray-200`, `hover:bg-gray-50`
4. Записать в progress.md: `DONE: T108` + что изменено
