# T91 — Тёмная тема: панель администратора (core)

## Контекст

В T85–T90 перевели на тёмную тему все страницы инвестора и кабинет проекта.

Панель администратора (`/moderation`, `/moderation/[id]`, корневой дашборд, `/admin/dashboard`) по-прежнему использует светлую тему (Card на bg-white, text-gray-500, Badge со светлыми вариантами). Нужно привести к той же тёмной теме что в T85–T90.

## Файлы для изменения

### Обязательно прочитать весь файл перед изменением:
- `app/(admin)/layout.tsx`
- `app/(admin)/admin-dashboard-client.tsx`
- `app/(admin)/admin/dashboard/admin-dashboard-client.tsx`
- `app/(admin)/moderation/page.tsx`
- `app/(admin)/moderation/[id]/page.tsx`
- `app/(admin)/moderation/[id]/moderation-actions.tsx`

### НЕ трогать:
- `app/(admin)/moderation/[id]/rerun-analysis-button.tsx` — не трогать
- Все API routes — не трогать
- Логику данных, fetch, handlers, state — только UI-классы и структуру JSX
- `app/(admin)/users/` — не трогать (следующая задача)
- `app/(admin)/invites/` — не трогать
- `app/(admin)/admin/analytics/` — не трогать
- `app/(admin)/admin/applications/` — не трогать
- `app/(admin)/audit-log/` — не трогать
- `app/(admin)/export/` — не трогать
- `app/(admin)/settings/` — не трогать

---

## Общие правила тёмного стиля (как в T85–T90)

**Фон страниц:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-4xl px-4 py-8">
    {/* содержимое */}
  </div>
</div>
```

**Секции вместо Card/bg-white:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Заголовок</h2>
  {/* содержимое */}
</div>
```

**Текст:**
- Основной: `text-slate-300`
- Вспомогательный / labels: `text-slate-500 text-sm`
- Заголовки h1: `text-2xl font-bold text-white`
- Заголовки h2/h3: `text-lg font-semibold text-white`

**Статус-бейджи (тёмные версии) — заменить Badge на span:**
```typescript
const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft:        'bg-slate-800 text-slate-300 border-slate-700',
  submitted:    'bg-blue-900/50 text-blue-300 border-blue-800',
  under_review: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  approved:     'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  rejected:     'bg-red-900/50 text-red-300 border-red-800',
  active:       'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  inactive:     'bg-red-900/50 text-red-300 border-red-800',
};
// Использование:
<span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[status] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
  {status}
</span>
```

**Кнопка основная (approve):**
```tsx
<button className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">
```

**Кнопка деструктивная (reject):**
```tsx
<button className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
```

**Кнопка outline (назад, ghost):**
```tsx
<button className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
```

**Textarea / Input тёмный:**
```
className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

**Таблица тёмная:**
```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b border-slate-800">
      <th className="pb-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Колонка</th>
    </tr>
  </thead>
  <tbody className="divide-y divide-slate-800">
    <tr className="hover:bg-slate-800/50 transition-colors">
      <td className="py-3 text-slate-300">значение</td>
    </tr>
  </tbody>
</table>
```

**Разделитель:**
```tsx
<div className="border-t border-slate-800" />
```

---

## 1. `app/(admin)/layout.tsx` — навигация администратора

Заменить светлый хедер на тёмный:

```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <header className="border-b border-slate-800 bg-slate-900">
    <div className="container mx-auto px-4 py-3 flex items-center gap-6">
      <span className="font-semibold text-white">Invest Market — Панель модератора</span>
      <nav className="flex gap-4 text-sm text-slate-500 flex-wrap">
        <Link href="/admin/search" className="hover:text-slate-200 transition-colors">Поиск</Link>
        <Link href="/admin/dashboard" className="hover:text-slate-200 transition-colors">Dashboard</Link>
        <Link href="/" className="hover:text-slate-200 transition-colors">Дашборд</Link>
        <Link href="/moderation" className="hover:text-slate-200 transition-colors">Модерация</Link>
        <Link href="/admin/referral-rewards" className="hover:text-slate-200 transition-colors">Реф. вознаграждения</Link>
        <Link href="/admin/notifications" className="hover:text-slate-200 transition-colors">Объявления</Link>
        <Link href="/admin/export" className="hover:text-slate-200 transition-colors">Экспорт</Link>
        <Link href="/admin/audit-log" className="hover:text-slate-200 transition-colors">Журнал</Link>
        <Link href="/admin/funnel" className="hover:text-slate-200 transition-colors">Воронка</Link>
        <Link href="/admin/investors-activity" className="hover:text-slate-200 transition-colors">Инвесторы</Link>
        <Link href="/admin/analytics" className="hover:text-slate-200 transition-colors">Аналитика</Link>
        <Link href="/admin/invites" className="hover:text-slate-200 transition-colors">Инвайты</Link>
        <Link href="/users" className="hover:text-slate-200 transition-colors">Пользователи</Link>
        <Link href="/admin/applications" className="hover:text-slate-200 transition-colors">Заявки</Link>
        <Link href="/settings" className="hover:text-slate-200 transition-colors">Настройки</Link>
        <Link href="/profile" className="hover:text-slate-200 transition-colors">Профиль</Link>
      </nav>
      <div className="ml-auto">
        {userId && <NotificationBell initialUnread={unread} userId={userId} />}
      </div>
    </div>
  </header>
  <main>{children}</main>
