# T101 — Навигация: полный навбар инвестора + реорганизация навбара администратора

## Контекст

T100 завершил перевод всего приложения на светлую тему.

Текущий навбар инвестора содержит только 3 ссылки: Каталог, Партнёрская программа, Профиль.
Однако инвестор имеет ещё 4 ключевых раздела — Dashboard, Портфель, Избранное, Заявки — которые
недоступны из навбара и требуют прямого ввода URL. Это критический UX-пробел.

Навбар администратора содержит 14 ссылок в одну горизонтальную строку, что:
- вызывает горизонтальную прокрутку на экранах < 1400px
- не группирует ссылки по назначению
- сложно воспринимается визуально

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

- `app/(investor)/layout.tsx`
- `app/(admin)/layout.tsx`

---

## Часть 1: Навбар инвестора

### `app/(investor)/layout.tsx`

Добавить недостающие разделы в `<nav>`:

**Полный список ссылок (в таком порядке):**

```tsx
<nav className="flex gap-4 text-sm flex-wrap">
  <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 transition-colors">
    Главная
  </Link>
  <Link href="/catalog" className="text-slate-600 hover:text-slate-900 transition-colors">
    Каталог
  </Link>
  <Link href="/portfolio" className="text-slate-600 hover:text-slate-900 transition-colors">
    Портфель
  </Link>
  <Link href="/favorites" className="text-slate-600 hover:text-slate-900 transition-colors">
    Избранное
  </Link>
  <Link href="/applications" className="text-slate-600 hover:text-slate-900 transition-colors">
    Заявки
  </Link>
  <Link href="/referral" className="text-slate-600 hover:text-slate-900 transition-colors">
    Партнёрская программа
  </Link>
  <Link href="/notifications" className="text-slate-600 hover:text-slate-900 transition-colors">
    Уведомления
  </Link>
  <Link href="/profile" className="text-slate-600 hover:text-slate-900 transition-colors">
    Профиль
  </Link>
</nav>
```

Добавить `flex-wrap` к `<nav>` чтобы ссылки переносились на меньших экранах.

Логотип "Invest Market" должен быть ссылкой на `/dashboard`:
```tsx
<Link href="/dashboard" className="font-semibold text-slate-900 shrink-0 hover:text-slate-700 transition-colors">
  Invest Market
</Link>
```

Notification Bell оставить как есть (через `ml-auto`).

---

## Часть 2: Навбар администратора

### `app/(admin)/layout.tsx`

Реорганизовать 14 ссылок в два логических ряда.

**Ряд 1 — основные инструменты:**
Dashboard, Модерация, Заявки, Пользователи, Инвайты, Настройки, Профиль

**Ряд 2 — аналитика и отчёты:**
Аналитика, Воронка, Инвесторы, Экспорт, Журнал, Объявления, Реферальные вознаграждения, Поиск

Пример структуры:

```tsx
<header className="bg-white border-b border-slate-200">
  <div className="container mx-auto px-4 py-2">
    {/* Верхняя строка: лого + основная навигация + bell */}
    <div className="flex items-center gap-4 py-1">
      <span className="text-slate-900 font-semibold shrink-0">Invest Market — Администратор</span>
      <nav className="flex gap-3 text-sm flex-wrap">
        <Link href="/admin/dashboard" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Dashboard</Link>
        <Link href="/moderation" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Модерация</Link>
        <Link href="/admin/applications" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Заявки</Link>
        <Link href="/users" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Пользователи</Link>
        <Link href="/admin/invites" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Инвайты</Link>
        <Link href="/settings" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Настройки</Link>
        <Link href="/profile" className="text-slate-700 hover:text-slate-900 font-medium transition-colors">Профиль</Link>
      </nav>
      <div className="ml-auto shrink-0">
        {userId && <NotificationBell initialUnread={unread} userId={userId} />}
      </div>
    </div>
    {/* Нижняя строка: аналитика и отчёты */}
    <div className="flex gap-3 text-xs pb-1 flex-wrap border-t border-slate-100 pt-1">
      <span className="text-slate-400 shrink-0">Отчёты:</span>
      <Link href="/admin/analytics" className="text-slate-500 hover:text-slate-800 transition-colors">Аналитика</Link>
      <Link href="/admin/funnel" className="text-slate-500 hover:text-slate-800 transition-colors">Воронка</Link>
      <Link href="/admin/investors-activity" className="text-slate-500 hover:text-slate-800 transition-colors">Инвесторы</Link>
      <Link href="/admin/export" className="text-slate-500 hover:text-slate-800 transition-colors">Экспорт</Link>
      <Link href="/admin/audit-log" className="text-slate-500 hover:text-slate-800 transition-colors">Журнал</Link>
      <Link href="/admin/notifications" className="text-slate-500 hover:text-slate-800 transition-colors">Объявления</Link>
      <Link href="/admin/referral-rewards" className="text-slate-500 hover:text-slate-800 transition-colors">Реферальные вознаграждения</Link>
      <Link href="/admin/search" className="text-slate-500 hover:text-slate-800 transition-colors">Поиск</Link>
      <Link href="/admin/commercial-terms" className="text-slate-500 hover:text-slate-800 transition-colors">Коммерческие условия</Link>
    </div>
  </div>
</header>
```

**Важно:** проверить, что ссылка `/admin/dashboard` существует в роутинге (если нет — использовать `/`).

---

## Ограничения

- НЕ трогать `app/page.tsx` (лендинг)
- НЕ трогать `app/(auth)/`
- НЕ трогать `app/(project)/layout.tsx`
- Не трогать логику — только UI структуру navbar
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Читать файлы перед изменением

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `/catalog` — в navbar видны: Главная, Каталог, Портфель, Избранное, Заявки, Партнёрская программа, Уведомления, Профиль
4. `/admin/dashboard` — navbar в 2 строки: основные действия + аналитика/отчёты
5. Записать в progress.md: `DONE: T101` + что изменено
