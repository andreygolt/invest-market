# T41 — Статистика интереса инвесторов на дашборде проекта

## Контекст

В T7/T36 реализована модерация проектов. Когда проект одобрен (`status = 'approved'`),
он становится виден инвесторам в каталоге. Однако владелец проекта не знает:
- Сколько инвесторов добавили проект в избранное
- Сколько заявок поступило (и в каком статусе)
- Сколько инвесторов зафиксировали факт инвестиции в портфеле

T41 добавляет блок «Интерес инвесторов» на дашборд проекта (только при `status = 'approved'`).

## Что нужно создать / изменить

### 1. Создать `app/api/project/stats/route.ts`

**GET /api/project/stats**

- 401 если не авторизован (через `createServerClient()` + `getUser()`)
- Получить `project_id` текущего пользователя через `projects.owner_id = user.id`
- 404 если проект не найден
- 403 если статус не `approved` (статистика только для опубликованных проектов)
- Считать через `createAdminClient()` (обходит RLS):

```typescript
// Количество избранных
const { count: favoritesCount } = await adminSupabase
  .from('investor_favorites')
  .select('*', { count: 'exact', head: true })
  .eq('project_id', projectId)

// Заявки по статусам
const { data: appRows } = await adminSupabase
  .from('applications')
  .select('status')
  .eq('project_id', projectId)

// Записи в портфеле инвесторов
const { count: portfolioCount } = await adminSupabase
  .from('investor_portfolio')
  .select('*', { count: 'exact', head: true })
  .eq('project_id', projectId)
```

Формат ответа:

```typescript
{
  favorites_count: number,
  portfolio_count: number,
  applications: {
    total: number,
    pending: number,
    approved: number,
    rejected: number,
    cancelled: number,
    withdrawn: number,
  }
}
```

Подсчёт заявок по статусам — через `appRows`:

```typescript
const applications = {
  total: appRows?.length ?? 0,
  pending:   (appRows ?? []).filter(r => r.status === 'pending').length,
  approved:  (appRows ?? []).filter(r => r.status === 'approved').length,
  rejected:  (appRows ?? []).filter(r => r.status === 'rejected').length,
  cancelled: (appRows ?? []).filter(r => r.status === 'cancelled').length,
  withdrawn: (appRows ?? []).filter(r => r.status === 'withdrawn').length,
}
```

### 2. Обновить `types/index.ts`

Добавить тип ответа:

```typescript
export interface ProjectStats {
  favorites_count: number
  portfolio_count: number
  applications: {
    total: number
    pending: number
    approved: number
    rejected: number
    cancelled: number
    withdrawn: number
  }
}
```

Не трогать остальные типы.

### 3. Обновить `app/(project)/project/page.tsx`

Добавить загрузку статистики после получения данных проекта.
Выполнять только если `project.status === 'approved'`:

```typescript
// После получения project:
let stats: ProjectStats | null = null
if (project.status === 'approved') {
  const statsRes = await supabase  // использовать тот же serverClient
    // нет — использовать fetch к /api/project/stats
  // Но лучше вызвать напрямую через admin client:
  const { createAdminClient } = await import('@/lib/supabase/admin')
  // ... или через отдельный fetch
}
```

**Рекомендованный способ** — вызвать API маршрут через fetch (чтобы переиспользовать логику):

```typescript
import { headers, cookies } from 'next/headers'

// Внутри компонента, после получения project:
let stats: ProjectStats | null = null
if (project.status === 'approved') {
  const cookieStore = await cookies()
  const cookieHeader = cookieStore.toString()
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const statsRes = await fetch(`${baseUrl}/api/project/stats`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  })
  if (statsRes.ok) {
    stats = await statsRes.json() as ProjectStats
  }
}
```

Передать `stats` в `ProjectDashboardClient`:

```typescript
<ProjectDashboardClient project={project} docsCount={docsCount} stats={stats} />
```

### 4. Обновить `app/(project)/project/project-dashboard-client.tsx`

Добавить `stats` в props:

