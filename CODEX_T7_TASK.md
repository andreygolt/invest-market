# ТЗ T7 — Админ-панель: модерация проектов, approve/reject

**Дата:** 2026-06-27
**Зависимости:** T6 выполнен (ai_reports, runAnalysisPipeline)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать каталог инвестора (это T8+)
- Не делать deal room (это T9)
- Не создавать новых таблиц — использовать существующие `projects`, `ai_reports`, `admin_action_log`, `project_status_log`
- Не трогать `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `t6.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- Не трогать `supabase/migrations/*`
- NO новых npm-зависимостей

---

## Контекст

После T6 у каждого submitted/under_review проекта есть AI-анализ в `ai_reports`.
Модератор должен:
1. Видеть список проектов в очереди на модерацию (статусы: `submitted`, `under_review`)
2. Открыть карточку проекта — увидеть анкету, AI-анализ (red flags, missing data, draft_card, ai_score, summary)
3. Нажать Approve → проект переходит в `approved`, запись в `admin_action_log`
4. Нажать Reject → проект переходит в `rejected` с обязательным текстом причины, запись в `admin_action_log`

**Важно:** Все операции доступны только роли `is_staff()` (superadmin, admin, moderator, manager).
Admin client используется только в API routes (серверная сторона).
UI — серверные компоненты Next.js App Router + shadcn/ui.

Уже существующие таблицы:
- `projects` — поля `status`, `moderated_by`, `moderated_at`, `rejection_reason`
- `ai_reports` — поля `project_id`, `report` (jsonb), `status`
- `admin_action_log` — поля `actor_id`, `action`, `target_table`, `target_id`, `metadata`
- `project_status_log` — из миграции T4 (004_project_video_status.sql)

---

## Шаг 1 — API: список проектов на модерацию

Создать `app/api/admin/projects/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/admin/projects?status=submitted,under_review
// Возвращает список проектов для модератора.
export async function GET() {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, created_at, updated_at, moderated_at, rejection_reason, owner_id')
    .in('status', ['submitted', 'under_review'])
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] });
}
```

---

## Шаг 2 — API: детали проекта для модератора

Создать `app/api/admin/projects/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/admin/projects/[id]
// Возвращает проект + секции анкеты + AI report для модератора.
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const projectId = params.id;

  const [projectResult, questionnaireResult, aiReportResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, created_at, updated_at, moderated_by, moderated_at, rejection_reason, owner_id')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_questionnaire')
      .select('section, answers')
      .eq('project_id', projectId)
      .order('section'),
    supabase
      .from('ai_reports')
      .select('id, status, report, updated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  if (projectResult.error || !projectResult.data) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  return NextResponse.json({
    project: projectResult.data,
    questionnaire: questionnaireResult.data ?? [],
    ai_report: aiReportResult.data ?? null,
  });
}
```

---

## Шаг 3 — API: approve проекта

