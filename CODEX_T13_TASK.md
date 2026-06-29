# ТЗ T13 — Портфель инвестора, фиксация факта инвестиции

**Дата:** 2026-06-28
**Зависимости:** T12 выполнен (Deal Room с калькулятором работает)
**Тестовых файлов сейчас:** t1 … t12 (12 файлов)
**Размер:** L

---

## Зачем это нужно

Платформа не принимает деньги и не оформляет сделки. Но инвестор хочет
видеть, в каких проектах он уже участвует, сколько вложил и каков статус
каждой инвестиции. Модуль «Портфель» позволяет вручную зафиксировать факт
инвестиции (сделка заключена вне платформы) и видеть агрегированную
статистику: сколько вложено, сколько активных позиций, сколько выходов.

---

## Что НЕ делаем в этом этапе

- Не делать дашборд инвестора — это T14
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `__tests__/t12.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`, `lib/calc/*`
- Не трогать `app/(investor)/catalog/*`
- Не трогать `app/(investor)/applications/*`
- Не трогать `app/(investor)/favorites/*`
- Не трогать `app/(investor)/deals/[id]/apply/*`
- Не трогать `app/(investor)/deals/[id]/favorite-panel.tsx`
- Не трогать `app/(investor)/deals/[id]/yield-calculator.tsx`
- Не трогать `app/api/investor/catalog/*`, `app/api/investor/favorites/*`, `app/api/investor/applications/*`
- NO новых npm-зависимостей

---

## Шаг 1 — Миграция

Создать `supabase/migrations/008_investor_portfolio.sql`:

```sql
-- Портфель инвестора: фиксация факта инвестиции вне платформы

CREATE TABLE IF NOT EXISTS investor_portfolio (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount_invested numeric   NOT NULL CHECK (amount_invested > 0),
  date_invested date        NOT NULL,
  instrument    text        NOT NULL DEFAULT 'equity'
                              CHECK (instrument IN ('equity', 'convertible_note', 'safe', 'debt', 'other')),
  deal_status   text        NOT NULL DEFAULT 'active'
                              CHECK (deal_status IN ('active', 'exited', 'written_off')),
  notes         text,
  exit_amount   numeric     CHECK (exit_amount > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investor_portfolio ENABLE ROW LEVEL SECURITY;

-- Инвестор видит только свои записи
CREATE POLICY "portfolio_investor_self" ON investor_portfolio
  FOR ALL USING (investor_id = auth.uid());

-- Администраторы видят все
CREATE POLICY "portfolio_admin" ON investor_portfolio
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
```

---

## Шаг 2 — TypeScript типы

Добавить в конец `types/index.ts`:

```typescript
export type PortfolioInstrument =
  | 'equity'
  | 'convertible_note'
  | 'safe'
  | 'debt'
  | 'other';

export type PortfolioDealStatus = 'active' | 'exited' | 'written_off';

export interface PortfolioRow {
  id: string;
  investor_id: string;
  project_id: string;
  amount_invested: number;
  date_invested: string; // ISO date: "YYYY-MM-DD"
  instrument: PortfolioInstrument;
  deal_status: PortfolioDealStatus;
  notes: string | null;
  exit_amount: number | null;
  created_at: string;
  updated_at: string;
}
export type PortfolioInsert = Omit<PortfolioRow, 'id' | 'created_at' | 'updated_at'>;

export interface PortfolioDetail extends PortfolioRow {
  project_name: string;
  project_industry: string | null;
  project_stage: ProjectStage | null;
}

export interface PortfolioStats {
  total_entries: number;
  total_invested: number;      // сумма всех amount_invested
  total_active: number;        // кол-во активных позиций
  total_exited: number;        // кол-во выходов
  total_written_off: number;   // кол-во списанных
  total_exit_amount: number;   // сумма exit_amount у выходов
}
```

---

## Шаг 3 — Утилита статистики

Создать `lib/portfolio/stats.ts`:

```typescript
import type { PortfolioRow, PortfolioStats } from '@/types';

export function computePortfolioStats(entries: PortfolioRow[]): PortfolioStats {
  return {
    total_entries: entries.length,
    total_invested: entries.reduce((s, e) => s + e.amount_invested, 0),
    total_active: entries.filter((e) => e.deal_status === 'active').length,
    total_exited: entries.filter((e) => e.deal_status === 'exited').length,
    total_written_off: entries.filter((e) => e.deal_status === 'written_off').length,
    total_exit_amount: entries.reduce((s, e) => s + (e.exit_amount ?? 0), 0),
  };
}
```

