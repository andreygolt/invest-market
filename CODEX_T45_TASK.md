# T45 — Причина отклонения заявки менеджером

## Контекст

В T37 реализован кабинет менеджера с обработкой заявок инвесторов.
В T44 менеджеры получают уведомление при поступлении новой заявки.

Когда менеджер нажимает «Отклонить» на странице `/manager/applications/[id]`,
инвестор получает уведомление «Заявка отклонена» — без указания причины
и без имени проекта в тексте. Это создаёт плохой пользовательский опыт:
инвестор не понимает, почему заявка отклонена, и какой именно проект имеется в виду.

T45 исправляет оба пробела:

1. Менеджер может (опционально) указать причину отклонения — она сохраняется в БД
   и отображается в кабинете инвестора под отклонёнными заявками.
2. Уведомление при одобрении и отклонении заявки теперь содержит имя проекта
   (устраняет баг в `app/api/admin/applications/[id]/route.ts`, где `project.name`
   получается из БД, но не используется в тексте уведомления).

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/013_application_rejection_reason.sql`

```sql
-- Аддитивная миграция: добавляем nullable-поле rejection_reason в applications
ALTER TABLE applications ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
```

> Поле nullable — причина отклонения необязательна.
> Миграция только аддитивная — не изменяет существующие строки или политики.

### 2. Обновить `types/index.ts`

Добавить `rejection_reason` в `ApplicationDetail` и `AdminApplicationItem`:

```typescript
export interface ApplicationDetail {
  id: string
  project_id: string
  project_name: string
  amount: number | null
  status: ApplicationStatus
  message: string | null
  rejection_reason: string | null  // добавить
  created_at: string
  updated_at: string
}

export interface AdminApplicationItem {
  id: string
  project_id: string
  project_name: string | null
  investor_id: string
  investor_email: string | null
  amount: number | null
  instrument: string | null
  comment: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  rejection_reason: string | null  // добавить
  created_at: string
}
```

Не трогать остальные типы.

### 3. Обновить `app/api/admin/applications/[id]/route.ts`

#### 3a. Принять `rejection_reason` в теле PATCH-запроса

```typescript
const body = (await request.json()) as { status?: string; rejection_reason?: string }
const newStatus = body.status
const rejectionReason = typeof body.rejection_reason === 'string'
  ? body.rejection_reason.trim()
  : null
```

#### 3b. Сохранить `rejection_reason` при обновлении статуса

```typescript
const { error } = await supabase
  .from('applications')
  .update({
    status: newStatus,
    updated_at: new Date().toISOString(),
    rejection_reason: newStatus === 'rejected' ? (rejectionReason ?? null) : null,
  })
  .eq('id', applicationId)
```

> При статусах кроме `rejected` — поле обнуляется.

#### 3c. Исправить уведомление: включить имя проекта в body

Текущий код получает `project.name` но не использует его (`void project?.name`).
Исправить:

```typescript
if (newStatus === 'approved' || newStatus === 'rejected') {
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', app.project_id)
    .maybeSingle()

  const projectName = project?.name ?? 'проект'

  void createNotification({
    user_id: app.investor_id,
    type: newStatus === 'approved' ? 'application_approved' : 'application_rejected',
    title: newStatus === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена',
    body:
      newStatus === 'approved'
        ? `Ваша заявка на участие в проекте «${projectName}» одобрена.`
        : rejectionReason
          ? `Ваша заявка на участие в проекте «${projectName}» отклонена. Причина: ${rejectionReason}`
          : `Ваша заявка на участие в проекте «${projectName}» отклонена.`,
    link: '/applications',
  })
}
```

### 4. Обновить `app/(manager)/manager/applications/[id]/application-status-updater.tsx`

Добавить textarea для причины отклонения. Показывать её только когда нажата кнопка «Отклонить»
(двухшаговый UX: нажал → появилось поле + подтверждение).

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

interface Props {
  applicationId: string
}

export default function ApplicationStatusUpdater({ applicationId }: Props) {
  const [loading, setLoading] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const router = useRouter()

  async function updateStatus(status: 'approved' | 'rejected' | 'cancelled', reason?: string) {
    setLoading(true)
    const response = await fetch(`/api/admin/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(reason ? { rejection_reason: reason } : {}),
      }),
    })

    if (response.ok) {
      router.refresh()
    } else {
      const body = (await response.json()) as { error?: string }
      alert(body.error ?? 'Ошибка обновления статуса')
    }

    setLoading(false)
  }

  if (showRejectForm) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Причина отклонения (необязательно):</p>
        <textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Укажите причину отклонения заявки..."
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => void updateStatus('rejected', rejectionReason || undefined)}
            disabled={loading}
            variant="destructive"
            size="sm"
          >
            {loading ? 'Отклоняем...' : 'Подтвердить отклонение'}
          </Button>
          <Button
            onClick={() => {
              setShowRejectForm(false)
              setRejectionReason('')
            }}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Отмена
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Изменить статус:</p>
      <div className="flex gap-2">
        <Button onClick={() => void updateStatus('approved')} disabled={loading} size="sm">
          Одобрить
        </Button>
        <Button
          onClick={() => setShowRejectForm(true)}
          disabled={loading}
          variant="destructive"
          size="sm"
        >
          Отклонить
        </Button>
        <Button
          onClick={() => void updateStatus('cancelled')}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          Отменить
        </Button>
      </div>
    </div>
  )
}
```

### 5. Обновить `app/(investor)/applications/applications-client.tsx`

В блоке рендеринга карточки заявки: после message, если `app.status === 'rejected'`
и `app.rejection_reason` задан — показать причину:

```tsx
{app.status === 'rejected' && app.rejection_reason && (
  <p className="text-sm text-muted-foreground">
    <span className="font-medium">Причина отклонения:</span>{' '}
    {app.rejection_reason}
  </p>
)}
```

> Разместить после блока с `app.message`, перед кнопкой «Отозвать заявку».

Также добавить `rejection_reason` в тип `ApplicationDetail`, которым пользуется клиент
(уже сделано в пункте 2).

Для получения `rejection_reason` из API: убедиться, что
`GET /api/investor/applications` возвращает это поле.
Найти маршрут `app/api/investor/applications/route.ts` и добавить
`rejection_reason` в `select(...)`:

```typescript
// В select: добавить rejection_reason
.select('id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)')
```

### 6. Тесты — `__tests__/t45.test.ts`

```typescript
// 1. PATCH /api/admin/applications/[id] — сохраняет rejection_reason при status='rejected'
// 2. PATCH /api/admin/applications/[id] — rejection_reason=null при status='approved'
// 3. PATCH /api/admin/applications/[id] — rejection_reason=null при status='cancelled'
// 4. PATCH /api/admin/applications/[id] — уведомление body содержит project.name при approved
// 5. PATCH /api/admin/applications/[id] — уведомление body содержит project.name при rejected
// 6. PATCH /api/admin/applications/[id] — уведомление body содержит rejection_reason при rejected
// 7. PATCH /api/admin/applications/[id] — уведомление без rejection_reason если не передан
// 8. PATCH /api/admin/applications/[id] — 200 если rejection_reason пустая строка (опциональный)
// 9. PATCH /api/admin/applications/[id] — rejection_reason.trim() применяется
// 10. PATCH /api/admin/applications/[id] — 400 если invalid status (регрессия)
// 11. PATCH /api/admin/applications/[id] — 404 если заявка не найдена (регрессия)
// 12. ApplicationDetail тип содержит поле rejection_reason: string | null
```

### Структура моков для тестов

```typescript
jest.mock('@/lib/notifications/create', () => ({
  createNotification: jest.fn().mockResolvedValue(undefined),
}))