```typescript
interface ProjectDashboardClientProps {
  project: ProjectDashboardData
  docsCount: number
  stats: ProjectStats | null  // добавить
}
```

Добавить блок «Интерес инвесторов» только когда `project.status === 'approved' && stats`:

```tsx
{project.status === 'approved' && stats && (
  <Card>
    <CardHeader>
      <CardTitle className="text-xl">Интерес инвесторов</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 text-sm">
        <div className="rounded-md border p-3 text-center">
          <div className="text-2xl font-semibold">{stats.favorites_count}</div>
          <div className="text-gray-500 mt-1">В избранном</div>
        </div>
        <div className="rounded-md border p-3 text-center">
          <div className="text-2xl font-semibold">{stats.applications.total}</div>
          <div className="text-gray-500 mt-1">Заявок всего</div>
        </div>
        <div className="rounded-md border p-3 text-center">
          <div className="text-2xl font-semibold">{stats.applications.pending}</div>
          <div className="text-gray-500 mt-1">На рассмотрении</div>
        </div>
        <div className="rounded-md border p-3 text-center">
          <div className="text-2xl font-semibold">{stats.applications.approved}</div>
          <div className="text-gray-500 mt-1">Одобрено</div>
        </div>
        <div className="rounded-md border p-3 text-center">
          <div className="text-2xl font-semibold">{stats.portfolio_count}</div>
          <div className="text-gray-500 mt-1">В портфелях</div>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

Разместить блок после карточки статуса (`approved` banner) и перед чеклистом.

### 5. Тесты — `__tests__/t41.test.ts`

```typescript
// 1. GET /api/project/stats — 401 без авторизации
// 2. GET /api/project/stats — 404 если проект не найден (нет проекта у пользователя)
// 3. GET /api/project/stats — 403 если project.status !== 'approved'
// 4. GET /api/project/stats — 200 возвращает { favorites_count, portfolio_count, applications }
// 5. GET /api/project/stats — favorites_count соответствует количеству записей в investor_favorites
// 6. GET /api/project/stats — applications.total = сумма всех заявок по всем статусам
// 7. GET /api/project/stats — applications.pending корректно считает только pending записи
// 8. GET /api/project/stats — applications.approved корректно считает только approved записи
// 9. GET /api/project/stats — portfolio_count соответствует количеству записей в investor_portfolio
// 10. GET /api/project/stats — если нет заявок — applications.total = 0, все статусы = 0
// 11. GET /api/project/stats — applications включает поля cancelled и withdrawn
// 12. ProjectStats тип содержит все поля: favorites_count, portfolio_count, applications.*
```

### Структура моков для тестов

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createServerClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { id: 'project-1', status: 'approved' },
        error: null,
      }),
    })),
  })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      // favorites/portfolio count:
      head: jest.fn().mockResolvedValue({ count: 3, error: null }),
      // applications rows:
      // используй mockResolvedValueOnce для разных вызовов
    })),
  })),
}))
```

> Подсказка: `investor_favorites` и `investor_portfolio` используют `{ count: 'exact', head: true }` —
> цепочка заканчивается на `head`. `applications` выбирает `status` строками — цепочка заканчивается
> без `.head`, поэтому можно различать через `mockResolvedValueOnce`.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- shadcn/ui компоненты (Card, CardHeader, CardTitle, CardContent — уже используются)
- Не трогать файлы кроме указанных в этом ТЗ
- Блок статистики показывается ТОЛЬКО при `status === 'approved'`
- Статистика читается через `createAdminClient()` (обходит RLS) — не показывать личные данные инвесторов
- Не добавлять новые миграции — все таблицы уже существуют
- Ошибка получения статистики не должна ломать дашборд (stats остаётся null)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t41.test.ts)
4. `GET /api/project/stats` — 401 без auth, 403 если не approved, 200 с данными
5. Дашборд проекта при `status = 'approved'` показывает блок «Интерес инвесторов»
6. Блок показывает: количество в избранном, заявок (всего + pending + approved), в портфелях
7. При других статусах проекта блок не отображается
8. Записать в `progress.md`: `DONE: T41 + что создано/изменено`
