# T26 — Admin: Главный Dashboard администратора

## Контекст

В T21 создан API `/api/admin/stats` с богатой статистикой: количество проектов по статусам,
пользователи по ролям, заявки инвесторов, портфельные записи, инвайты, последние события.
Однако у администратора нет **главной страницы** — после логина нет обзорного экрана
с ключевыми метриками и последними событиями платформы.

T26 создаёт Dashboard-страницу `/admin/dashboard` (или `/`) для роли admin/superadmin:
карточки с метриками, статусы проектов, активность платформы.

> Примечание: файлы admin-кабинета лежат в `app/(admin)/`. Убедись, что маршрут
> `/admin/dashboard` будет `app/(admin)/dashboard/page.tsx` или аналогичный.
> Посмотри как устроен `app/(admin)/applications/page.tsx` (T24) — используй тот же паттерн.

## Что нужно создать / изменить

### 1. Страница — `app/(admin)/dashboard/page.tsx`

Серверный компонент:
- Проверить роль: `superadmin` или `admin` — иначе redirect на `/login`
- Вызвать `/api/admin/stats` через внутренний fetch (или напрямую через Supabase server client)
  — предпочтительнее прямой запрос без HTTP, аналогично T24.
- Передать данные в `<AdminDashboardClient stats={stats} />`

Прямой запрос к Supabase (без HTTP fetch) предпочтительнее для серверного компонента.
Логику подсчёта можно скопировать из `app/api/admin/stats/route.ts`, вынеся общую
функцию `getAdminStats(supabase)` в `lib/admin/stats.ts`.

### 2. Утилита — `lib/admin/stats.ts`

Вынести логику из `app/api/admin/stats/route.ts` в переиспользуемую функцию:

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AdminStats } from '@/types'

export async function getAdminStats(supabase: SupabaseClient): Promise<AdminStats>
```

**Важно:** обновить `app/api/admin/stats/route.ts` — использовать `getAdminStats(supabase)`
вместо дублирующего кода. Логику из route.ts не удалять, а делегировать в lib.

### 3. Клиентский компонент — `app/(admin)/dashboard/admin-dashboard-client.tsx`

**Секция 1: Карточки метрик** (grid 2×2 или 3×2, shadcn/ui `Card`)

| Карточка | Значение | Подпись |
|---|---|---|
| Проекты | `stats.projects.total` | черновик / проверка / одобрен / отклонён |
| Инвесторы | `stats.users.investor` | всего инвесторов |
| Заявки | `stats.applications.total` | ожидают: N |
| Инвайты | `stats.invites.total` | использовано: N |

В карточке «Проекты» показать мини-строку со статусами:
```
Черновик: N  |  На проверке: N  |  Одобрен: N  |  Отклонён: N
```

В карточке «Заявки» показать:
```
Ожидают: N  |  Одобрено: N  |  Отклонено: N
```

**Секция 2: Пользователи по ролям** (shadcn/ui `Card`, список или таблица)

```
Администраторы:   N
Модераторы:       N
Менеджеры:        N
Проекты:          N
Инвесторы:        N
Всего:            N
```

**Секция 3: Последние события** (shadcn/ui `Card`, список)

Список `stats.recent_activity` (до 10 записей):

```
[дата]  [название проекта]  →  [статус]
```

Дата: `toLocaleDateString('ru-RU')`.
Статус-badge: draft=серый, submitted=синий, approved=зелёный, rejected=красный.

Если `recent_activity` пуст — текст «Нет последних событий».

**Секция 4: Быстрые ссылки** (grid 2×N кнопок, shadcn/ui `Button` variant=outline)

| Кнопка | Ссылка |
|---|---|
| Модерация проектов | `/moderation` |
| Заявки инвесторов | `/applications` |
| Пользователи | `/users` |
| Инвайты | `/invites` |
| Реферальные вознаграждения | `/referral-rewards` |
| Коммерческие условия | `/commercial-terms` |

### 4. Навигация — обновить layout admin-панели

Найди layout или nav-компонент в `app/(admin)/`. Добавь пункт **«Dashboard»** → `/dashboard`
как первый пункт меню (перед «Модерация»). Не трогай другие пункты.

### 5. Типы — `types/index.ts`

`AdminStats`, `AdminActivityItem` уже должны быть определены (из T21).
Проверь — если их нет, добавь:

```typescript
export interface AdminStats {
  projects: {
    draft: number
    submitted: number
    approved: number
    rejected: number
    total: number
  }
  users: {
    investor: number
    project: number
    admin: number
    moderator: number
    manager: number
    total: number
  }
  applications: {
    pending: number
    approved: number
    rejected: number
    total: number
  }
  portfolio: {
    total_records: number
  }
  invites: {
    total: number
    used: number
    unused: number
  }
  recent_activity: AdminActivityItem[]
}

export interface AdminActivityItem {
  project_id: string
  status: string
  changed_at: string
  project_name: string | null
}
```

Не дублировать если уже существуют.

### 6. Тесты — `__tests__/t26.test.ts`

```typescript
// 1. GET /api/admin/stats — 401 без авторизации
// 2. GET /api/admin/stats — 403 для role=investor
// 3. GET /api/admin/stats — 403 для role=project
// 4. GET /api/admin/stats — 403 для role=moderator
// 5. GET /api/admin/stats — 200 для role=admin (мок supabase, проверить структуру ответа)
// 6. GET /api/admin/stats — 200 для role=superadmin
// 7. getAdminStats: возвращает объект с полями projects, users, applications, invites, recent_activity
// 8. getAdminStats: projects.total = draft + submitted + approved + rejected
// 9. getAdminStats: invites.unused = total - used (не меньше 0)
// 10. getAdminStats: recent_activity содержит не более 10 записей
```

Тесты 7-10 — unit-тесты функции `getAdminStats` с мок-клиентом Supabase.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict, никаких `any`
- shadcn/ui компоненты (Card, Badge, Button)
- Не трогать файлы других модулей кроме указанных
- При рефакторинге `app/api/admin/stats/route.ts` — не менять поведение API,
  только делегировать логику в `lib/admin/stats.ts`

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t26.test.ts)
4. Страница `/dashboard` отображает метрики, пользователей, последние события и быстрые ссылки
5. Функция `getAdminStats` вынесена в `lib/admin/stats.ts` и используется из route.ts
6. Пункт «Dashboard» присутствует в навигации admin-панели
7. Записать в `progress.md`: `DONE: T26 + что создано/изменено`