Создать `app/api/admin/projects/[id]/approve/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/projects/[id]/approve
// Body: { moderator_id: string }
// Переводит проект в статус approved, записывает в admin_action_log.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const projectId = params.id;

  const body = await request.json() as { moderator_id?: string };
  const moderatorId = body.moderator_id;

  if (!moderatorId) {
    return NextResponse.json({ error: 'moderator_id required' }, { status: 400 });
  }

  // Проверяем что проект существует и в подходящем статусе
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const approvableStatuses = ['submitted', 'under_review'];
  if (!approvableStatuses.includes(project.status as string)) {
    return NextResponse.json(
      { error: `cannot approve project with status: ${project.status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      status: 'approved',
      moderated_by: moderatorId,
      moderated_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq('id', projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Логируем действие
  await supabase.from('admin_action_log').insert({
    actor_id: moderatorId,
    action: 'project_approved',
    target_table: 'projects',
    target_id: projectId,
    metadata: { from_status: project.status, to_status: 'approved' },
  });

  return NextResponse.json({ ok: true, status: 'approved' });
}
```

---

## Шаг 4 — API: reject проекта

Создать `app/api/admin/projects/[id]/reject/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/admin/projects/[id]/reject
// Body: { moderator_id: string; rejection_reason: string }
// Переводит проект в статус rejected с обязательной причиной.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createAdminClient();
  const projectId = params.id;

  const body = await request.json() as { moderator_id?: string; rejection_reason?: string };
  const { moderator_id: moderatorId, rejection_reason: rejectionReason } = body;

  if (!moderatorId) {
    return NextResponse.json({ error: 'moderator_id required' }, { status: 400 });
  }
  if (!rejectionReason || rejectionReason.trim().length < 10) {
    return NextResponse.json(
      { error: 'rejection_reason must be at least 10 characters' },
      { status: 400 }
    );
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, status')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError || !project) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 });
  }

  const rejectableStatuses = ['submitted', 'under_review'];
  if (!rejectableStatuses.includes(project.status as string)) {
    return NextResponse.json(
      { error: `cannot reject project with status: ${project.status}` },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('projects')
    .update({
      status: 'rejected',
      moderated_by: moderatorId,
      moderated_at: now,
      rejection_reason: rejectionReason.trim(),
      updated_at: now,
    })
    .eq('id', projectId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabase.from('admin_action_log').insert({
    actor_id: moderatorId,
    action: 'project_rejected',
    target_table: 'projects',
    target_id: projectId,
    metadata: {
      from_status: project.status,
      to_status: 'rejected',
      rejection_reason: rejectionReason.trim(),
    },
  });

  return NextResponse.json({ ok: true, status: 'rejected' });
}
```

---

## Шаг 5 — UI: список проектов на модерацию

Создать `app/(admin)/moderation/page.tsx`:

```typescript
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectRow } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, created_at, updated_at')
    .in('status', ['submitted', 'under_review'])
    .order('updated_at', { ascending: false });

  const items = (projects ?? []) as Pick<ProjectRow, 'id' | 'name' | 'status' | 'created_at' | 'updated_at'>[];

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Модерация проектов</h1>
        <p className="text-muted-foreground mt-1">
          Проекты, ожидающие проверки: {items.length}
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Нет проектов на модерации
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((project) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <Badge variant={project.status === 'submitted' ? 'default' : 'secondary'}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Обновлён: {new Date(project.updated_at).toLocaleDateString('ru-RU')}
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href={`/moderation/${project.id}`}>Открыть на проверку</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Шаг 6 — UI: детальная страница модерации проекта

Создать `app/(admin)/moderation/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AIReportRow, ProjectRow } from '@/types';
import { ModerationActions } from './moderation-actions';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function ModerationDetailPage({ params }: PageProps) {
  const supabase = createAdminClient();
  const projectId = params.id;

  const [projectResult, questionnaireResult, aiReportResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, created_at, updated_at, moderated_by, moderated_at, rejection_reason, owner_id')
      .eq('id', projectId)
      .maybeSingle(),
    supabase
      .from('project_questionnaire')
      .select('section, answers')
      .eq('project_id', projectId)
      .order('section'),
    supabase
      .from('ai_reports')
      .select('id, status, report, updated_at')
      .eq('project_id', projectId)
      .maybeSingle(),
  ]);

  if (!projectResult.data) notFound();

  const project = projectResult.data as ProjectRow;
  const questionnaire = questionnaireResult.data ?? [];
  const aiReport = aiReportResult.data as AIReportRow | null;

  const canModerate = ['submitted', 'under_review'].includes(project.status);

  return (
    <div className="container mx-auto py-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2">
            <Link href="/moderation">← Назад к очереди</Link>
          </Button>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge>{project.status}</Badge>
            <span className="text-sm text-muted-foreground">
              ID: {project.id}
            </span>
          </div>
        </div>
      </div>

      {/* AI Анализ */}
      {aiReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              AI-анализ
              <Badge variant={aiReport.status === 'done' ? 'default' : 'secondary'}>
                {aiReport.status}
              </Badge>
              {aiReport.status === 'done' && 'ai_score' in aiReport.report && (
                <Badge variant="outline">
                  Оценка: {(aiReport.report as { ai_score: number }).ai_score}/10
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {aiReport.status === 'done' && 'summary' in aiReport.report && (
              <div>
                <h3 className="font-semibold mb-1">Резюме для модератора</h3>
                <p className="text-sm">{(aiReport.report as { summary: string }).summary}</p>
              </div>
            )}

            {aiReport.status === 'done' && 'red_flags' in aiReport.report && (
              <div>
                <h3 className="font-semibold mb-2">
                  Красные флаги ({(aiReport.report as { red_flags: Array<{ severity: string; description: string }> }).red_flags.length})
                </h3>
                <div className="space-y-1">
                  {(aiReport.report as { red_flags: Array<{ severity: string; description: string }> }).red_flags.map((flag, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant={flag.severity === 'high' ? 'destructive' : flag.severity === 'medium' ? 'default' : 'secondary'}
                        className="shrink-0 mt-0.5"
                      >
                        {flag.severity}
                      </Badge>
                      <span>{flag.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiReport.status === 'done' && 'missing_data' in aiReport.report && (
              <div>
                <h3 className="font-semibold mb-2">
                  Отсутствующие данные ({(aiReport.report as { missing_data: Array<{ field: string; importance: string }> }).missing_data.length})
                </h3>
                <div className="space-y-1">
                  {(aiReport.report as { missing_data: Array<{ field: string; importance: string }> }).missing_data.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge
                        variant={item.importance === 'critical' ? 'destructive' : 'secondary'}
                        className="shrink-0 mt-0.5"
                      >
                        {item.importance}
                      </Badge>
                      <span>{item.field}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {aiReport.status !== 'done' && (
              <p className="text-sm text-muted-foreground">
                {aiReport.status === 'processing'
                  ? 'AI-анализ выполняется...'
                  : aiReport.status === 'error'
                  ? 'Ошибка AI-анализа'
                  : 'Анализ не начат'}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!aiReport && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            AI-анализ ещё не выполнен
          </CardContent>
        </Card>
      )}

      {/* Анкета */}
      {questionnaire.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Анкета проекта ({questionnaire.length} секций)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questionnaire.map((section) => (
              <div key={section.section}>
                <h3 className="font-semibold text-sm uppercase tracking-wide mb-2">
                  Секция {section.section.toUpperCase()}
                </h3>
                <pre className="bg-muted rounded p-3 text-xs overflow-auto max-h-48">
                  {JSON.stringify(section.answers, null, 2)}
                </pre>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Действия модератора */}
      {canModerate && (
        <ModerationActions projectId={project.id} projectName={project.name} />
      )}

      {!canModerate && (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Проект уже обработан: статус <strong>{project.status}</strong>
            {project.rejection_reason && (
              <p className="mt-2">Причина отклонения: {project.rejection_reason}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

---

## Шаг 7 — UI: клиентский компонент действий модератора

Создать `app/(admin)/moderation/[id]/moderation-actions.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ModerationActionsProps {
  projectId: string;
  projectName: string;
}

// Заглушка: в реальном приложении moderator_id берётся из сессии.
// Для MVP используем фиксированный placeholder — реальная auth интеграция в T7+ cleanup.
const PLACEHOLDER_MODERATOR_ID = '00000000-0000-0000-0000-000000000000';

export function ModerationActions({ projectId, projectName }: ModerationActionsProps) {
  const router = useRouter();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (!confirm(`Одобрить проект "${projectName}"?`)) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/projects/${projectId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderator_id: PLACEHOLDER_MODERATOR_ID }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Ошибка одобрения');
      return;
    }

    router.push('/moderation');
    router.refresh();
  }

  async function handleReject() {
    if (rejectionReason.trim().length < 10) {
      setError('Укажите причину отклонения (минимум 10 символов)');
      return;
    }
    if (!confirm(`Отклонить проект "${projectName}"?`)) return;

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/projects/${projectId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moderator_id: PLACEHOLDER_MODERATOR_ID,
        rejection_reason: rejectionReason.trim(),
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json() as { error?: string };
      setError(data.error ?? 'Ошибка отклонения');
      return;
    }

    router.push('/moderation');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Решение по проекту</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <div className="flex gap-3">
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            Одобрить проект
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setShowRejectForm(!showRejectForm);
              setError(null);
            }}
            disabled={loading}
          >
            Отклонить проект
          </Button>
        </div>

        {showRejectForm && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <Label htmlFor="rejection-reason">
                Причина отклонения <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Укажите причину отклонения проекта (минимум 10 символов)..."
                className="mt-1"
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Причина будет видна владельцу проекта
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading || rejectionReason.trim().length < 10}
            >
              Подтвердить отклонение
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

---

## Шаг 8 — Layout для admin-раздела

Создать `app/(admin)/layout.tsx`:

```typescript
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-6">
          <span className="font-semibold">Invest Market — Панель модератора</span>
          <nav className="flex gap-4 text-sm text-muted-foreground">
            <a href="/moderation" className="hover:text-foreground">Модерация</a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
```

---

## Шаг 9 — Тесты

Создать `__tests__/t7.test.ts`:

```typescript
import type { ProjectRow, AIReportRow, AIAnalysisReport } from '@/types';

describe('T7 moderation statuses', () => {
  const approvableStatuses = ['submitted', 'under_review'];
  const nonApprovableStatuses = ['draft', 'approved', 'rejected'];

  it('submitted can be approved', () => {
    expect(approvableStatuses.includes('submitted')).toBe(true);
  });

  it('under_review can be approved', () => {
    expect(approvableStatuses.includes('under_review')).toBe(true);
  });

  it('draft cannot be approved', () => {
    expect(approvableStatuses.includes('draft')).toBe(false);
  });

  it('already approved cannot be re-approved', () => {
    expect(approvableStatuses.includes('approved')).toBe(false);
  });

  it('rejected cannot be approved', () => {
    expect(approvableStatuses.includes('rejected')).toBe(false);
  });

  it('non-approvable list covers expected statuses', () => {
    expect(nonApprovableStatuses).toHaveLength(3);
  });
});

describe('T7 rejection reason validation', () => {
  function validateRejectionReason(reason: string): boolean {
    return reason.trim().length >= 10;
  }

  it('empty string is invalid', () => {
    expect(validateRejectionReason('')).toBe(false);
  });

  it('short reason is invalid', () => {
    expect(validateRejectionReason('короткий')).toBe(false);
  });

  it('reason with 10+ chars is valid', () => {
    expect(validateRejectionReason('Отсутствует финансовая модель')).toBe(true);
  });

  it('whitespace-only is invalid', () => {
    expect(validateRejectionReason('         ')).toBe(false);
  });
});

describe('T7 project status transition logic', () => {
  type ModerationAction = 'approve' | 'reject';

  function getResultStatus(action: ModerationAction): string {
    return action === 'approve' ? 'approved' : 'rejected';
  }

  it('approve action produces approved status', () => {
    expect(getResultStatus('approve')).toBe('approved');
  });

  it('reject action produces rejected status', () => {
    expect(getResultStatus('reject')).toBe('rejected');
  });
});

describe('T7 admin_action_log entries', () => {
  interface ActionLogEntry {
    actor_id: string;
    action: string;
    target_table: string;
    target_id: string;
    metadata: Record<string, unknown>;
  }

  it('approve log entry has correct action', () => {
    const entry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_approved',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: { from_status: 'submitted', to_status: 'approved' },
    };
    expect(entry.action).toBe('project_approved');
    expect(entry.metadata.to_status).toBe('approved');
  });

  it('reject log entry includes rejection_reason in metadata', () => {
    const entry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_rejected',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: {
        from_status: 'under_review',
        to_status: 'rejected',
        rejection_reason: 'Отсутствует финансовая модель',
      },
    };
    expect(entry.action).toBe('project_rejected');
    expect(typeof entry.metadata.rejection_reason).toBe('string');
  });

  it('log entry always targets projects table', () => {
    const approveEntry: ActionLogEntry = {
      actor_id: 'mod-uuid',
      action: 'project_approved',
      target_table: 'projects',
      target_id: 'proj-uuid',
      metadata: {},
    };
    expect(approveEntry.target_table).toBe('projects');
  });
});

describe('T7 AI report display logic', () => {
  it('done report shows summary', () => {
    const report: AIReportRow = {
      id: 'r-1',
      project_id: 'p-1',
      status: 'done',
      report: {
        red_flags: [],
        missing_data: [],
        draft_card: '# Test',
        ai_score: 7,
        summary: 'Хороший проект с чёткой командой',
      } as AIAnalysisReport,
      created_at: '2026-06-27T00:00:00Z',
      updated_at: '2026-06-27T00:00:00Z',
    };
    expect(report.status).toBe('done');
    const r = report.report as AIAnalysisReport;
    expect(r.summary.length).toBeGreaterThan(0);
    expect(r.ai_score).toBeGreaterThanOrEqual(1);
  });

  it('processing report is not displayable', () => {
    const report: AIReportRow = {
      id: 'r-2',
      project_id: 'p-1',
      status: 'processing',
      report: {},
      created_at: '2026-06-27T00:00:00Z',
      updated_at: '2026-06-27T00:00:00Z',
    };
    expect(report.status).not.toBe('done');
  });

  it('red flags sorted by severity weight', () => {
    const severityWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };
    const flags = [
      { severity: 'low', description: 'Minor' },
      { severity: 'high', description: 'Critical' },
      { severity: 'medium', description: 'Notable' },
    ];
    const sorted = [...flags].sort(
      (a, b) => severityWeight[b.severity] - severityWeight[a.severity]
    );
    expect(sorted[0].severity).toBe('high');
    expect(sorted[2].severity).toBe('low');
  });
});

describe('T7 ProjectRow moderation fields', () => {
  it('approved project has moderated_by and moderated_at', () => {
    const project: ProjectRow = {
      id: 'p-1',
      owner_id: 'u-1',
      name: 'Test Project',
      status: 'approved',
      moderated_by: 'mod-1',
      moderated_at: '2026-06-27T12:00:00Z',
      rejection_reason: null,
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-27T12:00:00Z',
    };
    expect(project.moderated_by).not.toBeNull();
    expect(project.moderated_at).not.toBeNull();
    expect(project.rejection_reason).toBeNull();
  });

  it('rejected project has rejection_reason', () => {
    const project: ProjectRow = {
      id: 'p-2',
      owner_id: 'u-1',
      name: 'Test Project',
      status: 'rejected',
      moderated_by: 'mod-1',
      moderated_at: '2026-06-27T12:00:00Z',
      rejection_reason: 'Недостаточно данных о команде',
      created_at: '2026-06-26T00:00:00Z',
      updated_at: '2026-06-27T12:00:00Z',
    };
    expect(project.status).toBe('rejected');
    expect(project.rejection_reason).not.toBeNull();
    expect((project.rejection_reason ?? '').length).toBeGreaterThan(0);
  });
});
```

---

## Шаг 10 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `app/api/admin/projects/route.ts` — GET список проектов в очереди
2. `app/api/admin/projects/[id]/route.ts` — GET детали + анкета + AI report
3. `app/api/admin/projects/[id]/approve/route.ts` — POST одобрение
4. `app/api/admin/projects/[id]/reject/route.ts` — POST отклонение с причиной
5. `app/(admin)/layout.tsx` — layout для admin-раздела
6. `app/(admin)/moderation/page.tsx` — список проектов на модерации
7. `app/(admin)/moderation/[id]/page.tsx` — детальная страница модерации
8. `app/(admin)/moderation/[id]/moderation-actions.tsx` — клиентский компонент действий
9. `__tests__/t7.test.ts` — все тесты проходят
10. `npm run build` — без ошибок TypeScript
11. `npm test` — все тесты проходят (t1 + t2 + t3 + t4 + t5 + t6 + t7)
12. Никаких новых миграций — используем существующие таблицы

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/*` — не изменять
- `lib/ai/*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t6.test.ts` — не изменять
- `supabase/migrations/*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T6":

```
DONE: T7
```

И в раздел "Выполненные задачи":

```
### T7 — Админ-панель: модерация проектов, approve/reject
Создано/изменено:
- app/api/admin/projects/route.ts — GET список проектов на модерации
- app/api/admin/projects/[id]/route.ts — GET детали проекта + анкета + AI report
- app/api/admin/projects/[id]/approve/route.ts — POST одобрение проекта
- app/api/admin/projects/[id]/reject/route.ts — POST отклонение с причиной
- app/(admin)/layout.tsx — layout admin-раздела
- app/(admin)/moderation/page.tsx — список очереди модерации
- app/(admin)/moderation/[id]/page.tsx — детальная страница модерации
- app/(admin)/moderation/[id]/moderation-actions.tsx — клиентский компонент approve/reject
- __tests__/t7.test.ts — тесты
```