</div>
```

---

## 2. `app/(admin)/admin-dashboard-client.tsx` — корневой дашборд

Прочитай файл целиком. Заменить все светлые классы:

**STATUS_BADGE_CLASSES и STATUS_BAR_CLASSES — заменить:**
```typescript
const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft:     'bg-slate-800 text-slate-300 border-slate-700',
  submitted: 'bg-blue-900/50 text-blue-300 border-blue-800',
  approved:  'bg-emerald-900/50 text-emerald-300 border-emerald-800',
  rejected:  'bg-red-900/50 text-red-300 border-red-800',
};

const STATUS_BAR_CLASSES: Record<string, string> = {
  draft:     'bg-slate-600',
  submitted: 'bg-blue-500',
  approved:  'bg-emerald-500',
  rejected:  'bg-red-500',
};
```

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
```

**Заголовок страницы:**
```tsx
<h1 className="text-2xl font-bold text-white">Дашборд</h1>
<p className="mt-1 text-sm text-slate-500">Сводная аналитика платформы</p>
```

**Карточки статистики (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <p className="text-sm text-slate-500">Метрика</p>
  <p className="mt-1 text-3xl font-bold text-white">значение</p>
</div>
```

**Секции (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Заголовок</h2>
  {/* содержимое */}
</div>
```

**Прогресс-бары статусов:**
- Контейнер бара: `className="h-2 rounded-full bg-slate-800"`
- Заполненная часть: `className={`h-2 rounded-full ${STATUS_BAR_CLASSES[s.key]}`}`

**Заменить Badge на span с STATUS_BADGE_CLASSES.**

**Ссылки "Открыть" и кнопки:**
```tsx
<button
  onClick={() => router.push(`/moderation/${project.id}`)}
  className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
>
  Открыть
</button>
```

**Цвета текста:**
- Все `text-gray-*` → `text-slate-*`
- `text-gray-500` → `text-slate-500`
- `text-gray-900` → `text-white`
- Значения данных → `text-slate-300`

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`.

---

## 3. `app/(admin)/admin/dashboard/admin-dashboard-client.tsx` — /admin/dashboard

Аналогично пункту 2 — прочитай файл целиком и примени те же правила.

---

## 4. `app/(admin)/moderation/page.tsx` — очередь на модерацию

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto py-8 max-w-4xl px-4">
```

**Заголовок:**
```tsx
<h1 className="text-2xl font-bold text-white">Модерация проектов</h1>
<p className="text-slate-500 mt-1">Проекты, ожидающие проверки: {items.length}</p>
```

**Пустое состояние (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 py-12 text-center text-slate-600">
  Нет проектов на модерации
</div>
```

**Карточка проекта (вместо Card):**
```tsx
<div key={project.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <div className="flex items-center justify-between mb-3">
    <div>
      <h3 className="text-lg font-semibold text-white">{project.name}</h3>
      <p className="text-sm text-slate-500 mt-1">
        Обновлён: {new Date(project.updated_at).toLocaleDateString('ru-RU')}
      </p>
    </div>
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[project.status] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
      {project.status}
    </span>
  </div>
  <Link href={`/moderation/${project.id}`}>
    <button className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
      Открыть на проверку
    </button>
  </Link>
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Button`.

---

## 5. `app/(admin)/moderation/[id]/page.tsx` — карточка модерации

Прочитай весь файл перед изменением. Он большой — секции: AI-отчёт, красные флаги, анкета, документы, история.

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto py-8 max-w-4xl space-y-6 px-4">
```

**Кнопка «Назад»:**
```tsx
<Link href="/moderation">
  <button className="mb-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
    ← Назад к очереди
  </button>
</Link>
```

**Заголовок проекта:**
```tsx
<h1 className="text-2xl font-bold text-white">{project.name}</h1>
<div className="flex items-center gap-2 mt-1">
  <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGE_CLASSES[project.status] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
    {project.status}
  </span>
  <span className="text-sm text-slate-600">ID: {project.id}</span>
</div>
```

**Все секции (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <h2 className="text-lg font-semibold text-white">Заголовок секции</h2>
  {/* содержимое */}
</div>
```

**AI-анализ — секция:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <div className="flex items-center gap-2">
    <h2 className="text-lg font-semibold text-white">AI-анализ</h2>
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${aiReport.status === 'done' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-800' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
      {aiReport.status}
    </span>
    {aiReport.status === 'done' && typeof report?.ai_score === 'number' && (
      <span className="inline-block rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
        Оценка: {report.ai_score}/10
      </span>
    )}
  </div>
  {/* содержимое AI-отчёта */}
</div>
```

**Красные флаги (severity):**
```typescript
function getRedFlagClass(severity: string) {
  if (severity === 'high') return 'bg-red-900/50 text-red-300 border-red-800';
  if (severity === 'medium') return 'bg-yellow-900/50 text-yellow-300 border-yellow-800';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}
```

**Статус извлечения документов:**
```typescript
function getExtractionClass(status: string | null) {
  if (status === 'done') return 'bg-emerald-900/50 text-emerald-300 border-emerald-800';
  if (status === 'processing') return 'bg-blue-900/50 text-blue-300 border-blue-800';
  if (status === 'error') return 'bg-red-900/50 text-red-300 border-red-800';
  return 'bg-slate-800 text-slate-300 border-slate-700';
}
```

**Заменить getExtractionBadgeVariant на getExtractionClass и использовать span вместо Badge.**

**Анкета — раскрываемые секции:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-3">
  <h2 className="text-lg font-semibold text-white">Анкета</h2>
  {questionnaire.map(section => (
    <div key={section.section} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <h3 className="text-sm font-semibold text-slate-400 mb-2 uppercase tracking-wide">{section.section}</h3>
      <pre className="text-xs text-slate-500 whitespace-pre-wrap overflow-auto">
        {JSON.stringify(section.answers, null, 2)}
      </pre>
    </div>
  ))}
</div>
```

**Документы — список:**
```tsx
<ul className="space-y-2">
  {documents.map(doc => (
    <li key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
      <div>
        <span className="text-slate-300">{doc.file_name}</span>
        <span className="ml-2 text-slate-600 text-xs">{doc.document_type}</span>
      </div>
      <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${getExtractionClass(doc.extraction_status)}`}>
        {doc.extraction_status ?? 'pending'}
      </span>
    </li>
  ))}
</ul>
```

**Все `text-gray-*` → `text-slate-*`, все `font-semibold mb-1` заголовки h3 → `text-sm font-semibold text-slate-400`.**

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Button` (оставь только те Button/Link что реально используются).

---

## 6. `app/(admin)/moderation/[id]/moderation-actions.tsx` — решение по проекту

**Весь компонент (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <h2 className="text-lg font-semibold text-white">Решение по проекту</h2>

  {error && <p className="text-sm text-red-400">{error}</p>}

  <div className="flex gap-3">
    <button
      onClick={handleApprove}
      disabled={loading}
      className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
    >
      Одобрить проект
    </button>
    <button
      onClick={() => { setShowRejectForm(!showRejectForm); setError(null); }}
      disabled={loading}
      className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
    >
      Отклонить проект
    </button>
  </div>

  {showRejectForm && (
    <div className="space-y-3 pt-4 border-t border-slate-800">
      <div>
        <label htmlFor="rejection-reason" className="text-sm text-slate-400">
          Причина отклонения <span className="text-red-400">*</span>
        </label>
        <textarea
          id="rejection-reason"
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Укажите причину отклонения проекта (минимум 10 символов)..."
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500 p-3 text-sm"
          rows={4}
        />
        <p className="text-xs text-slate-600 mt-1">Причина будет видна владельцу проекта</p>
      </div>
      <button
        onClick={handleReject}
        disabled={loading || rejectionReason.trim().length < 10}
        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50"
      >
        Подтвердить отклонение
      </button>
    </div>
  )}
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Textarea`, `Label`, `Button`.

---

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Читать каждый файл полностью перед изменением
- Не трогать логику (fetch, handlers, state) — только UI-классы и структуру JSX
- Не трогать файлы вне списка "Файлы для изменения"

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/` (admin root) — тёмный фон, тёмный хедер, тёмные карточки статистики
4. `/admin/dashboard` — тёмный фон, тёмные карточки
5. `/moderation` — тёмный фон, тёмные карточки проектов
6. `/moderation/[id]` — тёмный фон, тёмные секции AI-отчёта, анкеты, документов
7. Записать в progress.md: `DONE: T91` + что создано/изменено
