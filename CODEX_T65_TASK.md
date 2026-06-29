# T65 — Кабинет менеджера: внутренние заметки к заявкам инвесторов

## Контекст

После T64 менеджер имеет дашборд со статистикой и видит последние заявки.
На странице `/manager/applications/[id]` менеджер одобряет или отклоняет заявку
(T37, T45 — причина отклонения). Однако менеджер не может добавлять внутренние
заметки к заявке: промежуточные выводы, договорённости, контекст переговоров —
всё это хранится только у менеджера в голове или во внешних инструментах.

T65 добавляет систему внутренних заметок к заявкам инвесторов:
- таблица `application_notes` (RLS: только admin/manager/superadmin/moderator)
- API: `GET/POST /api/manager/applications/[id]/notes` — список и создание заметок
- API: `DELETE /api/manager/applications/[id]/notes/[note_id]` — удаление своей заметки
- UI: секция «Заметки» на странице `/manager/applications/[id]` с формой добавления

Заметки видны только менеджерам и администраторам. Инвесторы и проекты не имеют доступа.

## Что нужно создать / изменить

### 1. Миграция `supabase/migrations/025_application_notes.sql`

```sql
CREATE TABLE IF NOT EXISTS application_notes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES investor_applications(id) ON DELETE CASCADE,
  author_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;

-- Только admin, superadmin, moderator, manager могут читать и писать
CREATE POLICY "staff_manage_notes"
  ON application_notes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_application_notes_application_id
  ON application_notes(application_id);
```

### 2. Обновить `types/index.ts`

Добавить:

```typescript
export interface ApplicationNote {
  id: string
  application_id: string
  author_id: string
  content: string
  created_at: string
  author_email?: string | null
}

export interface ApplicationNoteInsert {
  application_id: string
  content: string
}
```

### 3. Создать `app/api/manager/applications/[id]/notes/route.ts`

