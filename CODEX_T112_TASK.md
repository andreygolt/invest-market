# T112 — Заявки инвестора: slate-тема + детальная страница

## Цель

Два связанных улучшения:
1. `app/(investor)/applications/applications-client.tsx` использует старую тёмную тему
   (`bg-[#0a0a0a]`, `bg-slate-900`, `border-slate-800`, `text-white`).
   Весь остальной кабинет инвестора уже на slate-теме — нужно привести в соответствие.
2. Нет детальной страницы заявки: инвестор видит список, но не может открыть одну заявку.
   Нужно добавить GET `/api/investor/applications/[id]` и страницу `/applications/[id]`.

---

## Контекст

- Тип `ApplicationDetail` — в `types/index.ts` (уже есть):
  ```ts
  interface ApplicationDetail {
    id: string;
    project_id: string;
    project_name: string;
    amount: number | null;
    status: ApplicationStatus; // 'pending' | 'reviewing' | 'approved' | 'rejected' | 'cancelled' | 'withdrawn'
    message: string | null;
    rejection_reason: string | null;
    created_at: string;
    updated_at: string;
  }
  ```
- DELETE `/api/investor/applications/[id]` — уже существует (`app/api/investor/applications/[id]/route.ts`)
- GET список `/api/investor/applications?investor_id=xxx` — уже существует
- Slate-тема: `bg-slate-50`, `bg-white`, `border-slate-200`, `text-slate-900/600/500`

---

## Шаг 1 — Обновить `app/(investor)/applications/applications-client.tsx`

**ОБЯЗАТЕЛЬНО прочитать файл перед изменением.**

Заменить только классы цветов — структура JSX не меняется:

### STATUS_CLASSES (заменить полностью):
```tsx
const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  pending:
    'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  reviewing:
    'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  approved:
    'rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700',
  rejected:
    'rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600',
  cancelled:
    'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
  withdrawn:
    'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
};
```

### Loading state:
```tsx
// было:
<div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
  <p className="text-slate-500">Загрузка...</p>
</div>

// стало:
<div className="flex min-h-screen items-center justify-center bg-slate-50">
  <p className="text-slate-500">Загрузка...</p>
</div>
```

### Внешний контейнер return:
```tsx
// было:
<div className="min-h-screen bg-[#0a0a0a]">
  <div className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
    <div className="flex items-center justify-between">
      <h1 className="text-3xl font-bold text-white">Мои заявки</h1>
      <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">

// стало:
<div className="min-h-screen bg-slate-50">
  <div className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-semibold text-slate-900">Мои заявки</h1>
      <Button asChild variant="ghost" size="sm" className="text-slate-500 hover:text-slate-900">
```

### Дисклеймер:
```tsx
// было:
<div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">

// стало:
<div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
```

### Пустое состояние:
```tsx
// было:
<div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
  <p className="text-slate-400">
    Заявок пока нет.{' '}
    <Link href="/catalog" className="text-blue-400 hover:text-blue-300">

// стало:
<div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
  <p className="text-slate-500">
    Заявок пока нет.{' '}
    <Link href="/catalog" className="text-blue-600 hover:text-blue-700">
```

### Карточка заявки:
```tsx
// было:
<div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900 p-5">
  ...
  <Link href={`/deals/${app.project_id}`} className="text-base font-semibold text-white hover:text-slate-300">
  ...
  <p className="mt-0.5 text-xs text-slate-600">
  ...
  <p className="text-sm text-slate-300">
    <span className="text-slate-500">Сумма:</span>
  ...
  <p className="line-clamp-3 text-sm text-slate-500">{app.message}</p>
  ...
  <p className="text-sm text-slate-500">
    <span className="text-slate-400">Причина отклонения:</span>
  ...
  <Button variant="ghost" size="sm" className="px-0 text-red-400 hover:text-red-300"

// стало:
<div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
  ...
  <Link href={`/deals/${app.project_id}`} className="text-base font-semibold text-slate-900 hover:text-slate-700">
  ...
  <p className="mt-0.5 text-xs text-slate-500">
  ...
  <p className="text-sm text-slate-700">
    <span className="text-slate-500">Сумма:</span>
  ...
  <p className="line-clamp-3 text-sm text-slate-600">{app.message}</p>
  ...
  <p className="text-sm text-slate-600">
    <span className="text-slate-500">Причина отклонения:</span>
  ...
  <Button variant="ghost" size="sm" className="px-0 text-red-600 hover:text-red-700"
```

Также добавить ссылку «Подробнее» на карточку (ведёт на `/applications/[id]`):
```tsx
// Добавить внутрь карточки, после status badge, рядом с названием проекта:
<Link
  href={`/applications/${app.id}`}
  className="text-xs text-slate-500 hover:text-slate-700 underline"
>
  Подробнее
</Link>
```

---

## Шаг 2 — API GET `/api/investor/applications/[id]`

**Файл:** `app/api/investor/applications/[id]/route.ts` — уже существует (содержит только DELETE).
**ОБЯЗАТЕЛЬНО прочитать файл перед изменением.**

Добавить функцию `GET` в начало файла (перед `DELETE`):

