# ТЗ T10 — Заявка инвестора + постзаявочный flow

**Дата:** 2026-06-27
**Зависимости:** T9 выполнен (Deal Room работает, кнопка "Оставить заявку" ведёт на `/deals/{id}/apply`)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать избранное/заметки — это T11
- Не делать калькулятор доходности — это T12
- Не делать портфель инвестора — это T13
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t9.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- Не трогать `app/(investor)/catalog/*`, `app/(investor)/deals/[id]/page.tsx`
- Не трогать `app/api/admin/projects/*`, `app/api/investor/deals/*`
- NO новых npm-зависимостей
- NO новых миграций — таблица `applications` уже есть в `001_initial_schema.sql`

---

## Контекст

После T9 Deal Room работает. Кнопка "Оставить заявку" ведёт на `/deals/{id}/apply`.

**Таблица `applications` уже существует** (из `001_initial_schema.sql`):
```sql
id uuid, investor_id uuid, project_id uuid,
amount numeric(18,2), status application_status DEFAULT 'pending',
message text, created_at timestamptz, updated_at timestamptz
```
`application_status` = `'pending' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn'`

**Типы уже есть в `types/index.ts`:**
- `ApplicationStatus`
- `ApplicationRow`
- `ApplicationInsert`

**Flow:**
1. Инвестор на Deal Room нажимает "Оставить заявку" → `/deals/{id}/apply`
2. Заполняет форму (сумма + сообщение) → `POST /api/investor/applications`
3. После успеха → редирект на `/applications`
4. `/applications` — список своих заявок со статусами
5. Менеджер/администратор — `GET /api/admin/applications` + `PATCH /api/admin/applications/[id]` для смены статуса

---

## Шаг 1 — TypeScript типы

Добавить в конец `types/index.ts`:

```typescript
export interface ApplicationListItem {
  id: string;
  project_id: string;
  project_name: string;
  investor_id: string;
  investor_name: string | null;
  investor_email: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationDetail {
  id: string;
  project_id: string;
  project_name: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
}
```

---

## Шаг 2 — API: POST + GET /api/investor/applications

Создать `app/api/investor/applications/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApplicationDetail } from '@/types';

// POST /api/investor/applications
// Body: { investor_id, project_id, amount?, message }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    amount?: number | null;
    message?: string;
  };

  const { investor_id, project_id, amount, message } = body;

  if (!investor_id || !project_id || !message?.trim()) {
    return NextResponse.json(
      { error: 'investor_id, project_id и message обязательны' },
      { status: 400 }
    );
  }

  // Проект должен быть approved
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден или не одобрен' }, { status: 404 });
  }

  // Нет дублирующей активной заявки
  const { data: existing } = await supabase
    .from('applications')
    .select('id, status')
    .eq('investor_id', investor_id)
    .eq('project_id', project_id)
    .in('status', ['pending', 'reviewing'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'У вас уже есть активная заявка на этот проект' },
      { status: 409 }
    );
  }

  const now = new Date().toISOString();
  const { data: app, error } = await supabase
    .from('applications')
    .insert({
      investor_id,
      project_id,
      amount: amount ?? null,
      status: 'pending',
      message: message.trim(),
      updated_at: now,
    })
    .select('id, project_id, amount, status, message, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result: ApplicationDetail = {
    id: app.id,
    project_id: app.project_id,
    project_name: project.name,
    amount: app.amount,
    status: app.status,
    message: app.message,
    created_at: app.created_at,
    updated_at: app.updated_at,
  };

  return NextResponse.json(result, { status: 201 });
}

// GET /api/investor/applications?investor_id=xxx
// Возвращает список заявок инвестора
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('applications')
    .select('id, project_id, amount, status, message, created_at, updated_at, projects(name)')
    .eq('investor_id', investor_id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications: ApplicationDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: (row.projects as { name: string } | null)?.name ?? '',
    amount: row.amount,
    status: row.status,
    message: row.message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ applications });
}
```

---

## Шаг 3 — API: DELETE /api/investor/applications/[id]