GET — список заметок к заявке (с email автора).
POST — создать заметку (автор = текущий user).

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  // Проверить роль пользователя
  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const allowed = ['admin', 'superadmin', 'moderator', 'manager']
  if (!profile || !allowed.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('application_notes')
    .select('id, application_id, author_id, content, created_at')
    .eq('application_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Обогатить email авторов
  const authorIds = [...new Set((data ?? []).map((n) => n.author_id))]
  let emailMap: Record<string, string> = {}
  if (authorIds.length > 0) {
    const { data: authors } = await admin
      .from('users')
      .select('id, email')
      .in('id', authorIds)
    for (const a of authors ?? []) {
      if (a.id && a.email) emailMap[a.id] = a.email
    }
  }

  const notes = (data ?? []).map((n) => ({
    ...n,
    author_email: emailMap[n.author_id] ?? null,
  }))

  return NextResponse.json({ notes })
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const allowed = ['admin', 'superadmin', 'moderator', 'manager']
  if (!profile || !allowed.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const content: string = (body.content ?? '').trim()
  if (!content || content.length > 2000) {
    return NextResponse.json({ error: 'content required, max 2000 chars' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('application_notes')
    .insert({ application_id: params.id, author_id: user.id, content })
    .select('id, application_id, author_id, content, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: data }, { status: 201 })
}
```

### 4. Создать `app/api/manager/applications/[id]/notes/[note_id]/route.ts`

DELETE — удалить свою заметку (только автор или superadmin).

```typescript
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; note_id: string } }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  const allowed = ['admin', 'superadmin', 'moderator', 'manager']
  if (!profile || !allowed.includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Найти заметку
  const { data: note } = await admin
    .from('application_notes')
    .select('id, author_id')
    .eq('id', params.note_id)
    .eq('application_id', params.id)
    .single()

  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Удалить может только автор или superadmin
  if (note.author_id !== user.id && profile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await admin
    .from('application_notes')
    .delete()
    .eq('id', params.note_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

### 5. Создать `components/manager/application-notes.tsx`

Клиентский компонент — список заметок + форма добавления.

```tsx
'use client'

import { useState } from 'react'
import type { ApplicationNote } from '@/types'

interface Props {
  applicationId: string
  initialNotes: ApplicationNote[]
  currentUserId: string
  currentUserRole: string
}

export function ApplicationNotes({
  applicationId,
  initialNotes,
  currentUserId,
  currentUserRole,
}: Props) {
  const [notes, setNotes] = useState<ApplicationNote[]>(initialNotes)
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!content.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/manager/applications/${applicationId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Ошибка'); return }
      setNotes((prev) => [...prev, json.note as ApplicationNote])
      setContent('')
    } catch {
      setError('Ошибка сети')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(noteId: string) {
    const res = await fetch(
      `/api/manager/applications/${applicationId}/notes/${noteId}`,
      { method: 'DELETE' }
    )
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId))
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold">Внутренние заметки</h2>

      {notes.length === 0 && (
        <p className="text-sm text-gray-400">Заметок пока нет.</p>
      )}

      <ul className="space-y-3">
        {notes.map((note) => (
          <li key={note.id} className="rounded-md border p-3 text-sm bg-gray-50">
            <p className="whitespace-pre-wrap">{note.content}</p>
            <div className="mt-1.5 flex items-center justify-between text-xs text-gray-400">
              <span>
                {note.author_email ?? '—'} ·{' '}
                {new Date(note.created_at).toLocaleString('ru-RU')}
              </span>
              {(note.author_id === currentUserId || currentUserRole === 'superadmin') && (
                <button
                  onClick={() => handleDelete(note.id)}
                  className="text-red-400 hover:text-red-600 ml-2"
                >
                  Удалить
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Форма добавления */}
      <div className="space-y-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Добавить заметку..."
          rows={3}
          maxLength={2000}
          className="w-full rounded-md border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">{content.length}/2000</span>
          <button
            onClick={handleAdd}
            disabled={submitting || !content.trim()}
            className="rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-700 disabled:opacity-40"
          >
            {submitting ? 'Сохраняю...' : 'Добавить заметку'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

### 6. Обновить страницу `app/(manager)/manager/applications/[id]/page.tsx`

Прочитать файл. Добавить в серверный компонент загрузку заметок через `createAdminClient()`:

```typescript
import { ApplicationNotes } from '@/components/manager/application-notes'

// В серверном компоненте добавить загрузку заметок:
const admin = createAdminClient()
const { data: notesRaw } = await admin
  .from('application_notes')
  .select('id, application_id, author_id, content, created_at')
  .eq('application_id', params.id)
  .order('created_at', { ascending: true })

// Загрузить email авторов
const authorIds = [...new Set((notesRaw ?? []).map((n) => n.author_id))]
let emailMap: Record<string, string> = {}
if (authorIds.length > 0) {
  const { data: authors } = await admin
    .from('users')
    .select('id, email')
    .in('id', authorIds)
  for (const a of authors ?? []) {
    if (a.id && a.email) emailMap[a.id] = a.email
  }
}
const notes = (notesRaw ?? []).map((n) => ({
  ...n,
  author_email: emailMap[n.author_id] ?? null,
}))

// В JSX добавить после блока с информацией о заявке:
<ApplicationNotes
  applicationId={params.id}
  initialNotes={notes}
  currentUserId={user.id}
  currentUserRole={profile.role}
/>
```

**Важно:** читать существующий файл перед изменением.
Добавить `import { createAdminClient } from '@/lib/supabase/admin'` если ещё нет.
Не менять существующую логику approve/reject.

### 7. Создать `__tests__/t65.test.ts`

```typescript
// GET /api/manager/applications/[id]/notes
// 1.  401 без авторизации
// 2.  403 для роли investor
// 3.  200 + массив notes для роли manager
// 4.  notes содержат поле author_email

// POST /api/manager/applications/[id]/notes
// 5.  401 без авторизации
// 6.  403 для роли investor
// 7.  400 если content пустой
// 8.  400 если content длиннее 2000 символов
// 9.  201 + созданная заметка при корректных данных

// DELETE /api/manager/applications/[id]/notes/[note_id]
// 10. 401 без авторизации
// 11. 404 если заметка не найдена
// 12. 403 если автор != текущий user и роль != superadmin
// 13. 200 если автор == текущий user
// 14. 200 если роль superadmin (может удалить чужую заметку)

// ApplicationNotes (renderToStaticMarkup)
// 15. рендерится с пустым списком — показывает "Заметок пока нет."
// 16. рендерится с одной заметкой — показывает content заметки
// 17. показывает author_email заметки
// 18. показывает кнопку "Удалить" для своей заметки (author_id == currentUserId)
// 19. не показывает кнопку "Удалить" для чужой заметки обычному manager
// 20. показывает кнопку "Удалить" для чужой заметки superadmin
```

#### Структура тестов

```typescript
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ApplicationNotes } from '@/components/manager/application-notes'
import type { ApplicationNote } from '@/types'

// --- моки для API-роутов ---
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'manager-1' } },
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
          in: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: { role: 'manager', id: 'manager-1', email: 'mgr@test.com' },
            error: null,
          }),
        }
      }
      if (table === 'application_notes') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockResolvedValue({
            data: [
              {
                id: 'note-1',
                application_id: 'app-1',
                author_id: 'manager-1',
                content: 'Тестовая заметка',
                created_at: '2026-06-01T10:00:00Z',
              },
            ],
            error: null,
          }),
          insert: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          single: jest.fn().mockResolvedValue({
            data: {
              id: 'note-2',
              application_id: 'app-1',
              author_id: 'manager-1',
              content: 'Новая заметка',
              created_at: '2026-06-02T10:00:00Z',
            },
            error: null,
          }),
        }
      }
      return {}
    }),
  })),
}))

// --- тесты компонента ---
const mockNote: ApplicationNote = {
  id: 'note-1',
  application_id: 'app-1',
  author_id: 'user-1',
  content: 'Тестовая заметка',
  created_at: '2026-06-01T10:00:00Z',
  author_email: 'author@test.com',
}
```

Использовать `renderToStaticMarkup` для тестов компонента (аналогично другим тестам).
Для API-роутов тестировать через прямой вызов handler-функций с моком `NextRequest`.

## Файлы для создания / изменения

- `supabase/migrations/025_application_notes.sql` (новый)
- `types/index.ts` (добавить ApplicationNote, ApplicationNoteInsert)
- `app/api/manager/applications/[id]/notes/route.ts` (новый)
- `app/api/manager/applications/[id]/notes/[note_id]/route.ts` (новый)
- `components/manager/application-notes.tsx` (новый)
- `app/(manager)/manager/applications/[id]/page.tsx` (обновить: добавить секцию заметок)
- `__tests__/t65.test.ts` (новый)

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Заметки видны только ролям: admin, superadmin, moderator, manager
- Инвесторы и проекты не имеют доступа к заметкам (RLS + проверка роли в API)
- Удалить заметку может только автор или superadmin
- Читать существующие файлы перед изменением

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t65.test.ts)
4. `GET /api/manager/applications/[id]/notes` — 401 без auth, 403 для investor, 200 для manager
5. `POST /api/manager/applications/[id]/notes` — создаёт заметку, 400 если content пустой
6. `DELETE /api/manager/applications/[id]/notes/[note_id]` — удаляет свою заметку, 403 для чужой
7. На странице `/manager/applications/[id]` видна секция «Внутренние заметки» с формой
8. Записать в `progress.md`: `DONE: T65 + что создано/изменено`
