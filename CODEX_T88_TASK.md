# T88 — Тёмная тема: заявки, реферальная программа, форма подачи заявки

## Контекст

В T85–T87 перевели каталог, deal room, портфель и избранное на тёмную тему.
Оставшиеся investor-страницы всё ещё используют светлый стиль:
- `/applications` (ApplicationsClient — Card, Badge, amber-50)
- `/deals/[id]/apply` (ApplyPage + ApplyForm — Card, amber-50)
- `/referral` (ReferralDashboard — Card, Table, amber-50)

Нужно привести их к той же тёмной теме что уже реализована в T85/T86/T87.

## Что нужно изменить

### Обязательно прочитать перед изменением

- `app/(investor)/applications/applications-client.tsx`
- `app/(investor)/deals/[id]/apply/page.tsx`
- `app/(investor)/deals/[id]/apply/apply-form.tsx`
- `app/(investor)/referral/referral-dashboard.tsx`

### Общие правила тёмного стиля (как в T85/T86/T87)

**Фон страниц:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
    {/* содержимое */}
  </div>
</div>
```

**Секции вместо Card:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  {/* содержимое */}
</div>
```

**Дисклеймеры (тёмный стиль):**
```tsx
<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
  <strong className="font-semibold">Важно:</strong> ...
</div>
```

**Текст:**
- Основной: `text-slate-300`
- Вспомогательный / labels: `text-slate-500 text-sm`
- Заголовки h1: `text-3xl font-bold text-white`
- Заголовки h2: `text-xl font-semibold text-white`
- Ссылки: `text-blue-400 hover:text-blue-300`

**Статус-бейджи без shadcn Badge (нативные spans):**
- pending/reviewing: `rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400`
- approved: `rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400`
- rejected: `rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400`
- cancelled/withdrawn: `rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-500`

**Input/Textarea (тёмный стиль):**
```
className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

**Label (тёмный стиль):**
```
className="text-sm text-slate-400"
```

---

### 1. `applications-client.tsx` — новый дизайн

**Обёртка (состояние loading):**
```tsx
<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
  <p className="text-slate-500">Загрузка...</p>
</div>
```

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
    {/* шапка */}
    {/* дисклеймер */}
    {/* список заявок или пустое состояние */}
  </div>
</div>
```

**Шапка:**
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-3xl font-bold text-white">Мои заявки</h1>
  <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
    <Link href="/catalog">← Каталог</Link>
  </Button>
</div>
```

**Пустое состояние:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
  <p className="text-slate-400">
    Заявок пока нет.{' '}
    <Link href="/catalog" className="text-blue-400 hover:text-blue-300">Перейти в каталог</Link>
  </p>
</div>
```

**Карточка заявки:**
```tsx
<div key={app.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
  <div className="flex items-start justify-between gap-4">
    <div>
      <Link href={`/deals/${app.project_id}`}
            className="text-base font-semibold text-white hover:text-slate-300">
        {app.project_name}
      </Link>
      <p className="mt-0.5 text-xs text-slate-600">
        {new Date(app.created_at).toLocaleDateString('ru-RU')}
      </p>
    </div>
    {/* статус-бейдж нативный span по STATUS_CLASSES */}
    <span className={STATUS_CLASSES[app.status]}>{STATUS_LABELS[app.status]}</span>
  </div>
  {app.amount !== null && (
    <p className="text-sm text-slate-300">
      <span className="text-slate-500">Сумма:</span>{' '}
      {app.amount.toLocaleString('ru-RU')} ₽
    </p>
  )}
  {app.message && (
    <p className="line-clamp-3 text-sm text-slate-500">{app.message}</p>
  )}
  {app.status === 'rejected' && app.rejection_reason && (
    <p className="text-sm text-slate-500">
      <span className="text-slate-400">Причина отклонения:</span>{' '}
      {app.rejection_reason}
    </p>
  )}
  {app.status === 'pending' && (
    <Button
      variant="ghost"
      size="sm"
      className="text-red-400 hover:text-red-300 px-0"
      disabled={withdrawingId === app.id}
      onClick={() => handleWithdraw(app.id)}
    >
      {withdrawingId === app.id ? 'Отзываем...' : 'Отозвать заявку'}
    </Button>
  )}
</div>
```