const mockUpdate = jest.fn().mockResolvedValue({ error: null })
const mockProjectMaybeSingle = jest.fn().mockResolvedValue({
  data: { name: 'Тестовый проект' },
  error: null,
})
const mockAppMaybeSingle = jest.fn().mockResolvedValue({
  data: {
    id: 'app-1',
    status: 'pending',
    investor_id: 'investor-1',
    project_id: 'proj-1',
  },
  error: null,
})

jest.mock('@/lib/supabase/admin', () => ({
  createAdminClient: jest.fn(() => ({
    from: jest.fn((table: string) => {
      if (table === 'applications') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          maybeSingle: mockAppMaybeSingle,
        }
      }
      if (table === 'projects') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: mockProjectMaybeSingle,
        }
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        update: mockUpdate,
      }
    }),
  })),
}))

// Подсказка: для теста 1 (сохраняет rejection_reason):
// проверить что mockUpdate вызван с объектом содержащим rejection_reason
// expect(mockUpdate).toHaveBeenCalledWith(
//   expect.objectContaining({ rejection_reason: 'причина' })
// )

// Для теста 4/5 (уведомление с именем проекта):
// expect(mockCreateNotification).toHaveBeenCalledWith(
//   expect.objectContaining({ body: expect.stringContaining('Тестовый проект') })
// )
```

> Важно: в PATCH route `update` вызывается в цепочке `.from('applications').update({...}).eq(...)`.
> Mock `update` должен возвращать `{ then: ..., eq: jest.fn().mockResolvedValue(...) }`
> или использовать `mockReturnThis()` на `.eq()` после `.update()`.

## Файлы для изменения

- `supabase/migrations/013_application_rejection_reason.sql` (новый)
- `types/index.ts` — добавить `rejection_reason` в `ApplicationDetail` и `AdminApplicationItem`
- `app/api/admin/applications/[id]/route.ts` — сохранять rejection_reason + имя проекта в уведомлении
- `app/api/investor/applications/route.ts` — добавить `rejection_reason` в select
- `app/(manager)/manager/applications/[id]/application-status-updater.tsx` — двухшаговый reject с reason
- `app/(investor)/applications/applications-client.tsx` — показать rejection_reason
- `__tests__/t45.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Миграция только аддитивная (ADD COLUMN IF NOT EXISTS)
- `rejection_reason` — опциональное поле (nullable), не required
- Не трогать файлы кроме указанных выше
- Уведомление обновляется только для `approved` и `rejected` статусов (без `cancelled`)
- Ошибка уведомления не должна влиять на HTTP-ответ (fire-and-forget)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t45.test.ts)
4. `PATCH /api/admin/applications/[id]` сохраняет `rejection_reason` при `status=rejected`
5. Уведомление инвестору содержит имя проекта для `approved` и `rejected`
6. При `rejected` с причиной — причина включена в тело уведомления
7. Менеджер видит форму с полем причины перед подтверждением отклонения
8. Инвестор видит причину отклонения под отклонёнными заявками (если указана)
9. Записать в `progress.md`: `DONE: T45 + что создано/изменено`
