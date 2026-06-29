# ТЗ T4 — Загрузка вертикального видео, статусы проекта

**Дата:** 2026-06-27
**Зависимости:** T3 выполнен (анкета секций 5-8, загрузка документов, API project/documents)
**Размер:** M

---

## Что НЕ делаем в этом этапе

- Не делать AI-анализ (это T5-T6)
- Не делать модерацию (это T7)
- Не трогать секции анкеты 1-8
- Не изменять `app/api/project/documents/*`
- Не трогать `__tests__/t1.test.ts`, `__tests__/t2.test.ts`, `__tests__/t3.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`

---

## Контекст

После заполнения анкеты и загрузки документов проект должен:
1. Загрузить короткое вертикальное видео-питч (до 2 минут, формат mp4/mov, до 200 МБ)
2. Отправить заявку на модерацию (статус меняется: `draft` → `submitted`)

Статусная машина проекта:
- `draft` — проект заполняет анкету (начальный статус)
- `submitted` — проект отправлен на модерацию (после нажатия кнопки)
- `under_review` — модератор взял в работу (выставляется в T7)
- `approved` — одобрен (выставляется в T7)
- `rejected` — отклонён (выставляется в T7)

В этом этапе реализуем: загрузку видео + переход `draft` → `submitted`.

Bucket Supabase Storage для видео: `project-videos` (приватный).
Поле для видео в таблице `projects`: `video_path text` (добавляется миграцией).
Поле статуса: `status text NOT NULL DEFAULT 'draft'` (добавляется миграцией).

---

## Шаг 1 — Миграция БД

Создать `supabase/migrations/004_project_video_status.sql`:

```sql
-- Добавить поле статуса и видео в таблицу projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_path text;

-- Индекс по статусу для будущих выборок
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

-- Таблица лога смены статусов
CREATE TABLE IF NOT EXISTS project_status_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  comment     text
);

CREATE INDEX IF NOT EXISTS project_status_log_project_idx ON project_status_log(project_id);

-- RLS для project_status_log
ALTER TABLE project_status_log ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит лог своего проекта
CREATE POLICY "project_owner_select_log" ON project_status_log
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Администраторы и модераторы видят все логи
CREATE POLICY "admin_select_log" ON project_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Только сервисный роль пишет в лог (через admin client)
CREATE POLICY "service_insert_log" ON project_status_log
  FOR INSERT
  WITH CHECK (true);
```

---

## Шаг 2 — Типы TypeScript (дополнить types/index.ts)

Добавить в конец `types/index.ts` (не удалять существующее):

```typescript
export type ProjectStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface ProjectStatusLog {
  id: string;
  project_id: string;
  from_status: ProjectStatus | null;
  to_status: ProjectStatus;
  changed_by: string | null;
  changed_at: string;
  comment: string | null;
}
```

---

## Шаг 3 — API: загрузка видео

Создать `app/api/project/video/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (file.size > MAX_VIDEO_SIZE) {
    return NextResponse.json({ error: 'file too large (max 200MB)' }, { status: 400 });
  }
  if (!ALLOWED_VIDEO_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported format (mp4, mov only)' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'mp4';
  const storagePath = `${project.id}/pitch_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('project-videos')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { error: updateError } = await supabase
    .from('projects')
    .update({ video_path: storagePath })
    .eq('id', project.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ video_path: storagePath }, { status: 200 });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, video_path')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  if (!project.video_path) return NextResponse.json({ error: 'no video' }, { status: 404 });

  await supabase.storage.from('project-videos').remove([project.video_path]);

  await supabase
    .from('projects')
    .update({ video_path: null })
    .eq('id', project.id);

  return NextResponse.json({ ok: true });
}
```

---

## Шаг 4 — API: отправка на модерацию

Создать `app/api/project/submit/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id, status')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });
  if (project.status !== 'draft') {
    return NextResponse.json({ error: 'project already submitted' }, { status: 400 });
  }

  // Проверяем что анкета заполнена (секция s1 обязательна)
  const { data: questionnaire } = await supabase
    .from('project_questionnaire')
    .select('section')
    .eq('project_id', project.id);

  const filledSections = (questionnaire ?? []).map((q: { section: string }) => q.section);
  if (!filledSections.includes('s1')) {
    return NextResponse.json({ error: 'questionnaire not filled' }, { status: 400 });
  }

  const adminSupabase = createAdminClient();

  // Обновляем статус
  const { error: updateError } = await adminSupabase
    .from('projects')
    .update({ status: 'submitted' })
    .eq('id', project.id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Пишем в лог
  await adminSupabase
    .from('project_status_log')
    .insert({
      project_id: project.id,
      from_status: 'draft',
      to_status: 'submitted',
      changed_by: user.id,
    });

  return NextResponse.json({ status: 'submitted' });
}
```

---

## Шаг 5 — Страница: загрузка видео и отправка на модерацию

Создать `app/(project)/submit/page.tsx` — Client Component.

```tsx
'use client';
import { useState, useEffect, useRef } from 'react';