Добавь константу STATUS_CLASSES рядом с STATUS_LABELS (заменяет STATUS_VARIANTS):
```tsx
const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  pending: 'rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400',
  reviewing: 'rounded-md bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400',
  approved: 'rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400',
  rejected: 'rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400',
  cancelled: 'rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-500',
  withdrawn: 'rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-500',
};
```

Удали неиспользуемый импорт `Badge`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `STATUS_VARIANTS`.

---

### 2. `deals/[id]/apply/page.tsx` — обёртка формы

Заменить светлый Card на тёмный контейнер:
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-2xl px-4 py-8">
    <Button asChild variant="ghost" size="sm" className="mb-6 text-slate-400 hover:text-white">
      <Link href={`/deals/${projectId}`}>← Назад к проекту</Link>
    </Button>
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h1 className="text-xl font-semibold text-white mb-5">Оставить заявку</h1>
      <ApplyForm
        projectId={project.id}
        projectName={project.name}
        investmentAsk={s6.investment_ask ?? null}
        minAmount={minAmount}
        maxAmount={maxAmount}
      />
    </div>
  </div>
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

### 3. `deals/[id]/apply/apply-form.tsx` — форма

Обновить только стили внутри формы (логику не трогать):

**Описание проекта:**
```tsx
<p className="mb-4 text-sm text-slate-400">
  Проект: <span className="font-medium text-white">{projectName}</span>
  {investmentAsk && (
    <> · Запрашивает: <span className="font-medium text-white">{investmentAsk}</span></>
  )}
</p>
```

**Label:** добавить `className="text-sm text-slate-400"` к обоим Label

**Input (amount):** добавить className:
```
"border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

**Вспомогательный текст под Input:**
```tsx
<p className="text-xs text-slate-600">Укажите, если хотите обозначить ориентировочную сумму.</p>
```

**Textarea (message):** добавить className:
```
"border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

**Блок ошибки:**
```tsx
<div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
  {error}
</div>
```

**Кнопки:**
```tsx
<div className="flex gap-3 pt-2">
  <Button type="submit" disabled={loading || !message.trim()}
          className="bg-white text-black hover:bg-slate-200">
    {loading ? 'Отправка...' : 'Отправить заявку'}
  </Button>
  <Button type="button" variant="ghost"
          className="text-slate-400 hover:text-white"
          onClick={() => router.back()} disabled={loading}>
    Отмена
  </Button>
</div>
```

---

### 4. `referral/referral-dashboard.tsx` — новый дизайн

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
    {/* содержимое */}
  </div>
</div>
```

**Шапка:**
```tsx
<div>
  <h1 className="text-3xl font-bold text-white">Партнёрская программа</h1>
  <p className="mt-1 text-sm text-slate-500">
    Реферальный код, статистика приглашений и история вознаграждений
  </p>
</div>
```

**Секция реферального кода:**
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <h2 className="text-lg font-semibold text-white">Мой реферальный код</h2>
  <div className="grid gap-4 md:grid-cols-2">
    <div className="space-y-2">
      <div className="text-xs uppercase text-slate-600">Код</div>
      <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-300">
        {code ?? 'Код не создан'}
      </div>
      <Button size="sm" variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={!code}
              onClick={() => void copyText(code ?? '', 'code')}>
        {copied === 'code' ? 'Скопировано' : 'Копировать код'}
      </Button>
    </div>
    <div className="space-y-2">
      <div className="text-xs uppercase text-slate-600">Реферальная ссылка</div>
      <div className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm text-slate-300">
        {inviteLink || 'Ссылка недоступна'}
      </div>
      <Button size="sm" variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={!inviteLink}
              onClick={() => void copyText(inviteLink, 'link')}>
        {copied === 'link' ? 'Скопировано' : 'Копировать ссылку'}
      </Button>
    </div>
  </div>
  {/* дисклеймер тёмный */}
</section>
```