```typescript
// GET /api/investor/applications/[id]?investor_id=xxx
// Возвращает одну заявку инвестора
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: applicationId } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('applications')
    .select(
      'id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)'
    )
    .eq('id', applicationId)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  type ProjectJoin = { name: string } | { name: string }[] | null;
  function getProjectName(projects: ProjectJoin) {
    return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
  }

  const result: ApplicationDetail = {
    id: data.id,
    project_id: data.project_id,
    project_name: getProjectName(data.projects as ProjectJoin),
    amount: data.amount,
    status: data.status,
    message: data.message,
    rejection_reason: data.rejection_reason,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return NextResponse.json(result);
}
```

Добавить импорт `ApplicationDetail` из `@/types` если его ещё нет в файле (проверить перед добавлением).

---

## Шаг 3 — Страница `/applications/[id]`

**Создать новый файл:** `app/(investor)/applications/[id]/page.tsx`

Серверный компонент. Загружает заявку напрямую через Supabase (не через fetch).

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { ApplicationDetail, ApplicationStatus } from '@/types';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'На рассмотрении',
  reviewing: 'Изучается',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  cancelled: 'Отменена',
  withdrawn: 'Отозвана',
};

const STATUS_CLASSES: Record<ApplicationStatus, string> = {
  pending: 'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  reviewing: 'rounded-md bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700',
  approved: 'rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs text-emerald-700',
  rejected: 'rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600',
  cancelled: 'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
  withdrawn: 'rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-xs text-slate-500',
};

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('applications')
    .select(
      'id, project_id, amount, status, message, rejection_reason, created_at, updated_at, projects(name)'
    )
    .eq('id', id)
    .eq('investor_id', user.id)
    .maybeSingle();

  if (!data) notFound();

  type ProjectJoin = { name: string } | { name: string }[] | null;
  function getProjectName(projects: ProjectJoin) {
    return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
  }

  const app: ApplicationDetail = {
    id: data.id,
    project_id: data.project_id,
    project_name: getProjectName(data.projects as ProjectJoin),
    amount: data.amount,
    status: data.status as ApplicationStatus,
    message: data.message,
    rejection_reason: data.rejection_reason,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/applications"
          className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
        >
          ← Все заявки
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              <Link
                href={`/deals/${app.project_id}`}
                className="hover:text-slate-700 transition-colors"
              >
                {app.project_name}
              </Link>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Заявка от {new Date(app.created_at).toLocaleDateString('ru-RU')}
            </p>
          </div>
          <span className={STATUS_CLASSES[app.status]}>{STATUS_LABELS[app.status]}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {app.amount !== null && (
            <div className="py-3 flex justify-between text-sm">
              <span className="text-slate-500">Сумма интереса</span>
              <span className="text-slate-900 font-medium">
                {new Intl.NumberFormat('ru-RU', {
                  style: 'currency',
                  currency: 'RUB',
                  maximumFractionDigits: 0,
                }).format(app.amount)}
              </span>
            </div>
          )}
          <div className="py-3 flex justify-between text-sm">
            <span className="text-slate-500">Статус</span>
            <span className="text-slate-900">{STATUS_LABELS[app.status]}</span>
          </div>
          <div className="py-3 flex justify-between text-sm">
            <span className="text-slate-500">Обновлено</span>
            <span className="text-slate-900">
              {new Date(app.updated_at).toLocaleString('ru-RU')}
            </span>
          </div>
        </div>

        {app.message && (
          <div>
            <h2 className="text-sm font-medium text-slate-700 mb-2">Ваше сообщение</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{app.message}</p>
          </div>
        )}

        {app.status === 'rejected' && app.rejection_reason && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h2 className="text-sm font-medium text-red-700 mb-1">Причина отклонения</h2>
            <p className="text-sm text-red-600">{app.rejection_reason}</p>
          </div>
        )}

        <div className="pt-2 flex gap-3">
          <Link
            href={`/deals/${app.project_id}`}
            className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
          >
            Открыть проект →
          </Link>
        </div>
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Заявки носят ознакомительный характер. Сделки заключаются вне платформы.
        Доходность не гарантируется.
      </p>
    </div>
  );
}
```

---

## Ограничения

- НЕ трогать `types/index.ts` — все типы уже есть
- НЕ трогать `app/(investor)/applications/page.tsx` — только импортирует клиент
- НЕ трогать `middleware.ts`
- НЕ трогать `app/(investor)/layout.tsx`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания / изменения

| Файл | Действие |
|------|----------|
| `app/(investor)/applications/applications-client.tsx` | ИЗМЕНИТЬ — миграция на slate-тему |
| `app/api/investor/applications/[id]/route.ts` | ИЗМЕНИТЬ — добавить GET |
| `app/(investor)/applications/[id]/page.tsx` | СОЗДАТЬ — детальная страница |

**Новых тестовых файлов: 0** (GET route тривиален, страница без бизнес-логики)

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
3. `/applications` — список заявок в slate-теме (белый фон, серые бордеры)
4. `/applications/[id]` — открывается страница с деталями заявки
5. Чужая заявка (не совпадает `investor_id`) — возвращает 404
6. Дисклеймер присутствует на странице деталей
7. Записать в progress.md: `DONE: T112` + что создано/изменено

---

## Формат отчёта

```
DONE: T112
- изменён app/(investor)/applications/applications-client.tsx: миграция тёмной темы → slate (bg-white, border-slate-200, text-slate-900), добавлена ссылка «Подробнее» на карточках
- изменён app/api/investor/applications/[id]/route.ts: добавлен GET (одна заявка инвестора с проверкой owner)
- создан app/(investor)/applications/[id]/page.tsx: серверный компонент, детальный просмотр заявки с дисклеймером
```