---

## Шаг 4 — API routes

### 4.1 GET + POST `/api/investor/portfolio`

Создать `app/api/investor/portfolio/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computePortfolioStats } from '@/lib/portfolio/stats';
import type {
  PortfolioDetail,
  PortfolioInsert,
  PortfolioInstrument,
  PortfolioDealStatus,
  ProjectStage,
} from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin): string {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// GET /api/investor/portfolio?investor_id=xxx
export async function GET(request: NextRequest) {
  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('investor_portfolio')
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at, projects(name)'
    )
    .eq('investor_id', investor_id)
    .order('date_invested', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projectIds = (data ?? []).map((row) => row.project_id);
  const catalogMap: Record<string, { industry: string | null; stage: ProjectStage | null }> = {};

  if (projectIds.length > 0) {
    const { data: catalog } = await supabase
      .from('v_investor_catalog')
      .select('id, industry, stage')
      .in('id', projectIds);

    for (const row of catalog ?? []) {
      catalogMap[row.id] = {
        industry: row.industry ?? null,
        stage: (row.stage as ProjectStage | null) ?? null,
      };
    }
  }

  const portfolio: PortfolioDetail[] = (data ?? []).map((row) => ({
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    project_industry: catalogMap[row.project_id]?.industry ?? null,
    project_stage: catalogMap[row.project_id]?.stage ?? null,
    amount_invested: row.amount_invested,
    date_invested: row.date_invested,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    notes: row.notes,
    exit_amount: row.exit_amount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  const stats = computePortfolioStats(portfolio);

  return NextResponse.json({ portfolio, stats });
}

// POST /api/investor/portfolio
// Body: { investor_id, project_id, amount_invested, date_invested, instrument, deal_status?, notes?, exit_amount? }
export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  const body = (await request.json()) as {
    investor_id?: string;
    project_id?: string;
    amount_invested?: number;
    date_invested?: string;
    instrument?: PortfolioInstrument;
    deal_status?: PortfolioDealStatus;
    notes?: string | null;
    exit_amount?: number | null;
  };

  const {
    investor_id,
    project_id,
    amount_invested,
    date_invested,
    instrument,
    deal_status,
    notes,
    exit_amount,
  } = body;

  if (
    !investor_id ||
    !project_id ||
    typeof amount_invested !== 'number' ||
    amount_invested <= 0 ||
    !date_invested ||
    !instrument
  ) {
    return NextResponse.json(
      {
        error:
          'investor_id, project_id, amount_invested (> 0), date_invested и instrument обязательны',
      },
      { status: 400 }
    );
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) {
    return NextResponse.json(
      { error: 'Проект не найден или не одобрен' },
      { status: 404 }
    );
  }

  const now = new Date().toISOString();
  const insert: PortfolioInsert = {
    investor_id,
    project_id,
    amount_invested,
    date_invested,
    instrument,
    deal_status: deal_status ?? 'active',
    notes: notes ?? null,
    exit_amount: exit_amount ?? null,
  };

  const { data: row, error } = await supabase
    .from('investor_portfolio')
    .insert({ ...insert, updated_at: now })
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at'
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detail: PortfolioDetail = {
    ...row,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    project_name: project.name,
    project_industry: null,
    project_stage: null,
  };

  return NextResponse.json(detail, { status: 201 });
}
```

### 4.2 PATCH + DELETE `/api/investor/portfolio/[id]`

