# T86 — Красивый Deal Room (страница проекта для инвестора)

## Контекст

В T85 сделали тёмные карточки в каталоге (`/catalog`).
Инвестор кликает «Открыть deal room →» и попадает на страницу `/deals/[id]`.
Сейчас deal room использует светлую тему (белые Card, amber-50 дисклеймеры, серый фон).
Нужно привести deal room к той же тёмной теме, что и каталог.

## Что нужно изменить

### Прочитать перед изменением

Обязательно прочитай ВСЕ файлы в `app/(investor)/deals/[id]/`:
- `page.tsx` — главный файл, его нужно переработать
- `favorite-panel.tsx` — панель избранного (оставить логику, обновить стиль если нужно)
- `view-tracker.tsx` — трекер просмотров (не трогать)
- `yield-calculator.tsx` — калькулятор (оставить логику, обновить стиль если нужно)

### Новый дизайн страницы

**Фон страницы:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
    {/* содержимое */}
  </div>
</div>
```

**Заменить светлые Card на тёмные секции:**

Вместо `<Card>` / `<CardHeader>` / `<CardContent>` использовать:
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Заголовок секции</h2>
  {/* содержимое */}
</section>
```

**Дисклеймеры (тёмный стиль):**

Вместо `bg-amber-50 border-amber-200 text-amber-800` использовать:
```tsx
<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
```

**Бейджи в шапке:**

Вместо светлых `<Badge variant="secondary">` и `<Badge variant="outline">` использовать:
```tsx
<span className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300">Отрасль</span>
<span className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400">Series A</span>
```

**AI Score блок в шапке:**
```tsx
{deal.ai_score !== null && deal.ai_score >= 60 && (
  <div className={`shrink-0 rounded-lg px-4 py-3 text-center ${
    deal.ai_score >= 80
      ? 'bg-emerald-500/10 border border-emerald-500/20'
      : 'bg-yellow-500/10 border border-yellow-500/20'
  }`}>
    <div className={`text-2xl font-bold ${deal.ai_score >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>
      {deal.ai_score}
    </div>
    <div className="text-xs text-slate-500">AI-оценка</div>
  </div>
)}
```

**Название и мета в шапке:**
```tsx
<h1 className="text-3xl font-bold text-white">{deal.name}</h1>
<p className="text-slate-400 mt-1">{deal.city && deal.country ? ... }</p>
```

**Кнопка «Назад»:**
```tsx
<Button asChild variant="ghost" size="sm" className="mb-4 text-slate-400 hover:text-white">
  <Link href="/catalog">← Назад к каталогу</Link>
</Button>
```

**Текст в секциях:**
- Основной текст: `text-slate-300`
- Вспомогательный / labels: `text-slate-500 text-sm`
- Заголовки subsections: `text-slate-400 text-sm font-medium mb-1`

**Карточки основателей:**
```tsx
<div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
  <div className="font-medium text-white text-sm">{founder.name}</div>
  <div className="text-xs text-slate-500">{founder.role}</div>
  <p className="text-sm text-slate-400 mt-2">{founder.bio}</p>
  {founder.linkedin && (
    <a href={founder.linkedin} className="text-xs text-blue-400 hover:text-blue-300 mt-2 block">
      LinkedIn →
    </a>
  )}
</div>
```

**Секция обновлений проекта:**
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Обновления проекта</h2>
  {updates.length === 0 ? (
    <p className="text-slate-500 text-sm">Проект ещё не публиковал обновлений.</p>
  ) : (
    <div className="space-y-4">
      {updates.map((update) => (
        <div key={update.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="font-semibold text-white">{update.title}</div>
          <div className="text-xs text-slate-600 mt-0.5">{new Date(update.created_at).toLocaleString()}</div>
          <p className="text-sm text-slate-400 mt-3 whitespace-pre-wrap">{update.body}</p>
          {update.ai_summary && (
            <div className="mt-3 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm">
              <div className="text-xs font-medium text-slate-400 mb-1">Краткое резюме</div>
              <p className="text-slate-500">{update.ai_summary}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )}
</section>
```

**Секция документов:**
```tsx
<section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Документы проекта</h2>
  <ul className="space-y-2">
    {documents.map((doc) => (
      <li key={doc.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
        <div>
          <div className="text-sm font-medium text-slate-300">{doc.file_name}</div>
          <div className="text-xs text-slate-600 mt-0.5">
            {doc.document_type}{doc.file_size ? ` · ${Math.round(doc.file_size / 1024)} КБ` : ''}
          </div>
        </div>
        <a href={doc.download_url} target="_blank" rel="noopener noreferrer"
           className="ml-4 shrink-0 text-sm text-blue-400 hover:text-blue-300">
          Скачать →
        </a>
      </li>
    ))}
  </ul>
</section>
```

**CTA кнопки:**
```tsx
<div className="flex flex-col sm:flex-row justify-center gap-3 pt-4 pb-8">
  <Button asChild size="lg" className="bg-white text-black hover:bg-slate-200">
    <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
  </Button>
  <Button asChild size="lg" variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
    <Link href={`/portfolio/add?project_id=${deal.id}`}>Зафиксировать инвестицию</Link>
  </Button>
</div>
```

**Метрики (traction) — сетка вместо списка:**
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
  {deal.monthly_users && (
    <div className="rounded-lg bg-slate-950 border border-slate-800 p-3">
      <div className="text-xs text-slate-500">Пользователей / мес</div>
      <div className="text-lg font-semibold text-white mt-1">{deal.monthly_users}</div>
    </div>
  )}
  {/* аналогично для paying_customers, mrr, growth_rate_mom */}
</div>
{/* key_metrics и notable_clients — текстом ниже сетки */}
```

### Что НЕ трогать

- Логику данных в `getDealRoom()` и `getProjectUpdates()` и `getInvestorDocuments()` — только UI
- `view-tracker.tsx` — не трогать совсем
- `favorite-panel.tsx` — логику не трогать, стиль можно привести к тёмному если нужно
- `yield-calculator.tsx` — логику не трогать, стиль можно привести к тёмному если нужно
- API routes — не трогать

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict
- Читать все файлы перед изменением
- Дисклеймеры обязательны (просто стилизовать в тёмном стиле, не удалять)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/deals/[id]` — тёмный фон, тёмные секции, всё читаемо
4. Дисклеймеры на месте (amber тёмный стиль)
5. AI Score отображается в правильном цвете (зелёный/жёлтый)
6. Записать в progress.md: `DONE: T86` + что создано/изменено
