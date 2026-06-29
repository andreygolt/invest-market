# T87 — Тёмная тема: портфель и избранное

## Контекст

В T85 сделали тёмный каталог, в T86 — тёмный deal room.
Страницы `/portfolio`, `/portfolio/add` и `/favorites` всё ещё используют светлую тему
(белые Card, amber-50 дисклеймеры, text-muted-foreground).
Нужно привести их к той же тёмной теме.

## Что нужно изменить

### Прочитать перед изменением

Обязательно прочитай ВСЕ файлы:
- `app/(investor)/portfolio/portfolio-client.tsx`
- `app/(investor)/portfolio/add/page.tsx`
- `app/(investor)/favorites/favorites-client.tsx`

### Общие правила тёмного стиля (как в T85/T86)

**Фон страниц:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
    {/* содержимое */}
  </div>
</div>
```

**Секции вместо Card:**
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Заголовок</h2>
  {/* содержимое */}
</section>
```

**Дисклеймеры (тёмный стиль):**
```tsx
<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
  <strong className="font-semibold">Дисклеймер:</strong> ...
</div>
```

**Текст:**
- Основной: `text-slate-300`
- Вспомогательный / labels: `text-slate-500 text-sm`
- Заголовки h1: `text-3xl font-bold text-white`
- Ссылки: `text-blue-400 hover:text-blue-300`

**Статус-бейджи без shadcn Badge (нативные spans):**
- Активная: `rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400`
- Выход: `rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-xs text-blue-400`
- Списана: `rounded-md bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-xs text-red-400`

**Кнопка «Назад»:**
```tsx
<Button asChild variant="ghost" size="sm" className="mb-4 text-slate-400 hover:text-white">
  <Link href="/catalog">← Назад к каталогу</Link>
</Button>
```

---

### 1. `portfolio-client.tsx` — новый дизайн

**Шапка:**
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-3xl font-bold text-white">Мой портфель</h1>
  <Button asChild className="bg-white text-black hover:bg-slate-200">
    <Link href="/portfolio/add">+ Добавить инвестицию</Link>
  </Button>
</div>
```

**Статистика — карточки-плитки:**
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
    <div className="text-2xl font-bold text-white">{fmt(stats.total_invested)} ₽</div>
    <div className="text-xs text-slate-500 mt-1">Всего инвестировано</div>
  </div>
  {/* аналогично для total_entries и total_active */}
</div>
```

**Пустое состояние:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
  <p className="text-slate-400">В портфеле пока нет записей.</p>
  <p className="text-slate-600 text-sm mt-2">
    Зафиксируйте инвестицию со страницы проекта или нажмите «Добавить инвестицию».
  </p>
</div>
```

**Карточка позиции:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <Link href={`/deals/${entry.project_id}`}
            className="text-base font-semibold text-white hover:text-slate-300">
        {entry.project_name}
      </Link>
      <div className="flex flex-wrap gap-1.5 mt-1">
        {/* статус-бейдж по цвету */}
        {entry.project_industry && (
          <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            {entry.project_industry}
          </span>
        )}
      </div>
    </div>
    <div className="text-right shrink-0">
      <div className="font-bold text-white">{fmt(entry.amount_invested)} ₽</div>
      <div className="text-xs text-slate-500 mt-0.5">
        {INSTRUMENT_LABELS[entry.instrument] ?? entry.instrument}
      </div>
      <div className="text-xs text-slate-600">{formatDate(entry.date_invested)}</div>
    </div>
  </div>
  {/* exit_amount, notes, select, delete button */}
  <div className="mt-3 flex items-center gap-2 flex-wrap">
    <select
      className="text-sm border border-slate-700 rounded px-2 py-1 bg-slate-800 text-slate-300"
      value={entry.deal_status}
      disabled={updatingId === entry.id}
      onChange={(e) => void handleStatusChange(entry.id, e.target.value as PortfolioDealStatus)}
    >
      <option value="active">Активная</option>
      <option value="exited">Выход</option>
      <option value="written_off">Списана</option>
    </select>
    <Button
      variant="ghost"
      size="sm"
      className="text-red-400 hover:text-red-300"
      disabled={deletingId === entry.id}
      onClick={() => void handleDelete(entry.id)}
    >
      {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
    </Button>
  </div>
</div>
```

