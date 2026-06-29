# T89 — Тёмная тема: dashboard инвестора, уведомления, профиль

## Контекст

В T85–T88 перевели на тёмную тему все investor-страницы кроме трёх:
- `/dashboard` (InvestorDashboardView — Card, muted-foreground, светлый фон)
- `/notifications` (notifications-page-client.tsx — bg-white, серый текст)
- `/profile` (profile-client.tsx и notification-prefs-section.tsx — Card, серый текст)

Нужно привести их к той же тёмной теме (bg-[#0a0a0a], slate-800/900 секции, white/slate-300 текст).

## Что нужно изменить

### Обязательно прочитать перед изменением

- `app/dashboard/page.tsx`
- `app/notifications/page.tsx`
- `app/notifications/notifications-page-client.tsx`
- `app/profile/page.tsx`
- `app/profile/profile-client.tsx`
- `app/profile/notification-prefs-section.tsx`

### Общие правила тёмного стиля (как в T85–T88)

**Фон страниц:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
    {/* содержимое */}
  </div>
</div>
```

**Секции вместо Card:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Заголовок</h2>
  {/* содержимое */}
</div>
```

**Текст:**
- Основной: `text-slate-300`
- Вспомогательный / labels: `text-slate-500 text-sm`
- Заголовки h1: `text-3xl font-bold text-white`
- Заголовки h2: `text-xl font-semibold text-white`

**Input/Label (тёмный стиль):**
```
Input: "border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
Label: className="text-sm text-slate-400"
```

**Кнопка основная:**
```tsx
<Button className="bg-white text-black hover:bg-slate-200">...</Button>
```

**Кнопка outline:**
```tsx
<Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800">...</Button>
```

---

### 1. `app/dashboard/page.tsx` — InvestorDashboardView

Функция `InvestorDashboardView` — заменить светлый дизайн на тёмный.

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-5xl px-4 py-8 space-y-8">
    {/* шапка */}
    {/* секции портфеля, заявок, сделок */}
  </div>
</div>
```

**Шапка:**
```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-3xl font-bold text-white">Кабинет инвестора</h1>
    <p className="mt-1 text-sm text-slate-500">
      Сводка по портфелю, заявкам и доступным сделкам
    </p>
  </div>
  <div className="flex flex-wrap gap-2">
    <Button asChild size="sm" className="bg-white text-black hover:bg-slate-200">
      <Link href="/catalog">Смотреть каталог</Link>
    </Button>
    <Button asChild size="sm" variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800">
      <Link href="/portfolio">Мой портфель</Link>
    </Button>
    <Button asChild size="sm" variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800">
      <Link href="/applications">Мои заявки</Link>
    </Button>
    <Button asChild size="sm" variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800">
      <Link href="/favorites">Избранное</Link>
    </Button>
    <SignOutButton />
  </div>
</div>
```

**Пустые состояния секций:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-600">
  Портфель пуст
</div>
```

**Плитки статистики портфеля (вместо Card):**
```tsx
<div className="grid gap-4 md:grid-cols-3">
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
    <div className="text-xs text-slate-500 mb-1">Сумма вложений</div>
    <div className="text-2xl font-bold text-white">{formatRub(dashboard.portfolio.total_invested)}</div>
  </div>
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
    <div className="text-xs text-slate-500 mb-1">Активные позиции</div>
    <div className="text-2xl font-bold text-white">{dashboard.portfolio.active_count}</div>
  </div>
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
    <div className="text-xs text-slate-500 mb-1">Завершённые выходы</div>
    <div className="text-2xl font-bold text-white">{dashboard.portfolio.exited_count}</div>
  </div>
</div>
```

**Плитки статистики заявок (аналогично):**
```tsx
<div className="grid gap-4 md:grid-cols-3">
  <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
    <div className="text-xs text-slate-500 mb-1">Всего</div>
    <div className="text-2xl font-bold text-white">{dashboard.applications.total}</div>
  </div>
  {/* аналогично для pending, approved */}
</div>
```

**Карточки последних сделок (вместо Card):**
```tsx
<div className="grid gap-4 md:grid-cols-2">
  {dashboard.recent_deals.map((deal) => (
    <div key={deal.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
      <div>
        <div className="font-semibold text-white">{deal.name}</div>
        <div className="text-sm text-slate-500 mt-0.5">{deal.industry ?? 'Без отрасли'}</div>
      </div>
      <div className="text-sm text-slate-500">
        {deal.investment_stage ?? 'Стадия не указана'}
      </div>
      <Button asChild size="sm" variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800">
        <Link href={`/deals/${deal.id}`}>Открыть deal room</Link>
      </Button>
    </div>
  ))}
</div>
```

**Заголовки секций:**
```tsx
<h2 className="mb-3 text-xl font-semibold text-white">Мой портфель</h2>
```

Для секции «Последние сделки» — добавь счётчик избранного рядом:
```tsx
<div className="flex items-center justify-between mb-3">
  <h2 className="text-xl font-semibold text-white">Последние сделки</h2>
  <span className="text-sm text-slate-500">Избранное: {dashboard.favorites_count}</span>
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

### 2. `app/notifications/page.tsx` — обёртка

Заменить светлый контейнер:
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="mx-auto max-w-2xl px-4 py-8">
    <h1 className="mb-6 text-3xl font-bold text-white">Уведомления</h1>
    <NotificationsPageClient />
  </div>
</div>
```

---

### 3. `app/notifications/notifications-page-client.tsx` — список уведомлений

**Фильтр-кнопки** (вместо shadcn Button с variant):
```tsx
<div className="flex flex-wrap gap-2">
  <button
    onClick={() => { if (unreadOnly) toggleUnreadOnly(); }}
    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
      !unreadOnly
        ? 'bg-white text-black'
        : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
    }`}
  >
    Все
  </button>
  <button
    onClick={() => { if (!unreadOnly) toggleUnreadOnly(); }}
    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
      unreadOnly
        ? 'bg-white text-black'
        : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
    }`}
  >
    Непрочитанные
  </button>
</div>
```

