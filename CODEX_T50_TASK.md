# T50 — Admin: журнал действий (audit log)

## Контекст

После T48 (broadcast-уведомления) и T49 (CSV-экспорт) панель администратора содержит
богатый набор инструментов управления. Однако до сих пор нет способа проследить,
кто и когда совершил ключевые административные действия:
- одобрил или отклонил проект
- изменил статус заявки инвестора
- отправил broadcast-уведомление
- пригласил нового пользователя
- изменил роль или заблокировал пользователя

Это создаёт риски для платформы: при спорной ситуации невозможно восстановить хронологию.

T50 добавляет таблицу `admin_audit_log` и записывает в неё ключевые действия admin/moderator,
а также страницу `/admin/audit-log` для просмотра истории с фильтрацией.

**Принцип:** запись в лог производится fire-and-forget (не блокирует основной запрос).
Используется `createAdminClient()` для записи в обход RLS.

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/020_admin_audit_log.sql`

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Только admin и superadmin могут читать лог
CREATE POLICY "admin_audit_log_select" ON admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

-- Вставка только через service role (adminClient) — не через RLS
-- Политика INSERT не создаётся намеренно: только admin-клиент пишет в лог.
```

### 2. Обновить `types/index.ts`

Добавить тип строки лога и тип действия:

```typescript
export type AuditAction =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'broadcast_sent'
  | 'invite_created'
  | 'user_role_changed'

export interface AuditLogRow {
  id: string
  actor_id: string
  actor_email: string | null
  action: AuditAction
  entity_type: string
  entity_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogInsert {
  actor_id: string
  actor_email?: string | null
  action: AuditAction
  entity_type: string
  entity_id?: string | null
  meta?: Record<string, unknown> | null
}
```

### 3. Создать `lib/audit/log.ts`

Единственная функция для записи в лог — используется из API-роутов:

```typescript
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditLogInsert } from '@/types'

export async function writeAuditLog(entry: AuditLogInsert): Promise<void> {
  const admin = createAdminClient()
  await admin.from('admin_audit_log').insert(entry)
}
```

### 4. Добавить вызовы `writeAuditLog` в существующие роуты

Вставить fire-and-forget вызов (без await, без обработки ошибки — лог не должен ломать основной флоу):

#### `app/api/admin/projects/[id]/approve/route.ts`

После успешного обновления статуса проекта добавить:

```typescript
void writeAuditLog({
  actor_id: user.id,
  actor_email: user.email,
  action: 'project_approved',
  entity_type: 'project',
  entity_id: params.id,
})
```

#### `app/api/admin/projects/[id]/reject/route.ts`

После успешного обновления статуса:

```typescript
void writeAuditLog({
  actor_id: user.id,
  actor_email: user.email,
  action: 'project_rejected',
  entity_type: 'project',
  entity_id: params.id,
  meta: { reason },  // reason — переменная с причиной отклонения, если есть в роуте
})
```

#### `app/api/admin/applications/[id]/route.ts`

После обновления статуса заявки (в PATCH-обработчике):

```typescript
void writeAuditLog({
  actor_id: user.id,
  actor_email: user.email,
  action: status === 'approved' ? 'application_approved' : 'application_rejected',
  entity_type: 'application',
  entity_id: params.id,
  meta: { status, rejection_reason },
})
```

#### `app/api/admin/notifications/broadcast/route.ts`

После успешной вставки уведомлений:

```typescript
void writeAuditLog({
  actor_id: user.id,
  actor_email: user.email,
  action: 'broadcast_sent',
  entity_type: 'notification',
  meta: { target_role, title, recipient_count: profiles?.length ?? 0 },
})
```

#### `app/api/admin/invites/route.ts`

После успешного создания инвайта (в POST):

```typescript
void writeAuditLog({
  actor_id: user.id,
  actor_email: user.email,
  action: 'invite_created',
  entity_type: 'invite',
  entity_id: invite?.id,
  meta: { role, email },
})
```

### 5. Создать `app/api/admin/audit-log/route.ts`

Доступ: только `admin` и `superadmin`. Поддерживает фильтрацию по `action` и пагинацию (`page`, `limit`).

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AuditLogRow } from '@/types'

const PAGE_SIZE = 20

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const action = searchParams.get('action') ?? undefined
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? String(PAGE_SIZE))))
  const offset = (page - 1) * limit

  const admin = createAdminClient()
  let query = admin
    .from('admin_audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) {
    query = query.eq('action', action)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 })

  return NextResponse.json({
    rows: (data ?? []) as AuditLogRow[],
    total: count ?? 0,
    page,
    limit,
  })
}
```

### 6. Создать `app/(admin)/audit-log/page.tsx`

Серверный компонент — проверяет роль, рендерит клиентский компонент.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AuditLogClient from './audit-log-client'

export default async function AdminAuditLogPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    redirect('/')
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Журнал действий</h1>
      <AuditLogClient />
    </div>
  )
}
```

### 7. Создать `app/(admin)/audit-log/audit-log-client.tsx`

Клиентский компонент: таблица с записями лога, фильтр по типу действия, кнопки пагинации.

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import type { AuditLogRow, AuditAction } from '@/types'

const ACTION_LABELS: Record<AuditAction, string> = {
  project_approved: 'Проект одобрен',
  project_rejected: 'Проект отклонён',
  application_approved: 'Заявка одобрена',
  application_rejected: 'Заявка отклонена',
  broadcast_sent: 'Объявление отправлено',
  invite_created: 'Инвайт создан',
  user_role_changed: 'Роль изменена',
}

const PAGE_SIZE = 20

