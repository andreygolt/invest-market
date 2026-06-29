# T23 — Admin Statistics Dashboard: сводная аналитика платформы

## Контекст

Администратор имеет инструменты для модерации, управления пользователями, инвайтами,
коммерческими условиями и реферальными вознаграждениями. Однако нет **главной страницы
admin-панели** с ключевыми показателями платформы — администратор не видит общей картины:
сколько проектов на каждом статусе, сколько инвесторов, заявок, инвестиций.

T23 создаёт Admin Statistics Dashboard — сводный дашборд на `/` (главная admin-раздела)
с ключевыми метриками и последней активностью.

## Что нужно создать

### 1. API route — `app/api/admin/stats/route.ts`

**GET** — агрегированная статистика платформы.
- Только для `superadmin` / `admin` (проверять через `lib/supabase/server.ts`)
- Возвращает JSON типа `AdminStats` (см. ниже)
- Все данные из одного Supabase-запроса (или нескольких параллельных через `Promise.all`)

Считать:
```typescript
// Проекты по статусам
projects: {
  draft: number
  submitted: number
  approved: number
  rejected: number
  total: number
}

// Пользователи по ролям
users: {
  investor: number
  project: number
  admin: number
  moderator: number
  manager: number
  total: number
}

// Заявки инвесторов
applications: {
  pending: number
  approved: number
  rejected: number
  total: number
}

// Портфель (зафиксированные инвестиции)
portfolio: {
  total_records: number
  // сумму не считаем — данные вводятся вручную и не всегда есть
}

// Инвайты
invites: {
  total: number
  used: number
  unused: number
}

// Последняя активность — 10 последних записей из project_status_log
recent_activity: Array<{
  project_id: string
  status: string
  changed_at: string
  project_name: string | null
}>
```

### 2. TypeScript типы — `types/index.ts`

Добавить к существующим (не удалять ничего):

```typescript
export interface AdminProjectStats {
  draft: number
  submitted: number
  approved: number
  rejected: number
  total: number
}

export interface AdminUserStats {
  investor: number
  project: number
  admin: number
  moderator: number
  manager: number
  total: number
}

export interface AdminApplicationStats {
  pending: number
  approved: number
  rejected: number
  total: number
}

export interface AdminActivityItem {
  project_id: string
  status: string
  changed_at: string
  project_name: string | null
}

export interface AdminStats {
  projects: AdminProjectStats
  users: AdminUserStats
  applications: AdminApplicationStats
  portfolio: { total_records: number }
  invites: { total: number; used: number; unused: number }
  recent_activity: AdminActivityItem[]
}
```

### 3. Серверный компонент — `app/(admin)/page.tsx`

- Проверить роль (`superadmin` / `admin`), иначе redirect на `/login`
- Fetch данных через `fetch('/api/admin/stats')` или напрямую через Supabase server client
- Рендерит `<AdminDashboardClient stats={stats} />`

### 4. Клиентский компонент — `app/(admin)/admin-dashboard-client.tsx`

**Секция 1: Карточки метрик** (grid 2×3 или 3×2)

Использовать shadcn/ui `Card` для каждой метрики:

| Карточка | Значение | Подпись |
|---|---|---|
| Всего проектов | `projects.total` | На модерации: `submitted` |
| Одобрено / Отклонено | `approved` / `rejected` | — |
| Всего пользователей | `users.total` | Инвесторов: `investor` |
| Заявки инвесторов | `applications.total` | Ожидают: `pending` |
| Зафиксировано инвестиций | `portfolio.total_records` | записей |
| Инвайты | `invites.used` / `invites.total` | использовано |

**Секция 2: Разбивка проектов по статусам**

Горизонтальный прогресс-бар (или набор badge) без внешних chart-библиотек:

```
draft [----] N   submitted [------] N   approved [--] N   rejected [-] N
```

Реализовать через обычные div с `style={{ width: '...%' }}` и Tailwind-цветами.

**Секция 3: Последняя активность** (таблица)

shadcn/ui `Table` с колонками:
| Проект | Новый статус | Дата |

- Показывать 10 последних записей из `recent_activity`
- Дата форматировать через `toLocaleDateString('ru-RU')`
- Статус — badge с цветом (submitted=синий, approved=зелёный, rejected=красный)
- Кнопка «Перейти» → `/moderation/[project_id]`

**Кнопка обновления**: «Обновить» вверху страницы — вызывает `router.refresh()`

### 5. Навигация

В файле навигации admin-панели (найди существующий layout или nav-компонент) добавить
или проверить наличие пункта **«Дашборд»** → `/` (или `/dashboard`) как первый пункт меню.

Если `/` уже является главной страницей admin-раздела — убедиться что пункт «Дашборд»
есть в навигации и ведёт на неё.

### 6. Тесты — `__tests__/t23.test.ts`

```typescript
// 1. GET /api/admin/stats — 401 без авторизации
// 2. GET /api/admin/stats — 403 для role=investor
// 3. GET /api/admin/stats — 403 для role=project
// 4. GET /api/admin/stats — возвращает корректную структуру AdminStats (мок supabase)
// 5. projects.total === sum of draft+submitted+approved+rejected
// 6. invites.used + invites.unused === invites.total
// 7. recent_activity содержит не более 10 элементов
// 8. GET /api/admin/stats — работает для role=moderator (403, только admin/superadmin)
// 9. AdminStats типизация — projects имеет все поля (draft, submitted, approved, rejected, total)
// 10. recent_activity элемент имеет поля project_id, status, changed_at, project_name
```

## Ограничения

- NO новых npm-зависимостей (нельзя recharts, chart.js и т.п.)
- Все графики — чистый HTML/CSS/Tailwind
- RLS уже включён на всех таблицах — не менять
- Не трогать файлы других модулей кроме указанных
- TypeScript strict, никаких `any`
- Весь UI через shadcn/ui компоненты

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t23.test.ts)
4. Главная страница admin-панели показывает статистику платформы
5. Карточки метрик отображают корректные числа (из моков)
6. Секция последней активности показывает 10 последних изменений статусов
7. Записать в `progress.md`: `DONE: T23 + что создано/изменено`
