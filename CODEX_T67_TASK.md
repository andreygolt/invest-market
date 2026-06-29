# T67 — Кабинет проекта: таймлайн изменений статуса

## Контекст

В T4 создана таблица `project_status_log` — каждое изменение статуса проекта
(draft → submitted → under_review → approved / rejected) фиксируется записью
с полями `project_id`, `old_status`, `new_status`, `changed_at`, `changed_by`.

В T63 создан дашборд `/project` (серверный + клиентский компонент). Однако
владелец проекта не может видеть историю своего проекта: когда он подал заявку,
когда пошёл на проверку, когда был одобрен/отклонён.

T67 добавляет:
- `GET /api/project/status-log` — API для получения истории статусов текущего проекта
- `components/project/status-timeline.tsx` — визуальный таймлайн компонент
- Интеграция таймлайна в страницу дашборда проекта `app/(project)/dashboard/page.tsx`
- `__tests__/t67.test.ts` — тесты

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить:

```typescript
export interface ProjectStatusLogEntry {
  id: string
  project_id: string
  old_status: string | null
  new_status: string
  changed_at: string
  changed_by: string | null
}
```

### 2. Создать `app/api/project/status-log/route.ts`

GET — возвращает историю изменений статуса для проекта текущего пользователя.
Доступ: только роль `project` (владелец проекта) и staff-роли (admin, superadmin, moderator, manager).

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const staffRoles = ['admin', 'superadmin', 'moderator', 'manager']
  const isStaff = staffRoles.includes(profile.role)
  const isProject = profile.role === 'project'

  if (!isProject && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Для роли project — найти проект текущего пользователя
  let projectId: string | null = null
  if (isProject) {
    const { data: project } = await admin
      .from('projects')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!project) return NextResponse.json({ log: [] })
    projectId = project.id
  }

  // Staff не имеет projectId в этом маршруте — возвращаем 403
  // (для staff используется отдельный admin-маршрут)
  if (!projectId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('project_status_log')
    .select('id, project_id, old_status, new_status, changed_at, changed_by')
    .eq('project_id', projectId)
    .order('changed_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ log: data ?? [] })
}
```

### 3. Создать `components/project/status-timeline.tsx`

Клиентский компонент — визуальный таймлайн статусов проекта.

```tsx
'use client'

import type { ProjectStatusLogEntry } from '@/types'

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft:        { label: 'Черновик',          color: 'bg-gray-200 text-gray-700' },
  submitted:    { label: 'Подано на проверку', color: 'bg-blue-100 text-blue-700' },
  under_review: { label: 'На проверке',        color: 'bg-yellow-100 text-yellow-800' },
  approved:     { label: 'Одобрен',            color: 'bg-green-100 text-green-700' },
  rejected:     { label: 'Отклонён',           color: 'bg-red-100 text-red-700' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_LABELS[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  )
}

interface Props {
  log: ProjectStatusLogEntry[]
}

export function StatusTimeline({ log }: Props) {
  if (log.length === 0) {
    return (
      <p className="text-sm text-gray-400">История изменений статуса пока пуста.</p>
    )
  }

  return (
    <ol className="relative border-l border-gray-200 space-y-6 ml-3">
      {log.map((entry, index) => (
        <li key={entry.id} className="ml-6">
          <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-white border-2 border-gray-300 text-xs font-bold text-gray-500">
            {index + 1}
          </span>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 flex-wrap">
              {entry.old_status && (
                <>
                  <StatusBadge status={entry.old_status} />
                  <span className="text-xs text-gray-400">→</span>
                </>
              )}
              <StatusBadge status={entry.new_status} />
            </div>
            <time className="text-xs text-gray-400">
              {new Date(entry.changed_at).toLocaleString('ru-RU')}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}
```

### 4. Обновить `app/(project)/dashboard/page.tsx`

Прочитать файл целиком. Добавить загрузку истории статусов и вывод компонента
`StatusTimeline` в конце страницы (после существующих блоков).

```typescript
import { StatusTimeline } from '@/components/project/status-timeline'
import type { ProjectStatusLogEntry } from '@/types'

// В серверном компоненте добавить после существующих запросов:
const admin = createAdminClient() // если ещё не импортирован
const { data: statusLogRaw } = await admin
  .from('project_status_log')
  .select('id, project_id, old_status, new_status, changed_at, changed_by')
  .eq('project_id', project.id)  // project уже загружен в этом компоненте
  .order('changed_at', { ascending: true })

const statusLog: ProjectStatusLogEntry[] = statusLogRaw ?? []

// В JSX добавить блок (после существующего контента):
<div className="rounded-lg border p-5">
  <h2 className="text-sm font-semibold mb-4">История изменений статуса</h2>
  <StatusTimeline log={statusLog} />
</div>
```

**Важно:** читать существующий файл перед изменением. Не менять существующую логику
дашборда. Добавить `import { createAdminClient } from '@/lib/supabase/admin'` если
его ещё нет в файле. Добавить импорт `ProjectStatusLogEntry` из `@/types`.

### 5. Создать `__tests__/t67.test.ts`

```typescript
// GET /api/project/status-log
// 1.  401 без авторизации (user = null)
// 2.  403 для роли investor
// 3.  403 для роли admin (staff не имеет доступа через этот маршрут)
// 4.  200 + массив log для роли project
// 5.  log пуст если у пользователя нет проекта (project = null → log: [])
// 6.  log содержит записи из project_status_log (id, old_status, new_status, changed_at)
// 7.  записи отсортированы по changed_at ascending

// StatusTimeline (renderToStaticMarkup)
// 8.  рендерится с пустым log — показывает "История изменений статуса пока пуста."
// 9.  рендерится с одной записью — показывает new_status
// 10. рендерится с записью у которой old_status != null — показывает old_status → new_status
// 11. показывает дату changed_at
// 12. показывает порядковый номер записи (1, 2, ...)
// 13. для old_status = null не показывает стрелку "→"
// 14. неизвестный статус отображается как есть (fallback label)
// 15. каждая запись получает правильный CSS-класс по статусу (approved → green)
```

#### Структура тестов

```typescript
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatusTimeline } from '@/components/project/status-timeline'
import type { ProjectStatusLogEntry } from '@/types'

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'project-owner-1' } },
      }),
    },
  })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { role: 'project' },
            error: null,
          }),
        }
      }
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { id: 'project-1' },
            error: null,
          }),
        }
      }
      if (table === 'project_status_log') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'log-1',
                project_id: 'project-1',
                old_status: null,
                new_status: 'submitted',
                changed_at: '2026-06-01T10:00:00Z',
                changed_by: 'project-owner-1',
              },
              {
                id: 'log-2',
                project_id: 'project-1',
                old_status: 'submitted',
                new_status: 'under_review',
                changed_at: '2026-06-02T12:00:00Z',
                changed_by: 'admin-1',
              },
            ],
            error: null,
          }),
        }
      }
      return {}
    }),
  })),
}))