interface AuditResponse {
  rows: AuditLogRow[]
  total: number
  page: number
  limit: number
}

export default function AuditLogClient() {
  const [rows, setRows] = useState<AuditLogRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [action, setAction] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLog = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      })
      if (action) params.set('action', action)
      const res = await fetch(`/api/admin/audit-log?${params.toString()}`)
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Ошибка загрузки лога')
        return
      }
      const data = (await res.json()) as AuditResponse
      setRows(data.rows)
      setTotal(data.total)
    } catch {
      setError('Ошибка загрузки лога')
    } finally {
      setLoading(false)
    }
  }, [page, action])

  useEffect(() => {
    void fetchLog()
  }, [fetchLog])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          className="rounded-md border px-3 py-1.5 text-sm"
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            setPage(1)
          }}
        >
          <option value="">Все действия</option>
          {(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a]}</option>
          ))}
        </select>
        <span className="text-sm text-gray-500">Всего: {total}</span>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Дата</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Действие</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Объект</th>
              <th className="px-4 py-2 text-left font-medium text-gray-600">Исполнитель</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Загрузка...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  Записей нет
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                    {new Date(row.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {ACTION_LABELS[row.action] ?? row.action}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {row.entity_type}
                    {row.entity_id ? ` #${row.entity_id.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {row.actor_email ?? row.actor_id.slice(0, 8)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Назад
          </Button>
          <span className="text-sm text-gray-600">
            Страница {page} из {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Вперёд
          </Button>
        </div>
      )}
    </div>
  )
}
```

### 8. Обновить `app/(admin)/layout.tsx`

Добавить пункт «Журнал» в навигацию (после «Экспорт», не изменяя остальное):

```tsx
<Link href="/admin/audit-log" className="hover:text-foreground">
  Журнал
</Link>
```

### 9. Тесты — `__tests__/t50.test.ts`

```typescript
// 1. writeAuditLog — вызывает adminClient.from('admin_audit_log').insert с переданными данными
// 2. writeAuditLog — не бросает исключение при ошибке БД (fire-and-forget)
// 3. GET /api/admin/audit-log — 401 без авторизации
// 4. GET /api/admin/audit-log — 403 для роли investor
// 5. GET /api/admin/audit-log — 200 и { rows, total, page, limit } для admin
// 6. GET /api/admin/audit-log — 200 и { rows, total, page, limit } для superadmin
// 7. GET /api/admin/audit-log — фильтр action передаётся в запрос к БД
// 8. GET /api/admin/audit-log — пагинация: page=2 → offset=20
// 9. GET /api/admin/audit-log — limit ограничен до 100
// 10. GET /api/admin/audit-log — page не может быть меньше 1
// 11. AuditLogRow тип содержит поля id, actor_id, action, entity_type, created_at
// 12. AuditAction содержит 'project_approved'
// 13. AuditAction содержит 'broadcast_sent'
// 14. AuditLogInsert не требует entity_id и meta (optional)
// 15. GET /api/admin/audit-log — возвращает пустой массив rows если данных нет
```

#### Структура моков

```typescript
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'admin-1', email: 'admin@test.com' } },
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { role: 'admin' },
        error: null,
      }),
    })),
  })),
}))

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockResolvedValue({ error: null }),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockResolvedValue({
        data: [],
        error: null,
        count: 0,
      }),
    })),
  })),
}))
```

## Файлы для изменения / создания

- `supabase/migrations/020_admin_audit_log.sql` (новый) — таблица + RLS
- `types/index.ts` — добавить `AuditAction`, `AuditLogRow`, `AuditLogInsert`
- `lib/audit/log.ts` (новый) — функция `writeAuditLog`
- `app/api/admin/projects/[id]/approve/route.ts` — добавить вызов `writeAuditLog`
- `app/api/admin/projects/[id]/reject/route.ts` — добавить вызов `writeAuditLog`
- `app/api/admin/applications/[id]/route.ts` — добавить вызов `writeAuditLog` в PATCH
- `app/api/admin/notifications/broadcast/route.ts` — добавить вызов `writeAuditLog`
- `app/api/admin/invites/route.ts` — добавить вызов `writeAuditLog` в POST
- `app/api/admin/audit-log/route.ts` (новый) — GET с фильтрацией и пагинацией
- `app/(admin)/audit-log/page.tsx` (новый) — серверная страница
- `app/(admin)/audit-log/audit-log-client.tsx` (новый) — клиентский компонент
- `app/(admin)/layout.tsx` — добавить пункт «Журнал» в навигацию
- `__tests__/t50.test.ts` (новый) — тесты

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Миграция только аддитивная (новая таблица)
- RLS обязателен на `admin_audit_log`
- Запись в лог — всегда fire-and-forget: `void writeAuditLog(...)` без await
- Читать лог только через `createAdminClient()` (обход RLS, так как SELECT-политика требует проверки роли, которую делает API)
- Не трогать файлы кроме указанных выше

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t50.test.ts)
4. `GET /api/admin/audit-log` — возвращает `{ rows, total, page, limit }` для admin/superadmin
5. `GET /api/admin/audit-log?action=project_approved` — фильтрует по action
6. `lib/audit/log.ts` экспортирует `writeAuditLog` и не бросает исключений
7. Страница `/admin/audit-log` доступна admin/superadmin, содержит таблицу и пагинацию
8. В навигации admin-панели есть пункт «Журнал»
9. При approve/reject проектов и заявок вызывается `writeAuditLog` (fire-and-forget)
10. Записать в `progress.md`: `DONE: T50 + что создано/изменено`
