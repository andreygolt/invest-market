# T90 — Тёмная тема: кабинет проекта

## Контекст

В T85–T89 перевели на тёмную тему все страницы инвестора (`/catalog`, `/deals`, `/portfolio`, `/favorites`, `/applications`, `/referral`, `/dashboard`, `/notifications`, `/profile`).

Кабинет проекта (`/project`, `/documents`, `/submit`, `/updates`, `/commercial-terms`) всё ещё использует светлую тему (bg-gray-50, bg-white, Card компоненты). Нужно привести их к той же тёмной теме.

## Файлы для изменения

### Обязательно прочитать перед изменением:
- `app/(project)/project/page.tsx`
- `app/(project)/project/project-dashboard-client.tsx`
- `app/(project)/documents/page.tsx`
- `app/(project)/submit/page.tsx`
- `app/(project)/updates/updates-client.tsx`
- `app/(project)/commercial-terms/page.tsx`

### НЕ трогать:
- `app/(project)/questionnaire/` — анкета, не трогать
- `app/(project)/questionnaire/sections58/` — не трогать
- `app/(project)/layout.tsx` — не трогать
- `app/(project)/dashboard/` — не трогать (там другой компонент для dashboard)
- Все API routes — не трогать
- Логику данных, fetch, handlers, state — только UI

---

## Общие правила тёмного стиля (как в T85–T89)

