# T109 — Мобильная навигация: бургер-меню для инвестора, проекта и менеджера

## Контекст

**Дата:** 2026-06-29
**Размер:** M
**Зависимости:** T101 (NavLink компонент), T102-T108 (slate-тема)
**Текущее количество тестов:** ~75 (t1–t80, с пропусками)

T101-T108 завершили полную миграцию на slate-тему и реорганизацию навигации.
Навбары инвестора (8 ссылок), проекта и менеджера корректно отображаются на desktop,
но на мобильных экранах (<768px) ссылки переносятся в несколько строк и ломают layout.

---

## Зачем это нужно

Инвесторы и представители проектов могут заходить на платформу с телефона — например,
чтобы проверить статус заявки, посмотреть уведомления или открыть deal room.
Текущий navbar инвестора содержит 8 ссылок в ряд: на экране 375px они либо скрываются
за overflow, либо переносятся в три строки и занимают пол-экрана. Это неприемлемо.

Решение: стандартный паттерн — скрыть горизонтальную навигацию на мобильных (`md:hidden`),
добавить кнопку-бургер, при нажатии показывать вертикальное меню поверх контента.

---

## Что НЕ делаем в этом этапе

- НЕ трогаем навбар администратора (`app/(admin)/layout.tsx` — desktop-инструмент, flex-wrap достаточно)
- НЕ добавляем анимации/transitions (только instant show/hide)
- НЕ используем drawer/sheet из shadcn (простой `{open && <div>}` достаточно)
- НЕ меняем логику auth или роли
- НЕ добавляем npm-зависимости
- НЕ трогаем `components/ui/*.tsx`

---

## Шаг 1 — Создать `components/mobile-nav.tsx`

Новый файл. Клиентский компонент с состоянием open/closed.

```tsx
'use client';

import { useState } from 'react';
import { NavLink } from '@/components/nav-link';

export interface MobileNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

interface MobileNavProps {
  items: MobileNavItem[];
}

export function MobileNav({ items }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label={open ? 'Закрыть меню' : 'Открыть меню'}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {open && (
        <nav
          onClick={() => setOpen(false)}
          className="absolute left-0 right-0 top-full z-50 -mx-4 border-b border-slate-200 bg-white px-4 pb-4 pt-2 shadow-sm"
          aria-label="Мобильное меню"
        >
          <div className="flex flex-col gap-0.5">
            {items.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                exact={item.exact}
                className="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                activeClassName="!bg-slate-100 !text-slate-900 font-medium"
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
```

**Примечания по реализации:**
- `onClick` на `<nav>` закрывает меню при нажатии любой ссылки (event bubbling)
- `absolute` позиционирование относительно родительского `relative` div
- `-mx-4` компенсирует padding родительского контейнера — меню растягивается на всю ширину
- `z-50` — поверх контента страницы

---

## Шаг 2 — Обновить `app/(investor)/layout.tsx`

Обязательно прочитать файл полностью перед изменением.

Добавить импорт:
```tsx
import { MobileNav, type MobileNavItem } from '@/components/mobile-nav';
```

Добавить константу перед функцией layout (вне компонента):
```tsx
const INVESTOR_NAV_ITEMS: MobileNavItem[] = [
  { href: '/dashboard', label: 'Главная', exact: true },
  { href: '/catalog', label: 'Каталог' },
  { href: '/portfolio', label: 'Портфель' },
  { href: '/favorites', label: 'Избранное' },
  { href: '/applications', label: 'Заявки' },
  { href: '/referral', label: 'Партнёрская программа' },
  { href: '/notifications', label: 'Уведомления' },
  { href: '/profile', label: 'Профиль' },
];
```

Изменить структуру header:
```tsx
<div className="container mx-auto px-4 py-3 flex items-center gap-6">
  <Link href="/dashboard" className="font-semibold text-slate-900 shrink-0 hover:text-slate-700 transition-colors">
    Invest Market
  </Link>

  {/* Desktop nav — скрыто на мобильных */}
  <nav className="hidden md:flex gap-4 text-sm flex-wrap">
    <NavLink href="/dashboard" exact className="text-sm text-slate-500 hover:text-slate-900 transition-colors" activeClassName="!text-slate-900 font-medium">
      Главная
    </NavLink>
    {/* ... остальные NavLink без изменений ... */}
  </nav>

  <div className="ml-auto flex items-center gap-2">
    {userId && <NotificationBell initialUnread={unread} userId={userId} />}
    <MobileNav items={INVESTOR_NAV_ITEMS} />
  </div>
</div>
```

**Важно:** `ml-auto` переносится на обёртку `<div className="ml-auto flex items-center gap-2">`,
которая содержит и NotificationBell, и MobileNav.

---

## Шаг 3 — Обновить `app/(project)/layout.tsx`

Обязательно прочитать файл полностью перед изменением.