interface ProjectData {
  status: string;
  video_path: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'На модерации',
  under_review: 'Рассматривается',
  approved: 'Одобрен',
  rejected: 'Отклонён',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function SubmitPage() {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/project/my')
      .then(r => r.json())
      .then((d: { project?: ProjectData }) => {
        setProject(d.project ?? null);
        setLoading(false);
      });
  }, []);

  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('file', file);

    const r = await fetch('/api/project/video', { method: 'POST', body: formData });
    const d = await r.json() as { video_path?: string; error?: string };

    if (!r.ok) {
      setError(d.error ?? 'Ошибка загрузки видео');
    } else {
      setProject(prev => prev ? { ...prev, video_path: d.video_path ?? null } : null);
      setSuccess('Видео загружено успешно');
    }
    setUploading(false);
  }

  async function deleteVideo() {
    setError('');
    const r = await fetch('/api/project/video', { method: 'DELETE' });
    if (r.ok) {
      setProject(prev => prev ? { ...prev, video_path: null } : null);
      setSuccess('Видео удалено');
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError('');
    setSuccess('');

    const r = await fetch('/api/project/submit', { method: 'POST' });
    const d = await r.json() as { status?: string; error?: string };

    if (!r.ok) {
      setError(d.error ?? 'Ошибка отправки');
    } else {
      setProject(prev => prev ? { ...prev, status: 'submitted' } : null);
      setSuccess('Проект отправлен на модерацию');
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Загрузка...</p></div>;
  }

  if (!project) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Проект не найден</p></div>;
  }

  const isDraft = project.status === 'draft';
  const statusLabel = STATUS_LABELS[project.status] ?? project.status;
  const statusColor = STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-700';

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Статус */}
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-xl font-semibold mb-4">Статус заявки</h1>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          {!isDraft && (
            <p className="text-sm text-gray-500 mt-3">
              Ваш проект передан на проверку. Мы свяжемся с вами по результатам модерации.
            </p>
          )}
        </div>

        {/* Видео-питч */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-2">Видео-питч</h2>
          <p className="text-sm text-gray-500 mb-4">
            Короткое вертикальное видео до 2 минут (формат MP4 или MOV, до 200 МБ).
            Расскажите о проекте своими словами.
          </p>

          {project.video_path ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded">
              <svg className="w-5 h-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span className="text-sm text-green-800 flex-1 truncate">Видео загружено</span>
              {isDraft && (
                <button onClick={deleteVideo} className="text-red-500 text-xs hover:underline shrink-0">
                  Удалить
                </button>
              )}
            </div>
          ) : (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp4,.mov,.m4v,video/mp4,video/quicktime"
                className="hidden"
                onChange={handleVideoChange}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || !isDraft}
                className="px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gray-400 disabled:opacity-50 w-full text-center"
              >
                {uploading ? 'Загружаем...' : '+ Загрузить видео-питч'}
              </button>
            </div>
          )}
        </div>

        {/* Сообщения */}
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">{success}</p>}

        {/* Отправка */}
        {isDraft && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium mb-2">Отправить на модерацию</h2>
            <p className="text-sm text-gray-500 mb-4">
              После отправки редактирование анкеты будет недоступно. Убедитесь, что все данные заполнены корректно.
            </p>
            <p className="text-xs text-gray-400 bg-gray-50 border rounded p-3 mb-4">
              Платформа не принимает денежные средства. Все переговоры и оформление сделки происходят напрямую между проектом и инвестором вне платформы.
            </p>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-3 bg-black text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {submitting ? 'Отправляем...' : 'Отправить проект на модерацию'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
```

---

## Шаг 6 — Тесты

Создать `__tests__/t4.test.ts`:

```typescript
import type { ProjectStatus, ProjectStatusLog } from '@/types';

describe('T4 ProjectStatus type', () => {
  it('draft is valid status', () => {
    const s: ProjectStatus = 'draft';
    expect(s).toBe('draft');
  });

  it('all statuses are defined', () => {
    const statuses: ProjectStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'rejected'];
    expect(statuses).toHaveLength(5);
  });

  it('submitted follows draft in flow', () => {
    const flow: ProjectStatus[] = ['draft', 'submitted', 'under_review', 'approved'];
    expect(flow.indexOf('submitted')).toBeGreaterThan(flow.indexOf('draft'));
  });
});

describe('T4 ProjectStatusLog type', () => {
  it('status log shape is correct', () => {
    const log: ProjectStatusLog = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      from_status: 'draft',
      to_status: 'submitted',
      changed_by: 'uuid-3',
      changed_at: '2026-06-27T10:00:00Z',
      comment: null,
    };
    expect(log.to_status).toBe('submitted');
    expect(log.comment).toBeNull();
  });

  it('from_status can be null (initial transition)', () => {
    const log: ProjectStatusLog = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      from_status: null,
      to_status: 'draft',
      changed_by: null,
      changed_at: '2026-06-27T10:00:00Z',
      comment: null,
    };
    expect(log.from_status).toBeNull();
  });
});