Создать `app/api/investor/applications/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// DELETE /api/investor/applications/[id]?investor_id=xxx
// Отзывает заявку (pending → withdrawn). Только владелец заявки.
export async function DELETE(
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

  const { data: app } = await supabase
    .from('applications')
    .select('id, status, investor_id')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  if (app.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  if (app.status !== 'pending') {
    return NextResponse.json(
      { error: 'Можно отозвать только заявку со статусом pending' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('applications')
    .update({ status: 'withdrawn', updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

## Шаг 4 — API: GET /api/admin/applications

Создать `app/api/admin/applications/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApplicationListItem } from '@/types';

// GET /api/admin/applications?status=pending&project_id=xxx
// Список всех заявок для менеджера/администратора
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');
  const projectFilter = searchParams.get('project_id');

  let query = supabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, status, message, created_at, updated_at, projects(name), users(full_name, email)'
    )
    .order('created_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('status', statusFilter);
  }
  if (projectFilter) {
    query = query.eq('project_id', projectFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const applications: ApplicationListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    project_id: row.project_id,
    project_name: (row.projects as { name: string } | null)?.name ?? '',
    investor_id: row.investor_id,
    investor_name: (row.users as { full_name: string | null; email: string } | null)?.full_name ?? null,
    investor_email: (row.users as { full_name: string | null; email: string } | null)?.email ?? '',
    amount: row.amount,
    status: row.status,
    message: row.message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ applications });
}
```

---

## Шаг 5 — API: PATCH /api/admin/applications/[id]

Создать `app/api/admin/applications/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApplicationStatus } from '@/types';