**Кнопка «Прочитать все»:**
```tsx
<Button variant="outline" size="sm"
        className="border-slate-700 text-slate-400 hover:bg-slate-800"
        onClick={() => void markAllAsRead()}>
  Прочитать все
</Button>
```

**Состояния loading/empty:**
```tsx
<div className="py-8 text-center text-sm text-slate-600">Загрузка...</div>
<div className="py-8 text-center text-sm text-slate-600">Нет уведомлений</div>
```

**Карточка уведомления:**
```tsx
<div
  className={`rounded-xl border bg-slate-900 p-4 ${
    notification.is_read
      ? 'border-slate-800'
      : 'border-l-4 border-l-blue-500 border-slate-800'
  }`}
>
  <div className="flex items-start justify-between gap-3">
    <div className="space-y-1">
      <div className={`text-sm ${notification.is_read ? 'font-medium text-slate-300' : 'font-semibold text-white'}`}>
        {notification.title}
      </div>
      <div className="text-sm leading-5 text-slate-500">{notification.body}</div>
      <div className="text-xs text-slate-700">
        {new Date(notification.created_at).toLocaleString('ru-RU')}
      </div>
    </div>
    {!notification.is_read && (
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 px-2 text-slate-500 hover:text-slate-300"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void markAsRead(notification.id);
        }}
      >
        ✕
      </Button>
    )}
  </div>
</div>
```

**Пагинация:**
```tsx
<div className="flex items-center justify-center gap-2 pt-2">
  <Button variant="outline" size="sm"
          className="border-slate-700 text-slate-400 hover:bg-slate-800"
          disabled={page <= 1 || loading}
          onClick={() => setPage((p) => p - 1)}>
    ← Назад
  </Button>
  <span className="text-sm text-slate-500">{page} / {totalPages}</span>
  <Button variant="outline" size="sm"
          className="border-slate-700 text-slate-400 hover:bg-slate-800"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((p) => p + 1)}>
    Вперёд →
  </Button>
</div>
```

---

### 4. `app/profile/profile-client.tsx` — форма профиля

**Основной контейнер:**
```tsx
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
    <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
      <Link href={getBackHref(profile.role)}>← Назад</Link>
    </Button>
    <h1 className="text-3xl font-bold text-white">Профиль</h1>
    {/* секции */}
  </div>
</div>
```