Создать `app/api/investor/portfolio/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PortfolioDetail, PortfolioInstrument, PortfolioDealStatus, ProjectStage } from '@/types';

type ProjectJoin = { name: string } | { name: string }[] | null;

function getProjectName(projects: ProjectJoin): string {
  return (Array.isArray(projects) ? projects[0]?.name : projects?.name) ?? '';
}

// PATCH /api/investor/portfolio/[id]
// Body: { investor_id, deal_status?, notes?, exit_amount?, amount_invested?, date_invested?, instrument? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;

  const body = (await request.json()) as {
    investor_id?: string;
    deal_status?: PortfolioDealStatus;
    notes?: string | null;
    exit_amount?: number | null;
    amount_invested?: number;
    date_invested?: string;
    instrument?: PortfolioInstrument;
  };

  const { investor_id, ...updates } = body;

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_portfolio')
    .select('id')
    .eq('id', id)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const { data: row, error } = await supabase
    .from('investor_portfolio')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(
      'id, investor_id, project_id, amount_invested, date_invested, instrument, deal_status, notes, exit_amount, created_at, updated_at, projects(name)'
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const detail: PortfolioDetail = {
    id: row.id,
    investor_id: row.investor_id,
    project_id: row.project_id,
    project_name: getProjectName(row.projects as ProjectJoin),
    project_industry: null,
    project_stage: null,
    amount_invested: row.amount_invested,
    date_invested: row.date_invested,
    instrument: row.instrument as PortfolioInstrument,
    deal_status: row.deal_status as PortfolioDealStatus,
    notes: row.notes,
    exit_amount: row.exit_amount,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };

  return NextResponse.json(detail);
}

// DELETE /api/investor/portfolio/[id]?investor_id=xxx
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const investor_id = searchParams.get('investor_id');

  if (!investor_id) {
    return NextResponse.json({ error: 'investor_id обязателен' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('investor_portfolio')
    .select('id')
    .eq('id', id)
    .eq('investor_id', investor_id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Запись не найдена' }, { status: 404 });
  }

  const { error } = await supabase
    .from('investor_portfolio')
    .delete()
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

---

## Шаг 5 — UI страницы

### 5.1 Portfolio page (server shell)

Создать `app/(investor)/portfolio/page.tsx`:

```typescript
import { PortfolioClient } from './portfolio-client';

export const dynamic = 'force-dynamic';

export default function PortfolioPage() {
  return <PortfolioClient />;
}
```

### 5.2 Portfolio client component

Создать `app/(investor)/portfolio/portfolio-client.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { PortfolioDetail, PortfolioStats, PortfolioDealStatus } from '@/types';

const MOCK_INVESTOR_ID = 'demo-investor-id';

const INSTRUMENT_LABELS: Record<string, string> = {
  equity: 'Акции (Equity)',
  convertible_note: 'Конвертируемый займ',
  safe: 'SAFE',
  debt: 'Долг',
  other: 'Другое',
};

const STATUS_LABELS: Record<PortfolioDealStatus, string> = {
  active: 'Активная',
  exited: 'Выход',
  written_off: 'Списана',
};

const STATUS_VARIANTS: Record<PortfolioDealStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  exited: 'secondary',
  written_off: 'destructive',
};

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU');
}

