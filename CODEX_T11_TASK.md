# ТЗ T11 — Избранное, заметки, личные статусы инвестора

**Дата:** 2026-06-28
**Зависимости:** T10 выполнен (заявки работают, `/applications` доступна)
**Тестовых файлов сейчас:** t1 … t10 (10 файлов)
**Размер:** M

---

## Зачем это нужно

Инвестор просматривает каталог и Deal Room, но не всегда готов сразу оставить заявку. Нужен инструмент для личного трекинга: добавить проект в избранное, написать заметку («нужно уточнить у фаундера про burn rate»), поставить личный статус — «Слежу», «Интересно», «Пропускаю». Это увеличивает вовлечённость и возвращаемость на платформу.

Таблица `investor_favorites` уже есть в `001_initial_schema.sql` (с полем `notes`). В этом этапе добавляем `personal_status` и `updated_at` через аддитивную миграцию, реализуем API и UI — панель в Deal Room и отдельную страницу `/favorites`.

---

## Что НЕ делаем в этом этапе

- Не делать калькулятор доходности — это T12
- Не делать портфель инвестора — это T13
- Не делать дашборд инвестора — это T14
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `__tests__/t10.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- Не трогать `app/(investor)/catalog/*`
- Не трогать `app/(investor)/applications/*`
- Не трогать `app/(investor)/deals/[id]/apply/*`
- Не трогать `app/api/investor/applications/*`, `app/api/admin/*`
- Не трогать `app/api/investor/catalog/*`, `app/api/investor/deals/*`
- NO новых npm-зависимостей

---

## Контекст

**Таблица `investor_favorites` уже существует** (из `001_initial_schema.sql`):
```sql
id uuid, investor_id uuid, project_id uuid,
notes text, created_at timestamptz,
UNIQUE (investor_id, project_id)
```
RLS-политика «favorites owner access» уже активна — инвестор видит только свои записи, staff видит все.

**Нужна аддитивная миграция** — добавить два поля:
- `personal_status text CHECK (... IN ('watching', 'interested', 'passed'))` — личный статус
- `updated_at timestamptz NOT NULL DEFAULT now()` — для сортировки

**Flow:**
1. Инвестор на Deal Room нажимает «В избранное» → POST upsert (notes=null, status=null)
2. В той же панели может написать заметку → PATCH
3. Может поставить личный статус → PATCH
4. `/favorites` — список избранного с фильтром по personal_status
5. На Deal Room панель показывает текущее состояние (в избранном / нет)

---

## Шаг 1 — Миграция

Создать `supabase/migrations/007_investor_favorites_status.sql`:

```sql
-- Аддитивная миграция: добавляем personal_status и updated_at в investor_favorites

ALTER TABLE public.investor_favorites
  ADD COLUMN IF NOT EXISTS personal_status text
    CONSTRAINT investor_favorites_personal_status_check
    CHECK (personal_status IN ('watching', 'interested', 'passed'));

ALTER TABLE public.investor_favorites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
```

---

## Шаг 2 — TypeScript типы

Добавить в конец `types/index.ts`:

```typescript
export type InvestorPersonalStatus = 'watching' | 'interested' | 'passed';

export interface InvestorFavoriteRow {
  id: string;
  investor_id: string;
  project_id: string;
  notes: string | null;
  personal_status: InvestorPersonalStatus | null;
  created_at: string;
  updated_at: string;
}

export type InvestorFavoriteInsert = Omit<InvestorFavoriteRow, 'id' | 'created_at' | 'updated_at'>;

export interface InvestorFavoriteDetail {
  id: string;
  investor_id: string;
  project_id: string;
  project_name: string;
  project_industry: string | null;
  project_stage: ProjectStage | null;
  project_ai_score: number | null;
  notes: string | null;
  personal_status: InvestorPersonalStatus | null;
  created_at: string;
  updated_at: string;
}
```

---

## Шаг 3 — API: POST + GET /api/investor/favorites

Создать `app/api/investor/favorites/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorFavoriteDetail, InvestorPersonalStatus, ProjectStage } from '@/types';

// POST /api/investor/favorites
// Body: { investor_id, project_id, notes?, personal_status? }
// Upsert: если запись уже есть — обновляет notes/status, если нет — создаёт
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    notes?: string | null;
    personal_status?: InvestorPersonalStatus | null;
  };

  const { investor_id, project_id, notes, personal_status } = body;

  if (!investor_id || !project_id) {
    return NextResponse.json(
      { error: 'investor_id и project_id обязательны' },
      { status: 400 }
    );
  }

  // Проект должен быть approved
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Проект не найден или не одобрен' }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('investor_favorites')
    .upsert(
      {
        investor_id,
        project_id,
        notes: notes ?? null,
        personal_status: personal_status ?? null,
        updated_at: now,
      },
      { onConflict: 'investor_id,project_id' }
    )
    .select('id, investor_id, project_id, notes, personal_status, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// GET /api/investor/favorites?investor_id=xxx&personal_status=watching
// Список избранного инвестора с данными проекта
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');
  const statusFilter = searchParams.get('personal_status') as InvestorPersonalStatus | null;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  let query = supabase
    .from('investor_favorites')
    .select(
      'id, investor_id, project_id, notes, personal_status, created_at, updated_at, projects(name, status)'
    )
    .eq('investor_id', investor_id)
    .order('updated_at', { ascending: false });

  if (statusFilter) {
    query = query.eq('personal_status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Получаем ai_score и industry из view или отдельным запросом
  // Используем v_investor_catalog (создан в T8) для получения доп. полей
  const projectIds = (data ?? []).map((r) => r.project_id);
  let catalogMap: Record<string, { industry: string | null; stage: ProjectStage | null; ai_score: number | null }> = {};

  if (projectIds.length > 0) {
    const { data: catalog } = await supabase
      .from('v_investor_catalog')
      .select('id, industry, stage, ai_score')
      .in('id', projectIds);

    for (const row of catalog ?? []) {
      catalogMap[row.id] = {
        industry: row.industry ?? null,
        stage: (row.stage as ProjectStage) ?? null,
        ai_score: row.ai_score ?? null,
      };
    }
  }

  const favorites: InvestorFavoriteDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: (row.projects as { name: string } | null)?.name ?? '',
    project_industry: catalogMap[row.project_id]?.industry ?? null,
    project_stage: catalogMap[row.project_id]?.stage ?? null,
    project_ai_score: catalogMap[row.project_id]?.ai_score ?? null,
    notes: row.notes,
    personal_status: row.personal_status as InvestorPersonalStatus | null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return NextResponse.json({ favorites });
}
```

---

## Шаг 4 — API: PATCH + DELETE /api/investor/favorites/[id]

Создать `app/api/investor/favorites/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { InvestorPersonalStatus } from '@/types';

// PATCH /api/investor/favorites/[id]
// Body: { investor_id, notes?, personal_status? }
// Обновляет notes и/или personal_status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: favoriteId } = await params;

  const body = (await request.json()) as {
    investor_id?: string;
    notes?: string | null;
    personal_status?: InvestorPersonalStatus | null;
  };

  const { investor_id, notes, personal_status } = body;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_favorites')
    .select('id, investor_id')
    .eq('id', favoriteId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  if (existing.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (notes !== undefined) updatePayload.notes = notes;
  if (personal_status !== undefined) updatePayload.personal_status = personal_status;

  const { data, error } = await supabase
    .from('investor_favorites')
    .update(updatePayload)
    .eq('id', favoriteId)
    .select('id, investor_id, project_id, notes, personal_status, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE /api/investor/favorites/[id]?investor_id=xxx
// Удаляет запись из избранного
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id: favoriteId } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_favorites')
    .select('id, investor_id')
    .eq('id', favoriteId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  if (existing.investor_id !== investor_id) {
    return NextResponse.json({ error: 'Нет доступа' }, { status: 403 });
  }

  const { error } = await supabase
    .from('investor_favorites')
    .delete()
    .eq('id', favoriteId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

## Шаг 5 — UI: панель избранного в Deal Room

Создать `app/(investor)/deals/[id]/favorite-panel.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { InvestorFavoriteRow, InvestorPersonalStatus } from '@/types';

const PERSONAL_STATUS_LABELS: Record<InvestorPersonalStatus, string> = {
  watching: 'Слежу',
  interested: 'Интересно',
  passed: 'Пропускаю',
};

interface FavoritePanelProps {
  projectId: string;
}

export function FavoritePanel({ projectId }: FavoritePanelProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState<InvestorFavoriteRow | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Проверяем, есть ли этот проект в избранном
      const res = await fetch(`/api/investor/favorites?investor_id=${user.id}`);
      const json = await res.json();
      const found = (json.favorites ?? []).find(
        (f: InvestorFavoriteRow) => f.project_id === projectId
      ) ?? null;
      setFavorite(found);
      if (found) setNotes(found.notes ?? '');
      setLoading(false);
    });
  }, [projectId]);

  async function toggleFavorite() {
    if (!userId) return;
    setSaving(true);
    try {
      if (favorite) {
        // Удаляем из избранного
        await fetch(`/api/investor/favorites/${favorite.id}?investor_id=${userId}`, {
          method: 'DELETE',
        });
        setFavorite(null);
        setNotes('');
        setNotesOpen(false);
      } else {
        // Добавляем в избранное
        const res = await fetch('/api/investor/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investor_id: userId, project_id: projectId }),
        });
        if (res.ok) {
          const data = await res.json();
          setFavorite(data);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!userId || !favorite) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/investor/favorites/${favorite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: userId, notes: notes.trim() || null }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorite(data);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(status: InvestorPersonalStatus | null) {
    if (!userId || !favorite) return;
    setSaving(true);
    try {
      const newStatus = favorite.personal_status === status ? null : status;
      const res = await fetch(`/api/investor/favorites/${favorite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: userId, personal_status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setFavorite(data);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  if (!userId) return null;

  const isFavorite = favorite !== null;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-3">
        <Button
          variant={isFavorite ? 'default' : 'outline'}
          size="sm"
          onClick={toggleFavorite}
          disabled={saving}
        >
          {isFavorite ? 'В избранном' : 'В избранное'}
        </Button>

        {isFavorite && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setNotesOpen((v) => !v)}
          >
            {notesOpen ? 'Скрыть заметку' : 'Заметка'}
          </Button>
        )}
      </div>

      {isFavorite && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERSONAL_STATUS_LABELS) as InvestorPersonalStatus[]).map((s) => (
            <Button
              key={s}
              variant={favorite.personal_status === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSetStatus(s)}
              disabled={saving}
            >
              {PERSONAL_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}

      {isFavorite && notesOpen && (
        <div className="space-y-2">
          <Label htmlFor="fav-notes" className="text-sm">Личная заметка</Label>
          <Textarea
            id="fav-notes"
            placeholder="Заметки только для вас..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
          <Button size="sm" onClick={handleSaveNotes} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      )}
    </div>
  );
}
```

Изменить `app/(investor)/deals/[id]/page.tsx` — добавить импорт и вставить `<FavoritePanel>` внутри страницы:

Найти в файле место после заголовка проекта (блок с `<h1>` или `<CardTitle>` с именем проекта) и вставить компонент. Точное место определяется существующей разметкой.

**Добавить импорт** в начало файла (после существующих импортов):
```typescript
import { FavoritePanel } from './favorite-panel';
```

**Вставить** `<FavoritePanel projectId={project.id} />` в JSX — после основного заголовка проекта и до секций с описанием. Обернуть в `<div className="mb-6">` для отступа.

---

## Шаг 6 — UI: страница избранного

Создать `app/(investor)/favorites/favorites-client.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InvestorFavoriteDetail, InvestorPersonalStatus } from '@/types';

const STATUS_LABELS: Record<InvestorPersonalStatus, string> = {
  watching: 'Слежу',
  interested: 'Интересно',
  passed: 'Пропускаю',
};

const STATUS_VARIANTS: Record<InvestorPersonalStatus, 'default' | 'secondary' | 'outline'> = {
  watching: 'secondary',
  interested: 'default',
  passed: 'outline',
};

const STATUS_FILTERS: Array<{ value: InvestorPersonalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'watching', label: 'Слежу' },
  { value: 'interested', label: 'Интересно' },
  { value: 'passed', label: 'Пропускаю' },
];

export function FavoritesClient() {
  const [favorites, setFavorites] = useState<InvestorFavoriteDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvestorPersonalStatus | 'all'>('all');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserId(user.id);
      loadFavorites(user.id, 'all');
    });
  }, []);

  async function loadFavorites(uid: string, statusFilter: InvestorPersonalStatus | 'all') {
    setLoading(true);
    const url =
      statusFilter === 'all'
        ? `/api/investor/favorites?investor_id=${uid}`
        : `/api/investor/favorites?investor_id=${uid}&personal_status=${statusFilter}`;
    const res = await fetch(url);
    const json = await res.json();
    setFavorites(json.favorites ?? []);
    setLoading(false);
  }

  function handleFilter(f: InvestorPersonalStatus | 'all') {
    setFilter(f);
    if (userId) loadFavorites(userId, f);
  }

  async function handleRemove(favoriteId: string) {
    if (!userId) return;
    const res = await fetch(`/api/investor/favorites/${favoriteId}?investor_id=${userId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Избранное</h1>
        <Button asChild variant="outline">
          <Link href="/catalog">← Каталог</Link>
        </Button>
      </div>

      {/* Фильтры по личному статусу */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {favorites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {filter === 'all' ? (
              <>
                Избранных проектов нет.{' '}
                <Link href="/catalog" className="text-blue-600 hover:underline">
                  Перейти в каталог
                </Link>
              </>
            ) : (
              <>Нет проектов с таким статусом.</>
            )}
          </CardContent>
        </Card>
      ) : (
        favorites.map((fav) => (
          <Card key={fav.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    <Link
                      href={`/deals/${fav.project_id}`}
                      className="hover:underline"
                    >
                      {fav.project_name}
                    </Link>
                  </CardTitle>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {fav.project_industry && (
                      <span className="text-xs text-muted-foreground">{fav.project_industry}</span>
                    )}
                    {fav.project_stage && (
                      <span className="text-xs text-muted-foreground">{fav.project_stage}</span>
                    )}
                    {fav.project_ai_score !== null && (
                      <span className="text-xs text-muted-foreground">
                        AI-score: {fav.project_ai_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {fav.personal_status && (
                    <Badge variant={STATUS_VARIANTS[fav.personal_status]}>
                      {STATUS_LABELS[fav.personal_status]}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleRemove(fav.id)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </CardHeader>
            {fav.notes && (
              <CardContent>
                <p className="text-sm text-muted-foreground line-clamp-3">{fav.notes}</p>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
```

Создать `app/(investor)/favorites/page.tsx`:

```typescript
import { FavoritesClient } from './favorites-client';

export const dynamic = 'force-dynamic';

export default function FavoritesPage() {
  return <FavoritesClient />;
}
```

---

## Шаг 7 — Тесты

Создать `__tests__/t11.test.ts`:

```typescript
import type {
  InvestorPersonalStatus,
  InvestorFavoriteRow,
  InvestorFavoriteDetail,
  InvestorFavoriteInsert,
  ProjectStage,
} from '@/types';

// --- helpers ---

const makeFavoriteRow = (overrides: Partial<InvestorFavoriteRow> = {}): InvestorFavoriteRow => ({
  id: 'fav-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  notes: null,
  personal_status: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
  ...overrides,
});

const makeFavoriteDetail = (
  overrides: Partial<InvestorFavoriteDetail> = {}
): InvestorFavoriteDetail => ({
  id: 'fav-1',
  investor_id: 'user-1',
  project_id: 'proj-1',
  project_name: 'Test Project',
  project_industry: 'FinTech',
  project_stage: 'seed' as ProjectStage,
  project_ai_score: 72,
  notes: null,
  personal_status: null,
  created_at: '2026-06-28T10:00:00Z',
  updated_at: '2026-06-28T10:00:00Z',
  ...overrides,
});

const makeFavoriteInsert = (
  overrides: Partial<InvestorFavoriteInsert> = {}
): InvestorFavoriteInsert => ({
  investor_id: 'user-1',
  project_id: 'proj-1',
  notes: null,
  personal_status: null,
  ...overrides,
});

// --- tests ---

describe('T11 InvestorFavoriteRow type', () => {
  it('has all required fields', () => {
    const fav = makeFavoriteRow();
    expect(typeof fav.id).toBe('string');
    expect(typeof fav.investor_id).toBe('string');
    expect(typeof fav.project_id).toBe('string');
    expect(fav.notes).toBeNull();
    expect(fav.personal_status).toBeNull();
  });

  it('notes can be a string', () => {
    const fav = makeFavoriteRow({ notes: 'Нужно уточнить условия' });
    expect(fav.notes).toBe('Нужно уточнить условия');
  });

  it('personal_status can be set to valid values', () => {
    const validStatuses: InvestorPersonalStatus[] = ['watching', 'interested', 'passed'];
    for (const s of validStatuses) {
      const fav = makeFavoriteRow({ personal_status: s });
      expect(fav.personal_status).toBe(s);
    }
  });

  it('personal_status can be null', () => {
    const fav = makeFavoriteRow({ personal_status: null });
    expect(fav.personal_status).toBeNull();
  });
});

describe('T11 InvestorPersonalStatus values', () => {
  const VALID: InvestorPersonalStatus[] = ['watching', 'interested', 'passed'];

  it('has exactly 3 valid statuses', () => {
    expect(VALID).toHaveLength(3);
  });

  it('contains watching, interested, passed', () => {
    expect(VALID).toContain('watching');
    expect(VALID).toContain('interested');
    expect(VALID).toContain('passed');
  });
});

describe('T11 InvestorFavoriteDetail type', () => {
  it('includes project info fields', () => {
    const detail = makeFavoriteDetail();
    expect(typeof detail.project_name).toBe('string');
    expect(detail.project_industry).toBe('FinTech');
    expect(detail.project_stage).toBe('seed');
    expect(typeof detail.project_ai_score).toBe('number');
  });

  it('project_industry can be null', () => {
    const detail = makeFavoriteDetail({ project_industry: null });
    expect(detail.project_industry).toBeNull();
  });

  it('project_ai_score can be null', () => {
    const detail = makeFavoriteDetail({ project_ai_score: null });
    expect(detail.project_ai_score).toBeNull();
  });
});

describe('T11 InvestorFavoriteInsert type', () => {
  it('does not have id, created_at, updated_at', () => {
    const insert = makeFavoriteInsert();
    expect('id' in insert).toBe(false);
    expect('created_at' in insert).toBe(false);
    expect('updated_at' in insert).toBe(false);
  });

  it('requires investor_id and project_id', () => {
    const insert = makeFavoriteInsert();
    expect(typeof insert.investor_id).toBe('string');
    expect(typeof insert.project_id).toBe('string');
  });
});

describe('T11 upsert uniqueness logic', () => {
  it('identifies duplicate by investor_id + project_id', () => {
    const existing = makeFavoriteRow({ investor_id: 'u1', project_id: 'p1' });
    const newReq = { investor_id: 'u1', project_id: 'p1' };
    const isDuplicate =
      existing.investor_id === newReq.investor_id &&
      existing.project_id === newReq.project_id;
    expect(isDuplicate).toBe(true);
  });

  it('no duplicate for different project', () => {
    const existing = makeFavoriteRow({ investor_id: 'u1', project_id: 'p1' });
    const newReq = { investor_id: 'u1', project_id: 'p2' };
    const isDuplicate =
      existing.investor_id === newReq.investor_id &&
      existing.project_id === newReq.project_id;
    expect(isDuplicate).toBe(false);
  });
});

describe('T11 personal status toggle logic', () => {
  it('toggling same status sets it to null', () => {
    const currentStatus: InvestorPersonalStatus = 'watching';
    const clickedStatus: InvestorPersonalStatus = 'watching';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBeNull();
  });

  it('toggling different status sets it to new value', () => {
    const currentStatus: InvestorPersonalStatus = 'watching';
    const clickedStatus: InvestorPersonalStatus = 'interested';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBe('interested');
  });

  it('toggling from null sets the status', () => {
    const currentStatus: InvestorPersonalStatus | null = null;
    const clickedStatus: InvestorPersonalStatus = 'passed';
    const newStatus = currentStatus === clickedStatus ? null : clickedStatus;
    expect(newStatus).toBe('passed');
  });
});

describe('T11 filter by personal_status', () => {
  const items: InvestorFavoriteDetail[] = [
    makeFavoriteDetail({ id: '1', personal_status: 'watching' }),
    makeFavoriteDetail({ id: '2', personal_status: 'interested' }),
    makeFavoriteDetail({ id: '3', personal_status: null }),
    makeFavoriteDetail({ id: '4', personal_status: 'watching' }),
  ];

  it('filter watching returns only watching', () => {
    const result = items.filter((f) => f.personal_status === 'watching');
    expect(result).toHaveLength(2);
  });

  it('filter interested returns only interested', () => {
    const result = items.filter((f) => f.personal_status === 'interested');
    expect(result).toHaveLength(1);
  });

  it('all filter returns all items', () => {
    expect(items).toHaveLength(4);
  });
});

describe('T11 ownership check for PATCH/DELETE', () => {
  it('owner can modify their favorite', () => {
    const fav = makeFavoriteRow({ investor_id: 'user-1' });
    const requesterId = 'user-1';
    expect(fav.investor_id === requesterId).toBe(true);
  });

  it('other user cannot modify favorite', () => {
    const fav = makeFavoriteRow({ investor_id: 'user-1' });
    const requesterId = 'user-2';
    expect(fav.investor_id === requesterId).toBe(false);
  });
});
```

---

## Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `supabase/migrations/007_investor_favorites_status.sql` — добавлены `personal_status` и `updated_at`
2. `types/index.ts` — добавлены `InvestorPersonalStatus`, `InvestorFavoriteRow`, `InvestorFavoriteInsert`, `InvestorFavoriteDetail`
3. `app/api/investor/favorites/route.ts` — POST (upsert) + GET (список с фильтром)
4. `app/api/investor/favorites/[id]/route.ts` — PATCH (notes/status) + DELETE (удаление)
5. `app/(investor)/deals/[id]/favorite-panel.tsx` — клиентская панель с кнопкой избранного, статусами, заметкой
6. `app/(investor)/deals/[id]/page.tsx` — добавлен `import { FavoritePanel }` и вставлен `<FavoritePanel projectId={project.id} />`
7. `app/(investor)/favorites/favorites-client.tsx` — клиентский список с фильтрацией и удалением
8. `app/(investor)/favorites/page.tsx` — серверная обёртка
9. `__tests__/t11.test.ts` — все тесты проходят
10. `npm run build` — без ошибок TypeScript
11. `npm run lint` — без ошибок ESLint
12. `npm test` — все тесты проходят (t1 … t11)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/project/*` — не изменять
- `app/api/ai/*` — не изменять
- `app/api/admin/*` — не изменять
- `app/(investor)/catalog/*` — не изменять
- `app/(investor)/applications/*` — не изменять
- `app/(investor)/deals/[id]/apply/*` — не изменять
- `app/api/investor/applications/*` — не изменять
- `app/api/investor/catalog/*` — не изменять
- `app/api/investor/deals/*` — не изменять
- `supabase/migrations/001_initial_schema.sql` … `006_investor_catalog_view.sql` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t10.test.ts` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки `REVIEWED: T10`:

```
DONE: T11
```

И в раздел "Выполненные задачи":

```
### T11 — Избранное, заметки, личные статусы инвестора
Создано/изменено:
- supabase/migrations/007_investor_favorites_status.sql — ADD COLUMN personal_status, updated_at в investor_favorites
- types/index.ts — добавлены InvestorPersonalStatus, InvestorFavoriteRow, InvestorFavoriteInsert, InvestorFavoriteDetail
- app/api/investor/favorites/route.ts — POST upsert + GET список с фильтром по personal_status
- app/api/investor/favorites/[id]/route.ts — PATCH обновление notes/status + DELETE удаление
- app/(investor)/deals/[id]/favorite-panel.tsx — панель избранного в Deal Room
- app/(investor)/deals/[id]/page.tsx — добавлен FavoritePanel
- app/(investor)/favorites/favorites-client.tsx — страница избранного с фильтрацией
- app/(investor)/favorites/page.tsx — серверная обёртка
- __tests__/t11.test.ts — тесты
```