**Состояния загрузки/ошибки:**
```tsx
// loading:
<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
  <p className="text-slate-500">Загрузка портфеля...</p>
</div>

// error:
<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
  <p className="text-red-400">{error}</p>
</div>
```

---

### 2. `portfolio/add/page.tsx` — форма добавления

```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-lg px-4 py-8">
    <Button asChild variant="ghost" size="sm" className="mb-6 text-slate-400 hover:text-white">
      <Link href="/portfolio">← Назад к портфелю</Link>
    </Button>
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h1 className="text-xl font-semibold text-white mb-5">Зафиксировать инвестицию</h1>
      {/* дисклеймер тёмный */}
      <form className="space-y-4">
        {/* Label: text-sm text-slate-400 */}
        {/* Input: border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 */}
        {/* select: border border-slate-700 rounded px-3 py-2 text-sm bg-slate-800 text-slate-300 */}
        {/* error: text-sm text-red-400 */}
        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}
                  className="flex-1 bg-white text-black hover:bg-slate-200">
            {submitting ? 'Сохранение...' : 'Зафиксировать'}
          </Button>
          <Button type="button" variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                  onClick={() => router.push('/portfolio')}>
            Отмена
          </Button>
        </div>
      </form>
    </div>
  </div>
</div>
```

Для Input использовать className:
```
"border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

---

### 3. `favorites-client.tsx` — новый дизайн

**Общий контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
    ...
  </div>
</div>
```

**Шапка:**
```tsx
<div className="flex flex-wrap items-center justify-between gap-3">
  <h1 className="text-3xl font-bold text-white">Избранное</h1>
  <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
    <Link href="/catalog">← Каталог</Link>
  </Button>
</div>
```

**Фильтр-кнопки:**
```tsx
<div className="flex flex-wrap gap-2">
  {STATUS_FILTERS.map((f) => (
    <button
      key={f.value}
      onClick={() => handleFilter(f.value)}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        filter === f.value
          ? 'bg-white text-black'
          : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
      }`}
    >
      {f.label}
    </button>
  ))}
</div>
```

**Пустое состояние:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
  <p className="text-slate-500">
    {filter === 'all' ? (
      <>Избранных проектов нет. <Link href="/catalog" className="text-blue-400 hover:text-blue-300">Перейти в каталог</Link></>
    ) : 'Нет проектов с таким статусом.'}
  </p>
</div>
```

**Карточка избранного:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <div className="flex items-start justify-between gap-4">
    <div>
      <Link href={`/deals/${fav.project_id}`}
            className="text-base font-semibold text-white hover:text-slate-300">
        {fav.project_name}
      </Link>
      <div className="mt-1 flex flex-wrap gap-2">
        {fav.project_industry && (
          <span className="text-xs text-slate-500">{fav.project_industry}</span>
        )}
        {fav.project_stage && (
          <span className="text-xs text-slate-600">{fav.project_stage}</span>
        )}
        {fav.project_ai_score !== null && (
          <span className={`text-xs ${fav.project_ai_score >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>
            AI {fav.project_ai_score}
          </span>
        )}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {fav.personal_status && (
        <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          {STATUS_LABELS[fav.personal_status]}
        </span>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="text-slate-500 hover:text-red-400"
        onClick={() => handleRemove(fav.id)}
      >
        Удалить
      </Button>
    </div>
  </div>
  {fav.notes && (
    <p className="mt-3 text-sm text-slate-500 line-clamp-3">{fav.notes}</p>
  )}
</div>
```

**Состояние загрузки:**
```tsx
<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
  <p className="text-slate-500">Загрузка...</p>
</div>
```

---

## Что НЕ трогать

- Логику данных (fetch, loadPortfolio, handleDelete, handleStatusChange, handleRemove и пр.) — только UI
- API routes — не трогать
- `portfolio/page.tsx` (серверная обёртка) — не трогать
- `favorites/page.tsx` — не трогать
- Импорты логики (useState, useEffect, типы) — не трогать

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict
- Дисклеймеры обязательны (стилизовать в тёмном стиле, не удалять)
- Читать все файлы перед изменением

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/portfolio` — тёмный фон, тёмные карточки, дисклеймер в amber-тёмном стиле
4. `/portfolio/add` — тёмная форма, тёмные inputs
5. `/favorites` — тёмный фон, тёмные карточки, фильтры в тёмном стиле
6. Записать в progress.md: `DONE: T87` + что создано/изменено
