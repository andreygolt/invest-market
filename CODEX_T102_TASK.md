# T102 — Активная ссылка в навигации + исправление layout менеджера

## Контекст

T101 добавил полный набор ссылок в навбар инвестора и реорганизовал навбар администратора.
Однако ни один из навбаров не выделяет текущую страницу — пользователь не видит, где он находится.

Дополнительно: layout менеджера (`app/(manager)/layout.tsx`) использует устаревший компонент
`NotificationsBell` (не `NotificationBell`), серый фон (`bg-gray-50`) вместо `bg-slate-50`,
и имеет только 1 навигационную ссылку («Заявки») — тогда как существует `/manager/dashboard`.

---

## Файлы для изменения

Обязательно прочитать каждый файл полностью перед изменением:

- `app/(investor)/layout.tsx`
- `app/(admin)/layout.tsx`
- `app/(project)/layout.tsx`
- `app/(manager)/layout.tsx`
- `components/nav-link.tsx` — создать новый файл

---

## Часть 1: Компонент NavLink

### `components/nav-link.tsx` — создать

Клиентский компонент, подсвечивающий активную ссылку через `usePathname()`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

interface NavLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  activeClassName?: string;
  exact?: boolean;
}

export function NavLink({
  href,
  children,
  className,
  activeClassName,
  exact = false,
}: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cn(className, isActive && activeClassName)}
    >
      {children}
    </Link>
  );
}
```

---

## Часть 2: Навбар инвестора

### `app/(investor)/layout.tsx`

Заменить `<Link>` на `<NavLink>` для всех ссылок в `<nav>`.

Активная ссылка должна отображаться с `text-slate-900 font-medium`, неактивная — `text-slate-500`.

```tsx
import { NavLink } from '@/components/nav-link';

// В <nav>:
<NavLink
  href="/dashboard"
  exact
  className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
  activeClassName="!text-slate-900 font-medium"
>
  Главная
</NavLink>
// ... остальные ссылки аналогично
```

Правило `exact`:
- `/dashboard` — exact (чтобы не совпадать с `/deals/...`)
- `/catalog` — не exact (охватывает `/catalog?...` query params)
- `/portfolio`, `/favorites`, `/applications`, `/referral`, `/notifications`, `/profile` — не exact

---

## Часть 3: Навбар администратора

### `app/(admin)/layout.tsx`

Заменить `<Link>` на `<NavLink>` в обоих рядах навигации.

**Ряд 1 (основные)** — активная ссылка: `text-slate-900 font-semibold border-b-2 border-slate-900 pb-0.5`
**Ряд 2 (отчёты)** — активная ссылка: `text-slate-800 font-medium`

Импорт:
```tsx
import { NavLink } from '@/components/nav-link';
```

Ссылки ряда 1 — `exact: false`, ссылки ряда 2 — `exact: true`.

---

## Часть 4: Навбар проекта

### `app/(project)/layout.tsx`

Заменить в массиве `navItems` — вместо `<Link>` использовать `<NavLink>`:

```tsx
import { NavLink } from '@/components/nav-link';

// Вместо:
<Link key={item.href} href={item.href} className="font-medium text-slate-600 hover:text-slate-900">
  {item.label}
</Link>

// Использовать:
<NavLink
  key={item.href}
  href={item.href}
  exact
  className="font-medium text-slate-600 hover:text-slate-900 transition-colors"
  activeClassName="!text-slate-900 underline underline-offset-4"
>
  {item.label}
</NavLink>
```

---

## Часть 5: Layout менеджера

### `app/(manager)/layout.tsx`

1. Заменить `NotificationsBell` на `NotificationBell` из `@/components/notifications/notification-bell`
2. Добавить `userId` и `unread` через `getCurrentUserId` и `getUnreadCount` (как в других layout-ах)
3. Изменить `bg-gray-50` → `bg-slate-50`, `bg-white` уже правильный
4. Добавить ссылку на `/manager/dashboard` в навигацию
5. Использовать `NavLink` для активных ссылок

Итоговая навигация менеджера:
- Dashboard (`/manager/dashboard`)
- Заявки (`/manager/applications`)
- Профиль (`/profile`)

```tsx
import { NavLink } from '@/components/nav-link';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { getCurrentUserId, getUnreadCount } from '@/lib/notifications/get-unread-count';

// В layout:
const [unread, userId] = await Promise.all([getUnreadCount(), getCurrentUserId()]);

// В JSX:
{userId && <NotificationBell initialUnread={unread} userId={userId} />}
```

---

## Ограничения

- НЕ трогать `app/(auth)/`
- НЕ трогать `app/page.tsx` (лендинг)
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- `cn()` уже существует в `lib/utils.ts` — использовать его

---

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. При переходе на `/catalog` ссылка «Каталог» выделена, остальные — нет
4. При переходе на `/admin/dashboard` ссылка «Dashboard» выделена
5. Менеджер видит 3 ссылки в навбаре, NotificationsBell заменён на NotificationBell
6. Написать в progress.md: `DONE: T102` + что создано/изменено