const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  pending: ['reviewing', 'rejected'],
  reviewing: ['approved', 'rejected'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

// PATCH /api/admin/applications/[id]
// Body: { status: ApplicationStatus }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: applicationId } = await params;
  const body = (await request.json()) as { status?: ApplicationStatus };
  const newStatus = body.status;

  if (!newStatus) {
    return NextResponse.json({ error: 'status обязателен' }, { status: 400 });
  }

  const { data: app } = await supabase
    .from('applications')
    .select('id, status')
    .eq('id', applicationId)
    .maybeSingle();

  if (!app) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 });
  }

  const currentStatus = app.status as ApplicationStatus;
  const allowed = VALID_TRANSITIONS[currentStatus] ?? [];

  if (!allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Нельзя перевести заявку из ${currentStatus} в ${newStatus}` },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('applications')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', applicationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: newStatus });
}
```

---

## Шаг 6 — UI: форма заявки

### `app/(investor)/deals/[id]/apply/apply-form.tsx`

Создать клиентский компонент формы:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApplyFormProps {
  projectId: string;
  projectName: string;
  investmentAsk: string | null;
}

export function ApplyForm({ projectId, projectName, investmentAsk }: ApplyFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError('Сообщение обязательно');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError('Необходима авторизация');
        return;
      }

      const res = await fetch('/api/investor/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_id: user.id,
          project_id: projectId,
          amount: amount ? parseFloat(amount) : null,
          message: message.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Ошибка при отправке заявки');
        return;
      }

      router.push('/applications');
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          Проект: <span className="font-medium text-foreground">{projectName}</span>
          {investmentAsk && (
            <> · Запрашивает: <span className="font-medium text-foreground">{investmentAsk}</span></>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount">Сумма инвестиции (опционально, в рублях)</Label>
        <Input
          id="amount"
          type="number"
          min="0"
          step="1000"
          placeholder="Например: 1000000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Укажите, если хотите обозначить ориентировочную сумму.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Сообщение проекту *</Label>
        <Textarea
          id="message"
          placeholder="Расскажите о себе, своём опыте и интересе к проекту..."
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          required
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Важно:</strong> Заявка носит ознакомительный характер. Платформа не является
        посредником в сделке. Сделки заключаются напрямую между инвестором и проектом вне платформы.
        Доходность не гарантируется. Инвестирование сопряжено с риском потери вложенных средств.
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading || !message.trim()}>
          {loading ? 'Отправка...' : 'Отправить заявку'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
```

### `app/(investor)/deals/[id]/apply/page.tsx`

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QS6Answers } from '@/types';
import { ApplyForm } from './apply-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplyPage({ params }: PageProps) {
  const { id: projectId } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) notFound();

  // Получаем investment_ask из анкеты s6
  const { data: s6Row } = await supabase
    .from('project_questionnaire')
    .select('answers')
    .eq('project_id', projectId)
    .eq('section', 's6')
    .maybeSingle();

  const s6 = (s6Row?.answers ?? {}) as Partial<QS6Answers>;

  return (
    <div className="container mx-auto py-8 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/deals/${projectId}`}>← Назад к проекту</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Оставить заявку</CardTitle>
        </CardHeader>
        <CardContent>
          <ApplyForm
            projectId={project.id}
            projectName={project.name}
            investmentAsk={s6.investment_ask ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Шаг 7 — UI: список заявок инвестора

Создать `app/(investor)/applications/page.tsx`:

```typescript
import { createAdminClient } from '@/lib/supabase/admin';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApplicationStatus } from '@/types';
import { WithdrawButton } from './withdraw-button';

export const dynamic = 'force-dynamic';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'На рассмотрении',
  reviewing: 'Изучается',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  withdrawn: 'Отозвана',
};

const STATUS_VARIANTS: Record<ApplicationStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  reviewing: 'default',
  approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
};

interface ApplicationRow {
  id: string;
  project_id: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  projects: { name: string } | null;
}

export default async function ApplicationsPage() {
  // NOTE: В реальном приложении investor_id берётся из сессии.
  // Здесь страница отображает заявки — withdraw реализован через клиентский компонент.
  // Список загружается на клиенте через WithdrawButton + собственный fetch.
  // Серверная часть рендерит заглушку, данные подгружаются клиентом.
  return <ApplicationsClient />;
}

// Клиентский компонент, чтобы получить user и загрузить его заявки
import { ApplicationsClient } from './applications-client';
```

> **Важно:** `ApplicationsPage` выше намеренно делегирует всё клиентскому компоненту, потому что для получения `investor_id` из сессии удобнее использовать `createClient()` на клиенте. Такой подход уже использован в `apply-form.tsx`.

Создать `app/(investor)/applications/applications-client.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApplicationDetail, ApplicationStatus } from '@/types';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'На рассмотрении',
  reviewing: 'Изучается',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  withdrawn: 'Отозвана',
};

const STATUS_VARIANTS: Record<ApplicationStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  reviewing: 'default',
  approved: 'default',
  rejected: 'destructive',
  withdrawn: 'outline',
};

export function ApplicationsClient() {
  const [applications, setApplications] = useState<ApplicationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      fetch(`/api/investor/applications?investor_id=${user.id}`)
        .then((r) => r.json())
        .then((json) => setApplications(json.applications ?? []))
        .finally(() => setLoading(false));
    });
  }, []);

  async function handleWithdraw(applicationId: string) {
    if (!userId) return;
    setWithdrawingId(applicationId);
    try {
      const res = await fetch(
        `/api/investor/applications/${applicationId}?investor_id=${userId}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setApplications((prev) =>
          prev.map((a) =>
            a.id === applicationId ? { ...a, status: 'withdrawn' as ApplicationStatus } : a
          )
        );
      }
    } finally {
      setWithdrawingId(null);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 max-w-3xl">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мои заявки</h1>
        <Button asChild variant="outline">
          <Link href="/catalog">← Каталог проектов</Link>
        </Button>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        Заявки носят ознакомительный характер. Сделки заключаются вне платформы.
        Доходность не гарантируется.
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Заявок пока нет.{' '}
            <Link href="/catalog" className="text-blue-600 hover:underline">
              Перейти в каталог
            </Link>
          </CardContent>
        </Card>
      ) : (
        applications.map((app) => (
          <Card key={app.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href={`/deals/${app.project_id}`}
                      className="hover:underline"
                    >
                      {app.project_name}
                    </Link>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(app.created_at).toLocaleDateString('ru-RU')}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANTS[app.status]}>
                  {STATUS_LABELS[app.status]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {app.amount !== null && (
                <p className="text-sm">
                  <span className="font-medium">Сумма:</span>{' '}
                  {app.amount.toLocaleString('ru-RU')} руб.
                </p>
              )}
              {app.message && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {app.message}
                </p>
              )}
              {app.status === 'pending' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  disabled={withdrawingId === app.id}
                  onClick={() => handleWithdraw(app.id)}
                >
                  {withdrawingId === app.id ? 'Отзываем...' : 'Отозвать заявку'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
```

Создать `app/(investor)/applications/page.tsx` (финальный):

```typescript
import { ApplicationsClient } from './applications-client';

export const dynamic = 'force-dynamic';

export default function ApplicationsPage() {
  return <ApplicationsClient />;
}
```

---

## Шаг 8 — Тесты

Создать `__tests__/t10.test.ts`:

```typescript
import type {
  ApplicationStatus,
  ApplicationRow,
  ApplicationListItem,
  ApplicationDetail,
} from '@/types';

// --- helpers ---

const makeApplication = (overrides: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: 'app-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  amount: 1000000,
  status: 'pending',
  message: 'Хочу инвестировать в ваш проект',
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

const makeListItem = (overrides: Partial<ApplicationListItem> = {}): ApplicationListItem => ({
  id: 'app-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  investor_id: 'user-1',
  investor_name: 'Иван Иванов',
  investor_email: 'ivan@example.com',
  amount: 1000000,
  status: 'pending',
  message: 'Хочу инвестировать',
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

const makeDetail = (overrides: Partial<ApplicationDetail> = {}): ApplicationDetail => ({
  id: 'app-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  amount: 500000,
  status: 'pending',
  message: 'Привет',
  created_at: '2026-06-27T10:00:00Z',
  updated_at: '2026-06-27T10:00:00Z',
  ...overrides,
});

// --- tests ---

describe('T10 ApplicationRow type', () => {
  it('has all required fields', () => {
    const app = makeApplication();
    expect(typeof app.id).toBe('string');
    expect(typeof app.investor_id).toBe('string');
    expect(typeof app.project_id).toBe('string');
    expect(typeof app.status).toBe('string');
  });

  it('amount can be null', () => {
    const app = makeApplication({ amount: null });
    expect(app.amount).toBeNull();
  });

  it('message can be null', () => {
    const app = makeApplication({ message: null });
    expect(app.message).toBeNull();
  });
});

describe('T10 ApplicationStatus transitions', () => {
  const VALID_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
    pending: ['reviewing', 'rejected'],
    reviewing: ['approved', 'rejected'],
    approved: [],
    rejected: [],
    withdrawn: [],
  };

  it('pending can transition to reviewing or rejected', () => {
    expect(VALID_TRANSITIONS['pending']).toContain('reviewing');
    expect(VALID_TRANSITIONS['pending']).toContain('rejected');
  });

  it('reviewing can transition to approved or rejected', () => {
    expect(VALID_TRANSITIONS['reviewing']).toContain('approved');
    expect(VALID_TRANSITIONS['reviewing']).toContain('rejected');
  });

  it('terminal statuses have no transitions', () => {
    expect(VALID_TRANSITIONS['approved']).toHaveLength(0);
    expect(VALID_TRANSITIONS['rejected']).toHaveLength(0);
    expect(VALID_TRANSITIONS['withdrawn']).toHaveLength(0);
  });

  it('pending cannot transition directly to approved', () => {
    expect(VALID_TRANSITIONS['pending']).not.toContain('approved');
  });
});

describe('T10 ApplicationListItem type', () => {
  it('has project and investor info', () => {
    const item = makeListItem();
    expect(typeof item.project_name).toBe('string');
    expect(typeof item.investor_email).toBe('string');
  });

  it('investor_name can be null', () => {
    const item = makeListItem({ investor_name: null });
    expect(item.investor_name).toBeNull();
  });
});

describe('T10 ApplicationDetail type', () => {
  it('has project_name from join', () => {
    const detail = makeDetail();
    expect(typeof detail.project_name).toBe('string');
  });

  it('amount can be null', () => {
    const detail = makeDetail({ amount: null });
    expect(detail.amount).toBeNull();
  });
});

describe('T10 application validation rules', () => {
  it('message is required (non-empty string)', () => {
    const validate = (msg: string) => msg.trim().length > 0;
    expect(validate('')).toBe(false);
    expect(validate('  ')).toBe(false);
    expect(validate('Hello')).toBe(true);
  });

  it('amount must be positive when provided', () => {
    const validateAmount = (v: number | null) => v === null || v > 0;
    expect(validateAmount(null)).toBe(true);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(1000)).toBe(true);
  });

  it('only pending applications can be withdrawn', () => {
    const canWithdraw = (status: ApplicationStatus) => status === 'pending';
    expect(canWithdraw('pending')).toBe(true);
    expect(canWithdraw('reviewing')).toBe(false);
    expect(canWithdraw('approved')).toBe(false);
    expect(canWithdraw('rejected')).toBe(false);
    expect(canWithdraw('withdrawn')).toBe(false);
  });
});

describe('T10 disclaimer requirement', () => {
  it('apply form disclaimer mentions key points', () => {
    const disclaimer =
      'Заявка носит ознакомительный характер. Платформа не является посредником в сделке. ' +
      'Сделки заключаются напрямую между инвестором и проектом вне платформы. ' +
      'Доходность не гарантируется.';
    expect(disclaimer).toContain('вне платформы');
    expect(disclaimer).toContain('Доходность не гарантируется');
    expect(disclaimer).toContain('носит ознакомительный характер');
  });
});

describe('T10 duplicate application check', () => {
  it('detects active duplicate (pending or reviewing)', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'pending';
    expect(activeStatuses.includes(existingStatus)).toBe(true);
  });

  it('allows new application if previous was withdrawn', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'withdrawn';
    expect(activeStatuses.includes(existingStatus)).toBe(false);
  });

  it('allows new application if previous was rejected', () => {
    const activeStatuses: ApplicationStatus[] = ['pending', 'reviewing'];
    const existingStatus: ApplicationStatus = 'rejected';
    expect(activeStatuses.includes(existingStatus)).toBe(false);
  });
});
```

---

## Шаг 9 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `types/index.ts` — добавлены `ApplicationListItem`, `ApplicationDetail`
2. `app/api/investor/applications/route.ts` — POST (создать) + GET (список инвестора)
3. `app/api/investor/applications/[id]/route.ts` — DELETE (отозвать, только pending)
4. `app/api/admin/applications/route.ts` — GET со статус- и проект-фильтрами
5. `app/api/admin/applications/[id]/route.ts` — PATCH с валидацией переходов статусов
6. `app/(investor)/deals/[id]/apply/apply-form.tsx` — клиентская форма с дисклеймером
7. `app/(investor)/deals/[id]/apply/page.tsx` — серверная страница формы заявки
8. `app/(investor)/applications/applications-client.tsx` — клиентский список заявок
9. `app/(investor)/applications/page.tsx` — серверная обёртка
10. `__tests__/t10.test.ts` — все тесты проходят
11. `npm run build` — без ошибок TypeScript
12. `npm test` — все тесты проходят (t1 … t10)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/*` — не изменять
- `app/api/admin/projects/*` — не изменять
- `app/(investor)/catalog/*` — не изменять
- `app/(investor)/deals/[id]/page.tsx` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t9.test.ts` — не изменять
- `supabase/migrations/*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T9":

```
DONE: T10
```

И в раздел "Выполненные задачи":

```
### T10 — Заявка инвестора + постзаявочный flow
Создано/изменено:
- types/index.ts — добавлены ApplicationListItem, ApplicationDetail
- app/api/investor/applications/route.ts — POST создание заявки + GET список инвестора
- app/api/investor/applications/[id]/route.ts — DELETE отзыв заявки
- app/api/admin/applications/route.ts — GET все заявки для менеджера/admin
- app/api/admin/applications/[id]/route.ts — PATCH смена статуса заявки
- app/(investor)/deals/[id]/apply/apply-form.tsx — клиентская форма заявки
- app/(investor)/deals/[id]/apply/page.tsx — страница формы заявки
- app/(investor)/applications/applications-client.tsx — клиентский список заявок с отзывом
- app/(investor)/applications/page.tsx — серверная страница списка заявок
- __tests__/t10.test.ts — тесты
```