**Фон страниц:**
```tsx
<main className="min-h-screen bg-[#0a0a0a] px-4 py-10">
  <div className="mx-auto max-w-3xl space-y-6">
    {/* содержимое */}
  </div>
</main>
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
- Заголовки h1: `text-2xl font-bold text-white` или `text-3xl font-bold text-white`
- Заголовки h2: `text-lg font-semibold text-white`

**Кнопка основная:**
```tsx
<button className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-slate-200 disabled:opacity-50">
```

**Кнопка outline:**
```tsx
<button className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800">
```

**Input/Textarea тёмный стиль:**
```
className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
```

**Статус-бейджи (тёмные версии):**
```typescript
const STATUS_META = {
  draft:        { label: 'Черновик',        className: 'bg-slate-800 text-slate-300 border-slate-700' },
  submitted:    { label: 'На модерации',    className: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  under_review: { label: 'На проверке',     className: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  approved:     { label: 'Одобрен',         className: 'bg-emerald-900/50 text-emerald-300 border-emerald-800' },
  rejected:     { label: 'Отклонён',        className: 'bg-red-900/50 text-red-300 border-red-800' },
};
```

---

## 1. `app/(project)/project/page.tsx` — создание проекта (форма)

Страница показывает форму создания проекта если проект не существует.

**Форма создания (вместо Card на bg-gray-50):**
```tsx
<main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-4">
  <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8">
    <h1 className="mb-1 text-2xl font-bold text-white">Создать проект</h1>
    <p className="mb-6 text-sm text-slate-500">Введите название проекта, чтобы открыть кабинет.</p>
    <form action={createProject} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-sm text-slate-400">Название проекта</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="Например: FinTech Startup"
          className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        />
      </div>
      <Button type="submit" className="w-full bg-white text-black hover:bg-slate-200">
        Создать
      </Button>
    </form>
  </div>
</main>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

## 2. `app/(project)/project/project-dashboard-client.tsx` — кабинет проекта

Это главный файл кабинета. Полностью заменить светлый дизайн на тёмный.

**STATUS_META — заменить светлые цвета на тёмные:**
```typescript
const STATUS_META: Record<ProjectStatus, { label: string; className: string }> = {
  draft:        { label: 'Черновик',     className: 'bg-slate-800 text-slate-300 border-slate-700' },
  submitted:    { label: 'На проверке', className: 'bg-blue-900/50 text-blue-300 border-blue-800' },
  under_review: { label: 'На проверке', className: 'bg-yellow-900/50 text-yellow-300 border-yellow-800' },
  approved:     { label: 'Одобрен',     className: 'bg-emerald-900/50 text-emerald-300 border-emerald-800' },
  rejected:     { label: 'Отклонён',    className: 'bg-red-900/50 text-red-300 border-red-800' },
};
```

**Основной контейнер:**
```tsx
<main className="min-h-screen bg-[#0a0a0a] px-4 py-10">
  <div className="mx-auto max-w-5xl space-y-6">
    {/* содержимое */}
  </div>
</main>
```

**Шапка с названием и статусом (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <div className="mb-3">
    <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${status.className}`}>
      {status.label}
    </span>
  </div>
  <h1 className="text-3xl font-semibold text-white">{project.name}</h1>
</div>
```

**Блок «Одобрен» (вместо bg-green-50):**
```tsx
<div className="rounded-md border border-emerald-800 bg-emerald-900/30 p-4 text-sm text-emerald-300">
  Ваш проект одобрен и виден инвесторам.
</div>
```

**Блок «Отклонён» (вместо bg-red-50):**
```tsx
<div className="space-y-2 rounded-xl border border-red-800 bg-red-900/20 p-5">
  <p className="font-semibold text-red-400">Проект отклонён</p>
  {project.rejection_reason && (
    <p className="text-sm text-red-300">
      <span className="font-medium">Причина: </span>
      {project.rejection_reason}
    </p>
  )}
  <p className="text-sm text-slate-400">
    Исправьте анкету и документы, затем отправьте проект на повторную проверку.
  </p>
  <ResubmitButton />
</div>
```

**ResubmitButton — тёмный стиль:**
```tsx
<Button onClick={handleResubmit} disabled={loading} size="sm"
        className="bg-red-600 text-white hover:bg-red-700">
  {loading ? 'Отправка...' : 'Отправить на повторную проверку'}
</Button>
```

**Статистика «Интерес инвесторов» (вместо Card + border p-3):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="mb-4 text-xl font-semibold text-white">Интерес инвесторов</h2>
  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-center">
      <div className="text-2xl font-semibold text-white">{stats.views_count}</div>
      <div className="mt-1 text-slate-500">Просмотров</div>
    </div>
    {/* аналогично для остальных плиток */}
  </div>
</div>
```

**Чеклист шагов (вместо Card + bordered li):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="mb-1 text-xl font-semibold text-white">Чеклист шагов</h2>
  <p className="mb-4 text-sm text-slate-500">Выполнено {completedCount} из 5</p>
  <ul className="space-y-3">
    {steps.map(step => (
      <li key={step.label}
          className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 p-3">
        <div className="flex items-center gap-3">
          <span className={step.done ? 'font-semibold text-emerald-400' : 'text-slate-600'}>
            {step.done ? '✓' : '○'}
          </span>
          <span className={`text-sm font-medium ${step.done ? 'text-slate-300' : 'text-slate-400'}`}>
            {step.label}
          </span>
        </div>
        {!step.done && (
          <Button asChild size="sm" variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800">
            <Link href={step.href}>{step.action}</Link>
          </Button>
        )}
      </li>
    ))}
  </ul>
</div>
```

**Плитки быстрых действий (вместо Card hover:bg-gray-50):**
```tsx
<div className="grid gap-4 sm:grid-cols-2">
  {actions.filter(action => action.show).map(action => (
    <Link key={action.href} href={action.href}>
      <div className="h-full rounded-xl border border-slate-800 bg-slate-900 px-5 py-6
                      transition-colors hover:border-slate-700 hover:bg-slate-800">
        <div className="text-sm font-semibold text-slate-300">{action.label}</div>
      </div>
    </Link>
  ))}
</div>
```

**История статусов (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <h2 className="mb-4 text-sm font-semibold text-white">История изменений статуса</h2>
  <StatusTimeline log={statusLog} />
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

## 3. `app/(project)/documents/page.tsx` — загрузка документов

**Основной контейнер:**
```tsx
<main className="min-h-screen bg-[#0a0a0a] py-10 px-4">
  <div className="max-w-2xl mx-auto">
    {/* содержимое */}
  </div>
</main>
```

**Шапка:**
```tsx
<div className="mb-6">
  <h1 className="text-2xl font-semibold text-white">Документы проекта</h1>
  <p className="text-sm text-slate-500 mt-1">
    Загрузите необходимые документы для андеррайтинга. Максимальный размер файла — 20 МБ.
  </p>
</div>
```

**Loading state:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
  <p className="text-slate-500">Загрузка...</p>
</div>
```

**Карточка типа документа (вместо bg-white rounded-lg shadow):**
```tsx
<div key={dt.value} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
  <div className="flex items-center justify-between mb-3">
    <div>
      <span className="font-medium text-sm text-slate-300">{dt.label}</span>
      {dt.required && <span className="ml-2 text-xs text-red-400">обязательно</span>}
    </div>
    <button
      onClick={() => triggerUpload(dt.value)}
      disabled={uploading === dt.value}
      className="text-sm text-slate-400 hover:text-white disabled:opacity-50"
    >
      {uploading === dt.value ? 'Загружаем...' : '+ Загрузить'}
    </button>
  </div>
  {docs.length === 0 ? (
    <p className="text-xs text-slate-600">Файлы не загружены</p>
  ) : (
    <ul className="space-y-1">
      {docs.map(doc => (
        <li key={doc.id} className="flex items-center justify-between text-sm">
          <span className="text-slate-400 truncate max-w-xs">{doc.filename}</span>
          <button
            onClick={() => deleteDoc(doc.id)}
            className="text-red-400 hover:text-red-300 text-xs ml-2 shrink-0"
          >
            Удалить
          </button>
        </li>
      ))}
    </ul>
  )}
</div>
```

**Дисклеймер (вместо bg-yellow-50 border-yellow-200):**
```tsx
<div className="mt-8 p-4 rounded-xl border border-slate-800 bg-slate-900">
  <p className="text-xs text-slate-500">
    Все загруженные документы будут использованы исключительно для AI-анализа и проверки модератором.
    Платформа не передаёт документы третьим лицам без вашего согласия.
  </p>
</div>
```

**Ошибка:**
```tsx
{error && <p className="text-red-400 text-sm mb-4">{error}</p>}
```

---

## 4. `app/(project)/submit/page.tsx` — видео и отправка на модерацию

**Основной контейнер:**
```tsx
<main className="min-h-screen bg-[#0a0a0a] py-10 px-4">
  <div className="max-w-2xl mx-auto space-y-6">
    {/* содержимое */}
  </div>
</main>
```

**STATUS_COLORS — заменить на тёмные:**
```typescript
const STATUS_COLORS: Record<string, string> = {
  draft:        'bg-slate-800 text-slate-300',
  submitted:    'bg-blue-900/50 text-blue-300',
  under_review: 'bg-yellow-900/50 text-yellow-300',
  approved:     'bg-emerald-900/50 text-emerald-300',
  rejected:     'bg-red-900/50 text-red-300',
};
```

**Loading/Not found states:**
```tsx
<div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
  <p className="text-slate-500">Загрузка...</p>
</div>
```

**Секция «Статус заявки» (вместо bg-white rounded-lg shadow):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h1 className="text-xl font-semibold text-white mb-4">Статус заявки</h1>
  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
    {statusLabel}
  </span>
  {!isDraft && (
    <p className="text-sm text-slate-500 mt-3">
      Ваш проект передан на проверку. Мы свяжемся с вами по результатам модерации.
    </p>
  )}
</div>
```

**Секция «Видео-питч» (вместо bg-white rounded-lg shadow):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-medium text-white mb-2">Видео-питч</h2>
  <p className="text-sm text-slate-500 mb-4">
    Короткое вертикальное видео до 2 минут (формат MP4 или MOV, до 200 МБ).
    Расскажите о проекте своими словами.
  </p>
  {/* если видео загружено */}
  <div className="flex items-center gap-3 p-3 rounded-xl border border-emerald-800 bg-emerald-900/20">
    <svg className="w-5 h-5 text-emerald-400 shrink-0" .../>
    <span className="text-sm text-emerald-300 flex-1 truncate">Видео загружено</span>
    {isDraft && (
      <button onClick={deleteVideo} className="text-red-400 text-xs hover:text-red-300 shrink-0">
        Удалить
      </button>
    )}
  </div>
  {/* если видео не загружено */}
  <button
    onClick={() => fileInputRef.current?.click()}
    disabled={uploading || !isDraft}
    className="w-full text-center px-4 py-4 border-2 border-dashed border-slate-700 rounded-xl
               text-sm text-slate-500 hover:border-slate-600 hover:text-slate-400 disabled:opacity-50"
  >
    {uploading ? 'Загружаем...' : '+ Загрузить видео-питч'}
  </button>
</div>
```

**Сообщения:**
```tsx
{error && <p className="text-red-400 text-sm">{error}</p>}
{success && <p className="text-emerald-400 text-sm">{success}</p>}
```

**Секция «Отправить на модерацию» (вместо bg-white rounded-lg shadow):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-medium text-white mb-2">Отправить на модерацию</h2>
  <p className="text-sm text-slate-500 mb-4">
    После отправки редактирование анкеты будет недоступно. Убедитесь, что все данные заполнены корректно.
  </p>
  <p className="text-xs text-slate-600 rounded-xl border border-slate-800 bg-slate-950 p-3 mb-4">
    Платформа не принимает денежные средства. Все переговоры и оформление сделки происходят напрямую между проектом и инвестором вне платформы.
  </p>
  <button
    onClick={handleSubmit}
    disabled={submitting}
    className="w-full py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-slate-200 disabled:opacity-50"
  >
    {submitting ? 'Отправляем...' : 'Отправить проект на модерацию'}
  </button>
</div>
```

---

## 5. `app/(project)/updates/updates-client.tsx` — обновления проекта

**Основной контейнер:**
```tsx
<main className="min-h-screen bg-[#0a0a0a] px-4 py-10">
  <div className="mx-auto max-w-3xl space-y-6">
    <h1 className="text-2xl font-bold text-white">Обновления проекта</h1>
    {/* содержимое */}
  </div>
</main>
```

**Форма публикации (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Опубликовать обновление</h2>
  <form onSubmit={publishUpdate} className="space-y-4">
    <Input
      value={title}
      maxLength={200}
      onChange={(event) => setTitle(event.target.value)}
      placeholder="Краткий заголовок обновления"
      className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
    />
    <Textarea
      value={body}
      maxLength={5000}
      rows={6}
      onChange={(event) => setBody(event.target.value)}
      placeholder="Подробное описание..."
      className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
    />
    {error && <p className="text-sm text-red-400">{error}</p>}
    <Button type="submit" disabled={submitting} className="bg-white text-black hover:bg-slate-200">
      {submitting ? 'Публикуем...' : 'Опубликовать'}
    </Button>
  </form>
</div>
```

**Loading state:**
```tsx
<p className="text-sm text-slate-500">Загрузка...</p>
```

**Пустое состояние (вместо Card с text-gray-500):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 py-8 text-center text-sm text-slate-600">
  Обновлений ещё нет. Опубликуйте первое!
</div>
```

**Карточка обновления (вместо Card):**
```tsx
<div key={update.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
  <div className="flex items-start justify-between gap-4 mb-3">
    <div>
      <h3 className="text-lg font-semibold text-white">{update.title}</h3>
      <p className="mt-1 text-xs text-slate-600">
        {new Date(update.created_at).toLocaleString()}
      </p>
    </div>
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="border-red-800 text-red-400 hover:bg-red-900/20 shrink-0"
      onClick={() => void deleteUpdate(update.id)}
    >
      Удалить
    </Button>
  </div>
  <p className="whitespace-pre-wrap text-sm text-slate-300">{update.body}</p>
  {update.ai_summary !== null ? (
    <p className="mt-3 text-sm text-slate-500">
      <span className="font-medium text-slate-400">AI-резюме:</span> {update.ai_summary}
    </p>
  ) : (
    <p className="mt-3 text-sm text-slate-600">Резюме генерируется...</p>
  )}
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

## 6. `app/(project)/commercial-terms/page.tsx` — коммерческие условия

Прочитай весь файл перед изменением.

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl px-4 py-8">
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-white">Мои коммерческие условия</h1>
    </div>
    {/* содержимое */}
  </div>
</div>
```

**Состояние "условия не установлены" (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 py-10 px-6 text-slate-500">
  Условия сотрудничества ещё не установлены. Обратитесь к администратору платформы.
</div>
```

**Секции с данными условий (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  {/* содержимое */}
</div>
```

Замени все `text-gray-*` на `text-slate-*` аналоги:
- `text-gray-600` → `text-slate-400`
- `text-gray-500` → `text-slate-500`
- Заголовки → `text-white`
- Значения данных → `text-slate-300`

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Читать все файлы перед изменением
- Не трогать логику (fetch, handlers, state) — только UI-классы и структуру JSX
- Не трогать questionnaire страницы

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/project` — тёмный фон, тёмные секции, тёмный чеклист, тёмные плитки статистики
4. `/documents` — тёмный фон, тёмные карточки документов
5. `/submit` — тёмный фон, тёмные секции, тёмные статус-бейджи
6. `/updates` — тёмный фон, тёмная форма, тёмные карточки обновлений
7. `/commercial-terms` — тёмный фон, тёмные секции
8. Записать в progress.md: `DONE: T90` + что создано/изменено
