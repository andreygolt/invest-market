# T66 — Кабинет менеджера: экспорт заявок в CSV

## Контекст

Менеджер работает с заявками через интерфейс платформы (T37, T45, T64, T65).
Для внешней отчётности и работы в Excel менеджеру нужна возможность выгрузить
список заявок в CSV-файл. Администратор уже имеет такой инструмент через
`GET /api/admin/export/applications` (T49). Менеджеру нужен аналогичный эндпоинт
с теми же возможностями фильтрации, что на странице `/manager/applications`,
и кнопка на странице для скачивания файла.

T66 добавляет:
- `GET /api/manager/export/applications` — CSV-файл с заявками
  (опциональные фильтры: `status`, `project_id`, `date_from`, `date_to`)
- Кнопка «Экспорт CSV» на странице `/manager/applications` (рядом с заголовком или фильтрами)

## Что нужно создать / изменить

### 1. Создать `app/api/manager/export/applications/route.ts`

GET-запрос, возвращает CSV с заголовком `Content-Disposition: attachment`.

Query-параметры (все опциональные):
- `status` — фильтр по статусу (`pending` | `approved` | `rejected` | `cancelled`)
- `project_id` — UUID проекта
- `date_from` — ISO-дата начала диапазона (по `created_at`, включительно)
- `date_to` — ISO-дата конца диапазона (по `created_at`, включительно)

Доступ: только роли `manager`, `admin`, `superadmin`.

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

type AppRow = {
  id: string
  status: string
  amount: number | null
  instrument: string | null
  message: string | null
  created_at: string
  rejection_reason: string | null
  projects: { name: string | null } | { name: string | null }[] | null
  users: { email: string | null } | { email: string | null }[] | null
}

function getName(p: AppRow['projects']): string | null {
  return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null
}
function getEmail(u: AppRow['users']): string | null {
  return (Array.isArray(u) ? u[0]?.email : u?.email) ?? null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const allowed = ['admin', 'superadmin', 'manager']
  if (!profile || !allowed.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const projectId = searchParams.get('project_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  let query = admin
    .from('investor_applications')
    .select('id, status, amount, instrument, message, created_at, rejection_reason, projects(name), users(email)')
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)
  if (dateFrom) query = query.gte('created_at', dateFrom)
  if (dateTo) query = query.lte('created_at', dateTo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const csvHeaders = [
    'ID', 'Проект', 'Инвестор (email)', 'Статус',
    'Сумма', 'Инструмент', 'Сообщение', 'Причина отклонения', 'Дата создания',
  ]

  const rows = (data ?? []).map((row: AppRow) => [
    row.id,
    getName(row.projects),
    getEmail(row.users),
    row.status,
    row.amount,
    row.instrument,
    row.message,
    row.rejection_reason,
    row.created_at,
  ])

  const csv = [csvHeaders, ...rows]
    .map((r) => r.map(escapeCSV).join(','))
    .join('\n')

  const filename = `applications-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
```

### 2. Обновить `app/(manager)/manager/applications/page.tsx`

Прочитать файл целиком. Добавить кнопку-ссылку «Экспорт CSV» — `<a>` с `href`
на `/api/manager/export/applications` и атрибутом `download`. Кнопка размещается
рядом с заголовком страницы или блоком фильтров.

Если страница серверная — добавить ссылку напрямую в JSX:
```tsx
<a
  href="/api/manager/export/applications"
  className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
  download
>
  Экспорт CSV
</a>
```

Если страница клиентская с динамическими фильтрами (например, управляемыми через URL) —
формировать `href` динамически из текущих searchParams:
```tsx
const exportHref = `/api/manager/export/applications?${new URLSearchParams(
  Object.fromEntries(
    Object.entries({ status, project_id }).filter(([, v]) => v)
  )
).toString()}`
```

**Важно:** читать существующий файл перед изменением. Не менять логику фильтрации
и отображения заявок.

### 3. Создать `__tests__/t66.test.ts`

```typescript
// GET /api/manager/export/applications
// 1.  401 без авторизации (user = null)
// 2.  403 для роли investor
// 3.  403 для роли project
// 4.  200 + Content-Type: text/csv для роли manager
// 5.  200 + Content-Type: text/csv для роли admin
// 6.  заголовок Content-Disposition содержит "applications-" и ".csv"
// 7.  тело ответа — строка (CSV), первая строка содержит "ID"
// 8.  CSV содержит данные заявки (project name, investor email, status)
// 9.  пустой список заявок → CSV только с заголовком (1 строка данных)
// 10. query-параметр ?status=pending передаётся в запрос к Supabase (вызывает .eq)
// 11. query-параметр ?date_from=... вызывает .gte на created_at
// 12. query-параметр ?date_to=... вызывает .lte на created_at

// escapeCSV (unit-тесты)
// 13. значение с запятой оборачивается в двойные кавычки
// 14. значение с двойной кавычкой — кавычка экранируется как ""
// 15. null → пустая строка
// 16. undefined → пустая строка
// 17. число → строка без изменений
// 18. обычная строка без спецсимволов → возвращается as-is
```

#### Структура тестов

```typescript
import { GET, escapeCSV } from '@/app/api/manager/export/applications/route'
import { NextRequest } from 'next/server'

// Базовый мок: авторизован как manager
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'manager-1' } },
      }),
    },
  })),
}))

const mockApplicationRow = {
  id: 'app-1',
  status: 'pending',
  amount: 500000,
  instrument: 'equity',
  message: 'Хочу инвестировать',
  created_at: '2026-06-01T10:00:00Z',
  rejection_reason: null,
  projects: { name: 'Alpha Project' },
  users: { email: 'investor@test.com' },
}

// Для тестов с другой ролью — переопределять возвращаемое значение profile.role
// через jest.mocked(createAdminClient) или вложенный describe с jest.mock.

function makeRequest(url = 'http://localhost/api/manager/export/applications') {
  return new NextRequest(url)
}
```

Тестировать через прямой вызов `GET(request)`.
Функцию `escapeCSV` импортировать напрямую и тестировать unit-тестами.
Для тестирования фильтров — проверять, что методы `.eq`, `.gte`, `.lte` были вызваны
(через `expect(mockQuery.eq).toHaveBeenCalledWith(...)`).

## Файлы для создания / изменения

- `app/api/manager/export/applications/route.ts` (новый)
- `app/(manager)/manager/applications/page.tsx` (обновить: добавить кнопку «Экспорт CSV»)
- `__tests__/t66.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Доступ только для ролей `manager`, `admin`, `superadmin`
- CSV в кодировке UTF-8, без BOM
- `escapeCSV` должна быть экспортируемой функцией (для unit-тестирования)
- Читать существующий `app/(manager)/manager/applications/page.tsx` перед изменением
- Не менять существующую логику фильтрации/отображения заявок

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t66.test.ts)
4. `GET /api/manager/export/applications` — 401 без auth, 403 для investor/project, 200+CSV для manager/admin
5. Поддерживаются query-фильтры: `status`, `project_id`, `date_from`, `date_to`
6. Заголовок `Content-Disposition: attachment; filename="applications-YYYY-MM-DD.csv"`
7. На странице `/manager/applications` видна кнопка / ссылка «Экспорт CSV»
8. Записать в `progress.md`: `DONE: T66 + что создано/изменено`