**Статистика — плитки:**
```tsx
<section>
  <h2 className="mb-3 text-xl font-semibold text-white">Статистика рефералов</h2>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {metrics.map((metric) => (
      <div key={metric.label} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="text-2xl font-bold text-white">{metric.value}</div>
        <div className="mt-1 text-xs text-slate-500">{metric.label}</div>
      </div>
    ))}
  </div>
</section>
```

**Секция таблицы рефералов:**
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <h2 className="text-lg font-semibold text-white">Рефералы</h2>
    <div className="flex flex-wrap gap-2">
      {LEVEL_FILTERS.map((filter) => (
        <button
          key={filter.value}
          onClick={() => handleLevelChange(filter.value)}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
            level === filter.value
              ? 'bg-white text-black'
              : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
          }`}
        >
          {filter.label === 'All' ? 'Все' : `Уровень ${filter.label}`}
        </button>
      ))}
    </div>
  </div>

  {/* Нативная таблица вместо shadcn Table */}
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-800">
          <th className="py-2 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
          <th className="py-2 text-left text-xs font-medium text-slate-500 uppercase">Уровень</th>
          <th className="py-2 text-left text-xs font-medium text-slate-500 uppercase">Дата</th>
        </tr>
      </thead>
      <tbody>
        {referrals.length === 0 ? (
          <tr>
            <td colSpan={3} className="py-10 text-center text-slate-600">
              Рефералов пока нет
            </td>
          </tr>
        ) : (
          referrals.map((referral) => (
            <tr key={referral.referee_id} className="border-b border-slate-800/50">
              <td className="py-2.5 text-slate-300">{referral.masked_email}</td>
              <td className="py-2.5 text-slate-400">{referral.level}</td>
              <td className="py-2.5 text-slate-500">{formatDate(referral.joined_at)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>

  <div className="flex items-center justify-between gap-3">
    <div className="text-sm text-slate-500">
      {loading ? 'Загрузка...' : `Показано ${referrals.length} из ${total}`}
    </div>
    <div className="flex gap-2">
      <Button size="sm" variant="outline"
              className="border-slate-700 text-slate-400 hover:bg-slate-800"
              disabled={!canGoBack || loading}
              onClick={() => handlePageChange(Math.max(offset - PAGE_SIZE, 0))}>
        Назад
      </Button>
      <Button size="sm" variant="outline"
              className="border-slate-700 text-slate-400 hover:bg-slate-800"
              disabled={!canGoForward || loading}
              onClick={() => handlePageChange(offset + PAGE_SIZE)}>
        Вперёд
      </Button>
    </div>
  </div>
</section>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` из shadcn.

---

## Что НЕ трогать

- Логику данных (fetch, state, handlers, API calls) — только UI
- API routes — не трогать
- `applications/page.tsx` (серверная обёртка) — не трогать
- `referral/page.tsx` (серверная обёртка) — не трогать
- Импорты логики (useState, useEffect, типы) — не трогать

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких any
- Дисклеймеры обязательны (перевести в тёмный стиль, не удалять)
- Читать все файлы перед изменением

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/applications` — тёмный фон, тёмные карточки, нативные статус-бейджи, дисклеймер тёмный
4. `/deals/[id]/apply` — тёмный контейнер, тёмные поля формы, тёмные кнопки
5. `/referral` — тёмный фон, плитки статистики, нативная тёмная таблица рефералов, дисклеймер тёмный
6. Записать в progress.md: `DONE: T88` + что создано/изменено