**Секция «Информация об аккаунте» (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6 space-y-4">
  <h2 className="text-lg font-semibold text-white">Информация об аккаунте</h2>
  <div className="space-y-3 text-sm">
    <div className="grid gap-1">
      <span className="text-slate-500">Email</span>
      <span className="font-medium text-slate-300">{email}</span>
    </div>
    <div className="grid gap-1">
      <span className="text-slate-500">Роль</span>
      <span className="font-medium text-slate-300">{ROLE_LABELS[profile.role]}</span>
    </div>
    <div className="grid gap-1">
      <span className="text-slate-500">Дата регистрации</span>
      <span className="font-medium text-slate-300">{registrationDate}</span>
    </div>
  </div>
</div>
```

**Секция «Редактирование имени» (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Редактирование имени</h2>
  <form className="space-y-4" onSubmit={saveName}>
    <div className="space-y-2">
      <Label htmlFor="full_name" className="text-sm text-slate-400">Полное имя</Label>
      <Input
        id="full_name"
        value={fullName}
        maxLength={100}
        className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        onChange={(event) => setFullName(event.target.value)}
      />
    </div>
    {nameMessage ? <p className="text-sm text-emerald-400">{nameMessage}</p> : null}
    {nameError ? <p className="text-sm text-red-400">{nameError}</p> : null}
    <Button type="submit" disabled={savingName}
            className="bg-white text-black hover:bg-slate-200">
      {savingName ? 'Сохранение...' : 'Сохранить'}
    </Button>
  </form>
</div>
```

**Секция «Смена пароля» (вместо Card):**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="text-lg font-semibold text-white mb-4">Смена пароля</h2>
  <form className="space-y-4" onSubmit={changePassword}>
    <div className="space-y-2">
      <Label htmlFor="new_password" className="text-sm text-slate-400">Новый пароль</Label>
      <Input
        id="new_password"
        type="password"
        minLength={8}
        value={newPassword}
        className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        onChange={(event) => setNewPassword(event.target.value)}
      />
    </div>
    <div className="space-y-2">
      <Label htmlFor="repeat_password" className="text-sm text-slate-400">Повторите пароль</Label>
      <Input
        id="repeat_password"
        type="password"
        minLength={8}
        value={repeatPassword}
        className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        onChange={(event) => setRepeatPassword(event.target.value)}
      />
    </div>
    {passwordMessage ? <p className="text-sm text-emerald-400">{passwordMessage}</p> : null}
    {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
    <Button type="submit" disabled={savingPassword}
            className="bg-white text-black hover:bg-slate-200">
      {savingPassword ? 'Изменение...' : 'Изменить пароль'}
    </Button>
  </form>
</div>
```

Удали неиспользуемые импорты `Card`, `CardContent`, `CardHeader`, `CardTitle`.

---

### 5. `app/profile/notification-prefs-section.tsx`

**Тёмный контейнер:**
```tsx
<div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
  <h2 className="mb-4 text-lg font-semibold text-white">Уведомления по email</h2>
  <div className="flex items-center justify-between">
    <div>
      <p className="text-sm text-slate-300">Email-уведомления</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Получать письма при изменении статусов и важных событиях
      </p>
    </div>
    <button
      onClick={handleToggle}
      disabled={saving}
      role="switch"
      aria-checked={emailEnabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
        emailEnabled ? 'bg-white' : 'bg-slate-700'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform ${
          emailEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-slate-400'
        }`}
      />
    </button>
  </div>
  {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
  {success && (
    <p className="mt-3 text-xs text-emerald-400">
      {emailEnabled ? 'Email-уведомления включены' : 'Email-уведомления отключены'}
    </p>
  )}
</div>
```

---

## Что НЕ трогать

- Логику данных (getInvestorDashboard, getProjectDashboard) — только InvestorDashboardView
- `ProjectDashboardClient` и `app/(project)/dashboard/` — не трогать
- API routes — не трогать
- Логику (fetch, handlers, state) в клиентских компонентах — только UI
- `app/profile/page.tsx` (серверная обёртка) — не трогать

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких any
- Читать все файлы перед изменением

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/dashboard` — тёмный фон, тёмные плитки статистики, тёмные карточки сделок
4. `/notifications` — тёмный фон, тёмные карточки уведомлений, тёмные фильтры
5. `/profile` — тёмный фон, тёмные секции, тёмные inputs, тёмный тоггл
6. Записать в progress.md: `DONE: T89` + что создано/изменено