describe('T4 video validation logic', () => {
  const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
  const ALLOWED_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/x-m4v'];

  it('max video size is 200MB', () => {
    expect(MAX_VIDEO_SIZE).toBe(209715200);
  });

  it('mp4 is allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/mp4')).toBe(true);
  });

  it('mov (quicktime) is allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/quicktime')).toBe(true);
  });

  it('avi is not allowed', () => {
    expect(ALLOWED_VIDEO_MIME.includes('video/avi')).toBe(false);
  });
});

describe('T4 submit validation', () => {
  it('only draft projects can be submitted', () => {
    const canSubmit = (status: string) => status === 'draft';
    expect(canSubmit('draft')).toBe(true);
    expect(canSubmit('submitted')).toBe(false);
    expect(canSubmit('approved')).toBe(false);
  });
});
```

---

## Шаг 7 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `supabase/migrations/004_project_video_status.sql` — миграция: поля `status`, `video_path` в `projects`; таблица `project_status_log` с RLS
2. `types/index.ts` дополнен: `ProjectStatus`, `ProjectStatusLog`
3. `app/api/project/video/route.ts` — POST загрузка видео, DELETE удаление
4. `app/api/project/submit/route.ts` — POST смена статуса `draft` → `submitted`
5. `app/(project)/submit/page.tsx` — страница с видео-загрузчиком и кнопкой отправки
6. `__tests__/t4.test.ts` — все тесты проходят
7. `npm run build` — без ошибок TypeScript
8. `npm test` — все тесты проходят (t1 + t2 + t3 + t4)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/questionnaire/*` — не изменять
- `app/(project)/documents/*` — не изменять
- `app/api/project/documents/*` — не изменять
- `app/api/project/questionnaire/*` — не изменять
- `__tests__/t1.test.ts`, `__tests__/t2.test.ts`, `__tests__/t3.test.ts` — не изменять
- `supabase/migrations/001_*`, `002_*`, `003_*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T3":

```
DONE: T4
```

И в раздел "Выполненные задачи":

```
### T4 — Загрузка вертикального видео, статусы проекта
Создано:
- supabase/migrations/004_project_video_status.sql — поля status/video_path в projects, таблица project_status_log + RLS
- types/index.ts — добавлены ProjectStatus, ProjectStatusLog
- app/api/project/video/route.ts — POST загрузка видео, DELETE удаление
- app/api/project/submit/route.ts — POST отправка на модерацию (draft → submitted)
- app/(project)/submit/page.tsx — страница загрузки видео и отправки на модерацию
- __tests__/t4.test.ts — тесты
```