const mockEntry: ProjectStatusLogEntry = {
  id: 'log-1',
  project_id: 'project-1',
  old_status: null,
  new_status: 'submitted',
  changed_at: '2026-06-01T10:00:00Z',
  changed_by: 'project-owner-1',
}

function makeRequest(url = 'http://localhost/api/project/status-log') {
  const { NextRequest } = require('next/server')
  return new NextRequest(url)
}
```

Для API-роутов — прямой вызов `GET(request)`.
Для компонента — `renderToStaticMarkup(<StatusTimeline log={[...]} />)`.

## Файлы для создания / изменения

- `types/index.ts` (добавить `ProjectStatusLogEntry`)
- `app/api/project/status-log/route.ts` (новый)
- `components/project/status-timeline.tsx` (новый)
- `app/(project)/dashboard/page.tsx` (обновить: добавить загрузку statusLog и компонент `StatusTimeline`)
- `__tests__/t67.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Не менять существующую логику дашборда проекта
- Читать существующий `app/(project)/dashboard/page.tsx` перед изменением
- Таблица `project_status_log` уже существует — миграция не нужна
- Доступ к `GET /api/project/status-log` только для роли `project`
  (staff использует прямой запрос к Supabase через adminClient в своих страницах)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t67.test.ts)
4. `GET /api/project/status-log` — 401 без auth, 403 для investor/admin, 200+log для project
5. Компонент `StatusTimeline` рендерит таймлайн с бейджами статусов и датами
6. На странице `/project` (dashboard) отображается блок «История изменений статуса»
7. Пустой лог → сообщение «История изменений статуса пока пуста.»
8. Записать в `progress.md`: `DONE: T67 + что создано/изменено`