Добавить импорт:
```tsx
import { MobileNav } from '@/components/mobile-nav';
```

Изменить структуру nav. Текущий код итерирует `navItems.filter(item => item.show).map(...)`.
Нужно:
1. Обернуть NavLink-ссылки в `<div className="hidden md:flex items-center gap-4 flex-1">`
2. Передать отфильтрованные items в MobileNav

```tsx
<nav className="bg-white border-b border-slate-200">
  <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3 text-sm">

    {/* Desktop links */}
    <div className="hidden md:flex items-center gap-4 flex-1">
      {navItems.filter(item => item.show).map(item => (
        <NavLink
          key={item.href}
          href={item.href}
          exact
          className="font-medium text-slate-600 hover:text-slate-900 transition-colors"
          activeClassName="!text-slate-900 underline underline-offset-4"
        >
          {item.label}
        </NavLink>
      ))}
    </div>

    <div className="ml-auto flex items-center gap-2">
      <NotificationBell initialUnread={unread} userId={user.id} />
      <MobileNav
        items={navItems
          .filter((item) => item.show)
          .map((item) => ({ href: item.href, label: item.label, exact: true as const }))}
      />
    </div>
  </div>
</nav>
```

---

## Шаг 4 — Обновить `app/(manager)/layout.tsx`

Обязательно прочитать файл полностью перед изменением.

Добавить импорт:
```tsx
import { MobileNav, type MobileNavItem } from '@/components/mobile-nav';
```

Добавить константу перед функцией layout:
```tsx
const MANAGER_NAV_ITEMS: MobileNavItem[] = [
  { href: '/manager/dashboard', label: 'Dashboard' },
  { href: '/manager/applications', label: 'Заявки' },
  { href: '/profile', label: 'Профиль' },
];
```

Изменить структуру nav:
```tsx
<nav className="flex items-center justify-between border-b bg-white px-6 py-3">
  <div className="flex items-center gap-6">
    <span className="font-semibold text-slate-900">Invest Market - Менеджер</span>
    {/* Desktop links */}
    <div className="hidden md:flex items-center gap-6">
      <NavLink
        href="/manager/dashboard"
        className="text-sm text-slate-600 hover:text-slate-900"
        activeClassName="font-medium text-slate-900"
      >
        Dashboard
      </NavLink>
      <NavLink
        href="/manager/applications"
        className="text-sm text-slate-600 hover:text-slate-900"
        activeClassName="font-medium text-slate-900"
      >
        Заявки
      </NavLink>
    </div>
  </div>
  <div className="flex items-center gap-3">
    {userId && <NotificationBell initialUnread={unread} userId={userId} />}
    {/* Desktop profile — скрыт на мобильных */}
    <NavLink
      href="/profile"
      className="hidden md:inline text-sm text-slate-600 hover:text-slate-900"
      activeClassName="font-medium text-slate-900"
    >
      Профиль
    </NavLink>
    <MobileNav items={MANAGER_NAV_ITEMS} />
  </div>
</nav>
```

---

## Тесты

Мобильная навигация — чисто UI-компонент без бизнес-логики. Unit-тесты не нужны.

**Новых тестовых файлов: 0**
**Существующие тесты:** должны пройти без изменений (~75 тестов, t1–t80).

---

## Команды проверки

```bash
cd invest_market
npm run build
npm run lint
npm test
```

---

## Критерии готовности

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. Создан `components/mobile-nav.tsx` с экспортом `MobileNav` и `MobileNavItem`
4. `app/(investor)/layout.tsx`: `<nav>` скрыта через `hidden md:flex`; `<MobileNav>` видна через `md:hidden`
5. `app/(project)/layout.tsx`: desktop ссылки в `hidden md:flex` обёртке; `<MobileNav>` получает отфильтрованные items
6. `app/(manager)/layout.tsx`: desktop ссылки скрыты; `<MobileNav>` добавлен
7. `app/(admin)/layout.tsx` — НЕ изменён
8. `components/ui/*.tsx` — НЕ изменены
9. Существующие тесты проходят без изменений

---

## Что НЕ трогать

- `app/(admin)/layout.tsx`
- `components/ui/*.tsx` (shadcn/ui)
- `components/nav-link.tsx` (только читать)
- `lib/utils.ts`
- Все файлы в `app/api/`
- Все файлы в `__tests__/`
- `middleware.ts`
- `supabase/migrations/`

---

## Формат отчёта

```
DONE: T109
- создан components/mobile-nav.tsx (MobileNav client component, MobileNavItem type)
- обновлён app/(investor)/layout.tsx: desktop nav hidden md:flex, MobileNav для мобильных
- обновлён app/(project)/layout.tsx: desktop nav hidden md:flex, MobileNav с фильтрацией items
- обновлён app/(manager)/layout.tsx: desktop nav hidden md:flex, MobileNav для мобильных
```
