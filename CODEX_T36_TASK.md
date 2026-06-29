# T36 — Повторная подача проекта после отклонения

## Контекст

В T7/T35 реализованы модерация и уведомления. Когда модератор отклоняет проект, владелец
получает уведомление «Проект отклонён», но:

1. **Не видит причину отклонения** — поле `rejection_reason` хранится в БД (в `projects.rejection_reason`),
   но не отображается на дашборде проекта.
2. **Не может повторно подать** — `POST /api/project/submit` принимает только статус `draft`,
   а после отклонения статус становится `rejected`.
3. **Уведомление не содержит причины** — инвестор вынужден заходить в кабинет, но и там её нет.

T36 закрывает этот пробел: владелец видит причину → исправляет → отправляет повторно.

## Что нужно создать / изменить

### 1. Обновить `app/api/project/submit/route.ts`

Изменить проверку допустимых статусов для отправки:

```typescript
// БЫЛО:
if (project.status !== 'draft') {
  return NextResponse.json({ error: 'project already submitted' }, { status: 400 });
}

// СТАЛО — допускаем также статус 'rejected' (повторная подача):
const submittableStatuses = ['draft', 'rejected'];
if (!submittableStatuses.includes(project.status as string)) {
  return NextResponse.json({ error: 'project already submitted' }, { status: 400 });
}
```

При повторной подаче с статуса `rejected`:
- Обновить статус на `submitted`
- Сбросить `rejection_reason = null` и `moderated_by = null`, `moderated_at = null`
- Записать в `project_status_log` (from: `rejected`, to: `submitted`)

Конкретно — обновить update-запрос:

```typescript
const isResubmit = project.status === 'rejected';

const { error: updateError } = await adminSupabase
  .from('projects')
  .update({
    status: 'submitted',
    ...(isResubmit ? { rejection_reason: null, moderated_by: null, moderated_at: null } : {}),
  })
  .eq('id', project.id);
```

Лог статуса — подставлять реальный `from_status`:

```typescript
await adminSupabase
  .from('project_status_log')
  .insert({
    project_id: project.id,
    from_status: project.status, // 'draft' или 'rejected'
    to_status: 'submitted',
    changed_by: user.id,
  });
```

### 2. Обновить `app/(project)/project/page.tsx`

Добавить `rejection_reason` в select-запрос:

```typescript
// БЫЛО:
.select('id,name,status,questionnaire_s1,questionnaire_s5,video_path,created_at')

// СТАЛО:
.select('id,name,status,questionnaire_s1,questionnaire_s5,video_path,created_at,rejection_reason')
```

### 3. Обновить `types/index.ts`

Найти тип `ProjectDashboardData` (или аналогичный) и добавить поле:

```typescript
rejection_reason: string | null
```

Не удалять существующие поля.

### 4. Обновить `app/(project)/project/project-dashboard-client.tsx`

Показать блок причины отклонения когда `project.status === 'rejected'`:

```tsx
{project.status === 'rejected' && (
  <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-2">
    <p className="font-semibold text-red-700">Проект отклонён</p>
    {project.rejection_reason && (
      <p className="text-sm text-red-600">
        <span className="font-medium">Причина: </span>
        {project.rejection_reason}
      </p>
    )}
    <p className="text-sm text-gray-600">
      Исправьте анкету и документы, затем отправьте проект на повторную проверку.
    </p>
    <ResubmitButton />
  </div>
)}
```

Кнопка `ResubmitButton` — клиентский компонент (`'use client'`) внутри того же файла
или как отдельный компонент в той же папке `app/(project)/project/resubmit-button.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'

export default function ResubmitButton() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleResubmit() {
    setLoading(true)
    const res = await fetch('/api/project/submit', { method: 'POST' })
    if (res.ok) {
      router.refresh()
    } else {
      const { error } = await res.json() as { error: string }
      alert(error)
    }
    setLoading(false)
  }

  return (
    <Button onClick={handleResubmit} disabled={loading} variant="destructive" size="sm">
      {loading ? 'Отправка...' : 'Отправить на повторную проверку'}
    </Button>
  )
}
```

### 5. Обновить уведомление в `app/api/admin/projects/[id]/reject/route.ts`

Включить причину в тело уведомления:

```typescript
// БЫЛО:
void createNotification({
  user_id: project.owner_id,
  type: 'project_rejected',
  title: 'Проект отклонён',
  body: `Ваш проект «${project.name}» был отклонён модератором.`,
  link: '/project',
});

// СТАЛО:
void createNotification({
  user_id: project.owner_id,
  type: 'project_rejected',
  title: 'Проект отклонён',
  body: `Ваш проект «${project.name}» был отклонён. Причина: ${rejectionReason.trim()}`,
  link: '/project',
});
```

### 6. Тесты — `__tests__/t36.test.ts`

```typescript
// 1. POST /api/project/submit — 400 если статус 'approved' (нельзя повторно отправить)
// 2. POST /api/project/submit — 200 если статус 'rejected' (повторная подача)
// 3. POST /api/project/submit — при повторной подаче сбрасывает rejection_reason = null
// 4. POST /api/project/submit — при повторной подаче from_status = 'rejected' в логе
// 5. POST /api/project/submit — 200 если статус 'draft' (обычная подача, регрессия)
// 6. POST /api/project/submit — 401 без авторизации
// 7. POST /api/project/submit — 400 если анкета не заполнена (секция s1 отсутствует)
// 8. ProjectDashboardData тип содержит поле rejection_reason
// 9. POST /api/admin/projects/[id]/reject — тело уведомления содержит причину отклонения
// 10. POST /api/admin/projects/[id]/reject — 400 если rejection_reason короче 10 символов (регрессия)
```

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- shadcn/ui компоненты (Button, Card — уже используются)
- Не создавать новые миграции — `rejection_reason` уже есть в `001_initial_schema.sql`
- Не трогать файлы кроме указанных в этом ТЗ
- `ResubmitButton` не блокирует UI — использовать `router.refresh()` после успеха

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t36.test.ts)
4. При `status = 'rejected'` на дашборде проекта виден красный блок с причиной
5. Кнопка «Отправить на повторную проверку» успешно меняет статус `rejected → submitted`
6. После повторной подачи `rejection_reason`, `moderated_by`, `moderated_at` сброшены в null
7. Уведомление при отклонении содержит текст причины
8. Записать в `progress.md`: `DONE: T36 + что создано/изменено`