export function PortfolioClient() {
  const [portfolio, setPortfolio] = useState<PortfolioDetail[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const investorId = MOCK_INVESTOR_ID;

  useEffect(() => {
    void loadPortfolio();
  }, []);

  async function loadPortfolio() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/investor/portfolio?investor_id=${investorId}`);
      if (!res.ok) throw new Error('Ошибка загрузки портфеля');
      const data = (await res.json()) as { portfolio: PortfolioDetail[]; stats: PortfolioStats };
      setPortfolio(data.portfolio);
      setStats(data.stats);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/investor/portfolio/${id}?investor_id=${investorId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Ошибка удаления');
      setPortfolio((prev) => prev.filter((e) => e.id !== id));
      void loadPortfolio();
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  async function handleStatusChange(id: string, deal_status: PortfolioDealStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/investor/portfolio/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: investorId, deal_status }),
      });
      if (!res.ok) throw new Error('Ошибка обновления');
      const updated = (await res.json()) as PortfolioDetail;
      setPortfolio((prev) => prev.map((e) => (e.id === id ? { ...e, ...updated } : e)));
      void loadPortfolio();
    } catch {
      // ignore
    } finally {
      setUpdatingId(null);
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Загрузка портфеля...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-600">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Мой портфель</h1>
        <Button asChild>
          <Link href="/portfolio/add">+ Добавить инвестицию</Link>
        </Button>
      </div>

      {/* Дисклеймер */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Дисклеймер:</strong> Данный раздел предназначен для учёта фактов инвестирования,
        совершённых вне платформы. Платформа не является организатором сделок, не принимает
        денежные средства и не несёт ответственности за инвестиционные решения. Прошлые результаты
        не гарантируют будущих. Инвестирование в стартапы сопряжено с риском полной потери вложений.
      </div>

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{fmt(stats.total_invested)} ₽</div>
              <div className="text-xs text-muted-foreground mt-1">Всего инвестировано</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_entries}</div>
              <div className="text-xs text-muted-foreground mt-1">Позиций в портфеле</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total_active}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Активных · {stats.total_exited} выходов · {stats.total_written_off} списано
              </div>
            </CardContent>
          </Card>
          {stats.total_exit_amount > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{fmt(stats.total_exit_amount)} ₽</div>
                <div className="text-xs text-muted-foreground mt-1">Получено при выходах</div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Список позиций */}
      {portfolio.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground py-12">
            <p>В портфеле пока нет записей.</p>
            <p className="text-sm mt-2">
              Зафиксируйте инвестицию со страницы проекта или нажмите «Добавить инвестицию».
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {portfolio.map((entry) => (
            <Card key={entry.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">
                      <Link
                        href={`/deals/${entry.project_id}`}
                        className="hover:underline"
                      >
                        {entry.project_name}
                      </Link>
                    </CardTitle>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <Badge variant={STATUS_VARIANTS[entry.deal_status]}>
                        {STATUS_LABELS[entry.deal_status]}
                      </Badge>
                      {entry.project_industry && (
                        <Badge variant="outline">{entry.project_industry}</Badge>
                      )}
                      {entry.project_stage && (
                        <Badge variant="outline">{entry.project_stage}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{fmt(entry.amount_invested)} ₽</div>
                    <div className="text-xs text-muted-foreground">
                      {INSTRUMENT_LABELS[entry.instrument] ?? entry.instrument}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(entry.date_invested)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {entry.exit_amount !== null && entry.deal_status === 'exited' && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Получено при выходе: </span>
                    <span className="font-medium">{fmt(entry.exit_amount)} ₽</span>
                  </div>
                )}
                {entry.notes && (
                  <p className="text-sm text-muted-foreground">{entry.notes}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="text-sm border rounded px-2 py-1 bg-background"
                    value={entry.deal_status}
                    disabled={updatingId === entry.id}
                    onChange={(e) =>
                      void handleStatusChange(entry.id, e.target.value as PortfolioDealStatus)
                    }
                  >
                    <option value="active">Активная</option>
                    <option value="exited">Выход</option>
                    <option value="written_off">Списана</option>
                  </select>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={deletingId === entry.id}
                    onClick={() => void handleDelete(entry.id)}
                  >
                    {deletingId === entry.id ? 'Удаление...' : 'Удалить'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

### 5.3 Add portfolio entry page

Создать `app/(investor)/portfolio/add/page.tsx`:

```typescript
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PortfolioInstrument, PortfolioDealStatus } from '@/types';

const MOCK_INVESTOR_ID = 'demo-investor-id';

function AddPortfolioForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromQuery = searchParams.get('project_id') ?? '';

  const [projectId, setProjectId] = useState(projectIdFromQuery);
  const [amountInvested, setAmountInvested] = useState('');
  const [dateInvested, setDateInvested] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [instrument, setInstrument] = useState<PortfolioInstrument>('equity');
  const [dealStatus, setDealStatus] = useState<PortfolioDealStatus>('active');
  const [notes, setNotes] = useState('');
  const [exitAmount, setExitAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(amountInvested.replace(/\s/g, '').replace(',', '.'));
    if (!projectId.trim() || isNaN(amount) || amount <= 0) {
      setError('Введите корректный ID проекта и сумму инвестиции (> 0)');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        investor_id: MOCK_INVESTOR_ID,
        project_id: projectId.trim(),
        amount_invested: amount,
        date_invested: dateInvested,
        instrument,
        deal_status: dealStatus,
        notes: notes.trim() || null,
        exit_amount:
          dealStatus === 'exited' && exitAmount
            ? parseFloat(exitAmount.replace(/\s/g, '').replace(',', '.'))
            : null,
      };
      const res = await fetch('/api/investor/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Ошибка при сохранении');
      }
      router.push('/portfolio');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Зафиксировать инвестицию</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Дисклеймер */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <strong>Дисклеймер:</strong> Фиксация инвестиции носит информационный характер.
            Платформа не участвует в сделке, не принимает денежные средства и не несёт
            ответственности за инвестиционные решения. Инвестирование в стартапы сопряжено
            с риском полной потери вложений. Сделки заключаются вне платформы.
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="project-id">ID проекта</Label>
              <Input
                id="project-id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID проекта"
                readOnly={!!projectIdFromQuery}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount">Сумма инвестиции (₽)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                value={amountInvested}
                onChange={(e) => setAmountInvested(e.target.value)}
                placeholder="1 000 000"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="date">Дата инвестиции</Label>
              <Input
                id="date"
                type="date"
                value={dateInvested}
                onChange={(e) => setDateInvested(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="instrument">Инструмент</Label>
              <select
                id="instrument"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as PortfolioInstrument)}
              >
                <option value="equity">Акции (Equity)</option>
                <option value="convertible_note">Конвертируемый займ</option>
                <option value="safe">SAFE</option>
                <option value="debt">Долг</option>
                <option value="other">Другое</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="deal-status">Статус сделки</Label>
              <select
                id="deal-status"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={dealStatus}
                onChange={(e) => setDealStatus(e.target.value as PortfolioDealStatus)}
              >
                <option value="active">Активная</option>
                <option value="exited">Выход</option>
                <option value="written_off">Списана</option>
              </select>
            </div>

            {dealStatus === 'exited' && (
              <div className="space-y-1">
                <Label htmlFor="exit-amount">Сумма при выходе (₽)</Label>
                <Input
                  id="exit-amount"
                  type="text"
                  inputMode="numeric"
                  value={exitAmount}
                  onChange={(e) => setExitAmount(e.target.value)}
                  placeholder="2 000 000"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="notes">Заметки (необязательно)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Условия, контактные данные, детали сделки..."
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Сохранение...' : 'Зафиксировать инвестицию'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/portfolio')}
              >
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddPortfolioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка...</div>}>
      <AddPortfolioForm />
    </Suspense>
  );
}
```

---

## Шаг 6 — Интеграция в Deal Room

Изменить `app/(investor)/deals/[id]/page.tsx` — найти блок `{/* CTA */}` в конце файла:

```tsx
      {/* CTA */}
      <div className="flex justify-center pt-4 pb-8">
        <Button asChild size="lg">
          <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
        </Button>
      </div>
```

Заменить на:

```tsx
      {/* CTA */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4 pb-8">
        <Button asChild size="lg">
          <Link href={`/deals/${deal.id}/apply`}>Оставить заявку</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/portfolio/add?project_id=${deal.id}`}>Зафиксировать инвестицию</Link>
        </Button>
      </div>
```

---

## Шаг 7 — Тесты

Создать `__tests__/t13.test.ts`:

```typescript
import { computePortfolioStats } from '@/lib/portfolio/stats';
import type {
  PortfolioRow,
  PortfolioStats,
  PortfolioDetail,
  PortfolioInstrument,
  PortfolioDealStatus,
} from '@/types';

// --- helpers ---

function makeRow(overrides: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    id: 'port-1',
    investor_id: 'inv-1',
    project_id: 'proj-1',
    amount_invested: 1_000_000,
    date_invested: '2026-01-15',
    instrument: 'equity',
    deal_status: 'active',
    notes: null,
    exit_amount: null,
    created_at: '2026-01-15T10:00:00Z',
    updated_at: '2026-01-15T10:00:00Z',
    ...overrides,
  };
}

function makeDetail(overrides: Partial<PortfolioDetail> = {}): PortfolioDetail {
  return {
    ...makeRow(),
    project_name: 'Test Project',
    project_industry: 'FinTech',
    project_stage: 'seed',
    ...overrides,
  };
}

// --- type tests ---

describe('T13 PortfolioRow type', () => {
  it('has all required fields', () => {
    const row = makeRow();
    expect(typeof row.id).toBe('string');
    expect(typeof row.investor_id).toBe('string');
    expect(typeof row.project_id).toBe('string');
    expect(typeof row.amount_invested).toBe('number');
    expect(typeof row.date_invested).toBe('string');
    expect(typeof row.instrument).toBe('string');
    expect(typeof row.deal_status).toBe('string');
  });

  it('notes and exit_amount can be null', () => {
    const row = makeRow({ notes: null, exit_amount: null });
    expect(row.notes).toBeNull();
    expect(row.exit_amount).toBeNull();
  });

  it('exit_amount can be a number', () => {
    const row = makeRow({ exit_amount: 2_000_000 });
    expect(row.exit_amount).toBe(2_000_000);
  });
});

describe('T13 PortfolioDetail type', () => {
  it('extends PortfolioRow with project fields', () => {
    const detail = makeDetail();
    expect(typeof detail.project_name).toBe('string');
    expect(detail.project_industry).toBe('FinTech');
    expect(detail.project_stage).toBe('seed');
  });

  it('project_industry and project_stage can be null', () => {
    const detail = makeDetail({ project_industry: null, project_stage: null });
    expect(detail.project_industry).toBeNull();
    expect(detail.project_stage).toBeNull();
  });
});

describe('T13 PortfolioInstrument values', () => {
  const instruments: PortfolioInstrument[] = [
    'equity',
    'convertible_note',
    'safe',
    'debt',
    'other',
  ];

  it('all instrument values are strings', () => {
    for (const inst of instruments) {
      expect(typeof inst).toBe('string');
    }
  });
});

describe('T13 PortfolioDealStatus values', () => {
  const statuses: PortfolioDealStatus[] = ['active', 'exited', 'written_off'];

  it('all status values are strings', () => {
    for (const s of statuses) {
      expect(typeof s).toBe('string');
    }
  });
});

// --- computePortfolioStats tests ---

describe('T13 computePortfolioStats — empty portfolio', () => {
  const stats = computePortfolioStats([]);

  it('total_entries = 0', () => {
    expect(stats.total_entries).toBe(0);
  });

  it('total_invested = 0', () => {
    expect(stats.total_invested).toBe(0);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });

  it('total_exited = 0', () => {
    expect(stats.total_exited).toBe(0);
  });

  it('total_written_off = 0', () => {
    expect(stats.total_written_off).toBe(0);
  });

  it('total_exit_amount = 0', () => {
    expect(stats.total_exit_amount).toBe(0);
  });
});

describe('T13 computePortfolioStats — single active entry', () => {
  const entries = [makeRow({ amount_invested: 500_000, deal_status: 'active' })];
  const stats = computePortfolioStats(entries);

  it('total_entries = 1', () => {
    expect(stats.total_entries).toBe(1);
  });

  it('total_invested = 500_000', () => {
    expect(stats.total_invested).toBe(500_000);
  });

  it('total_active = 1', () => {
    expect(stats.total_active).toBe(1);
  });

  it('total_exited = 0', () => {
    expect(stats.total_exited).toBe(0);
  });

  it('total_written_off = 0', () => {
    expect(stats.total_written_off).toBe(0);
  });

  it('total_exit_amount = 0 (no exit)', () => {
    expect(stats.total_exit_amount).toBe(0);
  });
});

describe('T13 computePortfolioStats — mixed entries', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', amount_invested: 1_000_000, deal_status: 'active', exit_amount: null }),
    makeRow({ id: '2', amount_invested: 500_000, deal_status: 'exited', exit_amount: 1_200_000 }),
    makeRow({ id: '3', amount_invested: 200_000, deal_status: 'written_off', exit_amount: null }),
    makeRow({ id: '4', amount_invested: 300_000, deal_status: 'active', exit_amount: null }),
  ];
  const stats = computePortfolioStats(entries);

  it('total_entries = 4', () => {
    expect(stats.total_entries).toBe(4);
  });

  it('total_invested = sum of all', () => {
    expect(stats.total_invested).toBe(2_000_000);
  });

  it('total_active = 2', () => {
    expect(stats.total_active).toBe(2);
  });

  it('total_exited = 1', () => {
    expect(stats.total_exited).toBe(1);
  });

  it('total_written_off = 1', () => {
    expect(stats.total_written_off).toBe(1);
  });

  it('total_exit_amount = 1_200_000', () => {
    expect(stats.total_exit_amount).toBe(1_200_000);
  });
});

describe('T13 computePortfolioStats — multiple exits', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', amount_invested: 1_000_000, deal_status: 'exited', exit_amount: 3_000_000 }),
    makeRow({ id: '2', amount_invested: 500_000, deal_status: 'exited', exit_amount: 800_000 }),
  ];
  const stats = computePortfolioStats(entries);

  it('total_exit_amount = 3_800_000', () => {
    expect(stats.total_exit_amount).toBe(3_800_000);
  });

  it('total_exited = 2', () => {
    expect(stats.total_exited).toBe(2);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });
});

describe('T13 computePortfolioStats — exit_amount null not counted', () => {
  const entries: PortfolioRow[] = [
    makeRow({ id: '1', deal_status: 'exited', exit_amount: null }),
    makeRow({ id: '2', deal_status: 'exited', exit_amount: 500_000 }),
  ];
  const stats = computePortfolioStats(entries);

  it('null exit_amount treated as 0', () => {
    expect(stats.total_exit_amount).toBe(500_000);
  });
});

describe('T13 PortfolioStats type completeness', () => {
  it('stats has all required fields', () => {
    const stats: PortfolioStats = computePortfolioStats([]);
    expect(typeof stats.total_entries).toBe('number');
    expect(typeof stats.total_invested).toBe('number');
    expect(typeof stats.total_active).toBe('number');
    expect(typeof stats.total_exited).toBe('number');
    expect(typeof stats.total_written_off).toBe('number');
    expect(typeof stats.total_exit_amount).toBe('number');
  });
});

describe('T13 computePortfolioStats — single written_off entry', () => {
  const entries = [makeRow({ amount_invested: 750_000, deal_status: 'written_off' })];
  const stats = computePortfolioStats(entries);

  it('total_written_off = 1', () => {
    expect(stats.total_written_off).toBe(1);
  });

  it('total_active = 0', () => {
    expect(stats.total_active).toBe(0);
  });

  it('total_invested includes written_off amount', () => {
    expect(stats.total_invested).toBe(750_000);
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

1. `supabase/migrations/008_investor_portfolio.sql` — таблица `investor_portfolio` с RLS
2. `types/index.ts` — добавлены `PortfolioInstrument`, `PortfolioDealStatus`, `PortfolioRow`,
   `PortfolioInsert`, `PortfolioDetail`, `PortfolioStats`
3. `lib/portfolio/stats.ts` — функция `computePortfolioStats`
4. `app/api/investor/portfolio/route.ts` — GET + POST
5. `app/api/investor/portfolio/[id]/route.ts` — PATCH + DELETE
6. `app/(investor)/portfolio/page.tsx` — серверная обёртка
7. `app/(investor)/portfolio/portfolio-client.tsx` — клиентский компонент с аггрегатами и списком
8. `app/(investor)/portfolio/add/page.tsx` — форма добавления с дисклеймером
9. `app/(investor)/deals/[id]/page.tsx` — кнопка «Зафиксировать инвестицию» в CTA-блоке
10. `__tests__/t13.test.ts` — все тесты проходят
11. `npm run build` — без ошибок TypeScript
12. `npm run lint` — без ошибок ESLint
13. `npm test` — все тесты проходят (t1 … t13)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/investor/catalog/*` — не изменять
- `app/api/investor/favorites/*` — не изменять
- `app/api/investor/applications/*` — не изменять
- `app/api/investor/deals/*` — не изменять
- `app/(investor)/catalog/*` — не изменять
- `app/(investor)/applications/*` — не изменять
- `app/(investor)/favorites/*` — не изменять
- `app/(investor)/deals/[id]/apply/*` — не изменять
- `app/(investor)/deals/[id]/favorite-panel.tsx` — не изменять
- `app/(investor)/deals/[id]/yield-calculator.tsx` — не изменять
- `lib/calc/*` — не изменять
- `supabase/migrations/001_*` … `007_*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t12.test.ts` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки `REVIEWED: T12`:

```
DONE: T13
```

И в раздел "Выполненные задачи":

```
### T13 — Портфель инвестора, фиксация факта инвестиции
Создано/изменено:
- supabase/migrations/008_investor_portfolio.sql — таблица investor_portfolio + RLS
- types/index.ts — добавлены PortfolioInstrument, PortfolioDealStatus, PortfolioRow, PortfolioInsert, PortfolioDetail, PortfolioStats
- lib/portfolio/stats.ts — функция computePortfolioStats
- app/api/investor/portfolio/route.ts — GET список + статистика, POST добавить запись
- app/api/investor/portfolio/[id]/route.ts — PATCH обновить статус, DELETE удалить
- app/(investor)/portfolio/page.tsx — серверная обёртка
- app/(investor)/portfolio/portfolio-client.tsx — клиентский компонент портфеля
- app/(investor)/portfolio/add/page.tsx — форма фиксации инвестиции
- app/(investor)/deals/[id]/page.tsx — добавлена кнопка «Зафиксировать инвестицию»
- __tests__/t13.test.ts — тесты
```
