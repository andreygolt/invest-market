# ТЗ T3 — Кабинет проекта: анкета (секции 5-8), загрузка документов

**Дата:** 2026-06-27
**Зависимости:** T2 выполнен (секции 1-4, API project/my, API project/questionnaire)
**Размер:** L

---

## Что НЕ делаем в этом этапе

- Не делать AI-анализ документов (это T5-T6)
- Не делать статусы проекта/видео (это T4)
- Не трогать middleware.ts, lib/supabase/*, supabase/migrations/
- Не изменять секции 1-4 в questionnaire page
- Не трогать __tests__/t1.test.ts, __tests__/t2.test.ts

---

## Контекст

Пользователь с ролью `project` завершил секции 1-4 → попадает на страницу секций 5-8 → заполняет финансовые данные, инвестиционные условия, трекшн и дополнительную информацию → загружает документы (pitch deck, финмодель, устав и т.д.) → данные сохраняются в `project_questionnaire` (секции s5-s8), документы в Supabase Storage.

Таблица `project_documents`: `id`, `project_id`, `doc_type`, `storage_path`, `filename`, `uploaded_at`.
Bucket Supabase Storage: `project-docs` (приватный, доступ только владельцу проекта).

---

## Шаг 1 — Миграция БД

Создать `supabase/migrations/003_project_documents.sql`:

```sql
-- Таблица документов проекта
CREATE TABLE IF NOT EXISTS project_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_type      text NOT NULL,
  storage_path  text NOT NULL,
  filename      text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_idx ON project_documents(project_id);

-- RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит свои документы
CREATE POLICY "project_owner_select_docs" ON project_documents
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Владелец проекта добавляет документы
CREATE POLICY "project_owner_insert_docs" ON project_documents
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Владелец проекта удаляет свои документы
CREATE POLICY "project_owner_delete_docs" ON project_documents
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Модераторы и администраторы видят все документы
CREATE POLICY "admin_select_docs" ON project_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );
```

---

## Шаг 2 — Типы TypeScript (дополнить types/index.ts)

Добавить в конец `types/index.ts` (не удалять существующее):

```typescript
export type DocumentType =
  | 'pitch_deck'
  | 'financial_model'
  | 'charter'
  | 'team_cv'
  | 'legal_docs'
  | 'other';

export interface QS5Answers {
  revenue_current: string;
  revenue_last_year: string;
  burn_rate: string;
  runway_months: string;
  unit_economics: string;
  financial_model_ready: boolean;
}

export interface QS6Answers {
  investment_ask: string;
  valuation_pre_money: string;
  investment_type: 'equity' | 'convertible_note' | 'safe' | 'debt' | '';
  use_of_funds: string;
  previous_rounds: string;
  total_raised: string;
}

export interface QS7Answers {
  monthly_users: string;
  paying_customers: string;
  mrr: string;
  growth_rate_mom: string;
  key_metrics: string;
  notable_clients: string;
  awards: string;
}

export interface QS8Answers {
  exit_strategy: string;
  risks: string;
  additional_info: string;
  how_found_platform: string;
}

export interface ProjectDocument {
  id: string;
  project_id: string;
  doc_type: DocumentType;
  storage_path: string;
  filename: string;
  uploaded_at: string;
}
```

---

## Шаг 3 — API: секции 5-8

Расширить `app/api/project/questionnaire/route.ts` — изменить строку с VALID_SECTIONS:

```typescript
const VALID_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;
```

Больше ничего в этом файле не менять.

---

## Шаг 4 — API: загрузка документов

### 4a. GET /api/project/documents

Создать `app/api/project/documents/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ documents: [] });

  const { data: documents } = await supabase
    .from('project_documents')
    .select('*')
    .eq('project_id', project.id)
    .order('uploaded_at', { ascending: false });

  return NextResponse.json({ documents: documents ?? [] });
}
```

### 4b. POST /api/project/documents/upload

Создать `app/api/project/documents/upload/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { DocumentType } from '@/types';

const VALID_DOC_TYPES: DocumentType[] = [
  'pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_MIME = [
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (!project) return NextResponse.json({ error: 'project not found' }, { status: 404 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const docType = formData.get('doc_type') as string | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });
  if (!docType || !VALID_DOC_TYPES.includes(docType as DocumentType)) {
    return NextResponse.json({ error: 'invalid doc_type' }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'file too large (max 20MB)' }, { status: 400 });
  }
  if (!ALLOWED_MIME.includes(file.type)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });
  }

  const ext = file.name.split('.').pop() ?? 'bin';
  const storagePath = `${project.id}/${docType}_${Date.now()}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('project-docs')
    .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: doc, error: dbError } = await supabase
    .from('project_documents')
    .insert({
      project_id: project.id,
      doc_type: docType,
      storage_path: storagePath,
      filename: file.name,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ document: doc }, { status: 201 });
}
```

### 4c. DELETE /api/project/documents/[id]

Создать `app/api/project/documents/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Fetch doc and verify ownership via RLS
  const { data: doc } = await supabase
    .from('project_documents')
    .select('storage_path, project_id')
    .eq('id', id)
    .maybeSingle();

  if (!doc) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // Remove from storage
  await supabase.storage.from('project-docs').remove([doc.storage_path]);

  // Remove from DB (RLS enforces ownership)
  const { error } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
```

---

## Шаг 5 — Страница анкеты секций 5-8

Создать `app/(project)/questionnaire/sections58/page.tsx` — Client Component.

```tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import type { QS5Answers, QS6Answers, QS7Answers, QS8Answers } from '@/types';

const STEPS = ['Финансы', 'Инвестиции', 'Трекшн', 'Дополнительно'] as const;
const SECTIONS = ['s5', 's6', 's7', 's8'] as const;
const TOTAL = STEPS.length;

// --- Section 5 ---
function Section5({ value, onChange }: { value: Partial<QS5Answers>; onChange: (v: Partial<QS5Answers>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Текущая выручка (₽/мес)</label>
          <input type="text" value={value.revenue_current ?? ''}
            onChange={e => onChange({ ...value, revenue_current: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="0" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Выручка за прошлый год (₽)</label>
          <input type="text" value={value.revenue_last_year ?? ''}
            onChange={e => onChange({ ...value, revenue_last_year: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="0" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Burn Rate (₽/мес)</label>
          <input type="text" value={value.burn_rate ?? ''}
            onChange={e => onChange({ ...value, burn_rate: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="0" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Runway (месяцев)</label>
          <input type="number" value={value.runway_months ?? ''} min={0}
            onChange={e => onChange({ ...value, runway_months: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="12" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Unit-экономика</label>
        <textarea value={value.unit_economics ?? ''} rows={2}
          onChange={e => onChange({ ...value, unit_economics: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="CAC, LTV, ARPU, маржинальность..." />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="fin_model" checked={value.financial_model_ready ?? false}
          onChange={e => onChange({ ...value, financial_model_ready: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300" />
        <label htmlFor="fin_model" className="text-sm">Финансовая модель готова</label>
      </div>
    </div>
  );
}

// --- Section 6 ---
function Section6({ value, onChange }: { value: Partial<QS6Answers>; onChange: (v: Partial<QS6Answers>) => void }) {
  const TYPES = [
    { value: 'equity', label: 'Доля в компании (Equity)' },
    { value: 'convertible_note', label: 'Конвертируемый займ' },
    { value: 'safe', label: 'SAFE' },
    { value: 'debt', label: 'Долговое финансирование' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500 bg-gray-50 border rounded p-3">
        Платформа не принимает денежные средства и не является участником сделки. Все сделки оформляются напрямую между проектом и инвестором.
      </p>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Объём привлечения (₽) *</label>
          <input type="text" value={value.investment_ask ?? ''} required
            onChange={e => onChange({ ...value, investment_ask: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="10 000 000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Pre-money оценка (₽)</label>
          <input type="text" value={value.valuation_pre_money ?? ''}
            onChange={e => onChange({ ...value, valuation_pre_money: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="50 000 000" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Тип инструмента *</label>
        <select value={value.investment_type ?? ''} required
          onChange={e => onChange({ ...value, investment_type: e.target.value as QS6Answers['investment_type'] })}
          className="w-full border rounded px-3 py-2 text-sm">
          <option value="">Выбрать...</option>
          {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">На что пойдут инвестиции *</label>
        <textarea value={value.use_of_funds ?? ''} rows={3} required
          onChange={e => onChange({ ...value, use_of_funds: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Разработка продукта 40%, маркетинг 30%, команда 30%..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Предыдущие раунды</label>
        <textarea value={value.previous_rounds ?? ''} rows={2}
          onChange={e => onChange({ ...value, previous_rounds: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Pre-seed в 2023: $200k от бизнес-ангела X" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Итого привлечено ранее (₽)</label>
        <input type="text" value={value.total_raised ?? ''}
          onChange={e => onChange({ ...value, total_raised: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="0" />
      </div>
    </div>
  );
}

// --- Section 7 ---
function Section7({ value, onChange }: { value: Partial<QS7Answers>; onChange: (v: Partial<QS7Answers>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Ежемесячные пользователи (MAU)</label>
          <input type="text" value={value.monthly_users ?? ''}
            onChange={e => onChange({ ...value, monthly_users: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="1000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Платящих клиентов</label>
          <input type="text" value={value.paying_customers ?? ''}
            onChange={e => onChange({ ...value, paying_customers: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">MRR (₽)</label>
          <input type="text" value={value.mrr ?? ''}
            onChange={e => onChange({ ...value, mrr: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="500 000" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Рост MoM (%)</label>
          <input type="text" value={value.growth_rate_mom ?? ''}
            onChange={e => onChange({ ...value, growth_rate_mom: e.target.value })}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="15" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Ключевые метрики</label>
        <textarea value={value.key_metrics ?? ''} rows={2}
          onChange={e => onChange({ ...value, key_metrics: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Churn 3%, NPS 70, конверсия 5%..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Крупные клиенты / партнёры</label>
        <textarea value={value.notable_clients ?? ''} rows={2}
          onChange={e => onChange({ ...value, notable_clients: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Сбербанк, Яндекс, Mail.ru..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Награды, акселераторы, гранты</label>
        <textarea value={value.awards ?? ''} rows={2}
          onChange={e => onChange({ ...value, awards: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Участник ФРИИ, грант Сколково, победитель..." />
      </div>
    </div>
  );
}

// --- Section 8 ---
function Section8({ value, onChange }: { value: Partial<QS8Answers>; onChange: (v: Partial<QS8Answers>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Стратегия выхода</label>
        <textarea value={value.exit_strategy ?? ''} rows={2}
          onChange={e => onChange({ ...value, exit_strategy: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="IPO, M&A, buyback через 5 лет..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Основные риски</label>
        <textarea value={value.risks ?? ''} rows={3}
          onChange={e => onChange({ ...value, risks: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Регуляторные, технологические, конкурентные..." />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Дополнительная информация</label>
        <textarea value={value.additional_info ?? ''} rows={3}
          onChange={e => onChange({ ...value, additional_info: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Всё, что хотите добавить" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Как вы узнали о платформе?</label>
        <input type="text" value={value.how_found_platform ?? ''}
          onChange={e => onChange({ ...value, how_found_platform: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm"
          placeholder="Рекомендация, соцсети, конференция..." />
      </div>
    </div>
  );
}

// --- Main Page ---
export default function Sections58Page() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<[Partial<QS5Answers>, Partial<QS6Answers>, Partial<QS7Answers>, Partial<QS8Answers>]>([{}, {}, {}, {}]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const loadSection = useCallback(async (s: number) => {
    const section = SECTIONS[s];
    const r = await fetch(`/api/project/questionnaire?section=${section}`);
    const d = await r.json() as { answers: Record<string, unknown> };
    if (Object.keys(d.answers).length > 0) {
      setAnswers(prev => {
        const next = [...prev] as typeof prev;
        next[s] = d.answers as never;
        return next;
      });
    }
  }, []);

  useEffect(() => {
    loadSection(0).finally(() => setLoading(false));
  }, [loadSection]);

  useEffect(() => {
    if (!loading) loadSection(step);
  }, [step, loading, loadSection]);

  async function saveAndNext() {
    setSaving(true);
    setError('');
    const r = await fetch('/api/project/questionnaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section: SECTIONS[step], answers: answers[step] }),
    });
    if (!r.ok) {
      const d = await r.json() as { error?: string };
      setError(d.error ?? 'Ошибка сохранения');
      setSaving(false);
      return;
    }
    setSaving(false);
    if (step < TOTAL - 1) {
      setStep(s => s + 1);
    } else {
      setDone(true);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Загрузка...</p></div>;
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-semibold mb-2">Анкета заполнена</h1>
          <p className="text-gray-500 text-sm mb-4">Все 8 секций заполнены. Теперь загрузите документы.</p>
          <a href="/project/documents" className="inline-block bg-black text-white px-6 py-2 rounded text-sm font-medium">
            Загрузить документы
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Анкета проекта — секции 5-8</h1>
          <p className="text-sm text-gray-500 mt-1">Шаг {step + 1} из {TOTAL}</p>
        </div>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1 rounded-full mb-1 ${i <= step ? 'bg-black' : 'bg-gray-200'}`} />
              <p className={`text-xs ${i === step ? 'font-medium text-black' : 'text-gray-400'}`}>{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-medium mb-5">{STEPS[step]}</h2>

          {step === 0 && (
            <Section5
              value={answers[0]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[0] = v; return n; })}
            />
          )}
          {step === 1 && (
            <Section6
              value={answers[1]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[1] = v; return n; })}
            />
          )}
          {step === 2 && (
            <Section7
              value={answers[2]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[2] = v; return n; })}
            />
          )}
          {step === 3 && (
            <Section8
              value={answers[3]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[3] = v; return n; })}
            />
          )}

          {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

          <div className="flex justify-between mt-6 pt-4 border-t">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
              className="px-4 py-2 text-sm border rounded disabled:opacity-30">
              Назад
            </button>
            <button onClick={saveAndNext} disabled={saving}
              className="px-6 py-2 text-sm bg-black text-white rounded disabled:opacity-50">
              {saving ? 'Сохраняем...' : step === TOTAL - 1 ? 'Завершить анкету' : 'Сохранить и продолжить'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
```

---

## Шаг 6 — Страница загрузки документов

Создать `app/(project)/documents/page.tsx` — Client Component.

```tsx
'use client';
import { useState, useEffect, useRef } from 'react';
import type { ProjectDocument, DocumentType } from '@/types';

const DOC_TYPES: { value: DocumentType; label: string; required: boolean }[] = [
  { value: 'pitch_deck', label: 'Pitch Deck', required: true },
  { value: 'financial_model', label: 'Финансовая модель', required: false },
  { value: 'charter', label: 'Устав / учредительные документы', required: false },
  { value: 'team_cv', label: 'CV команды', required: false },
  { value: 'legal_docs', label: 'Юридические документы', required: false },
  { value: 'other', label: 'Прочее', required: false },
];

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<DocumentType | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocType, setPendingDocType] = useState<DocumentType | null>(null);

  useEffect(() => {
    fetch('/api/project/documents')
      .then(r => r.json())
      .then((d: { documents: ProjectDocument[] }) => {
        setDocuments(d.documents);
        setLoading(false);
      });
  }, []);

  function triggerUpload(docType: DocumentType) {
    setPendingDocType(docType);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingDocType) return;
    e.target.value = '';

    setUploading(pendingDocType);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('doc_type', pendingDocType);

    const r = await fetch('/api/project/documents/upload', { method: 'POST', body: formData });
    const d = await r.json() as { document?: ProjectDocument; error?: string };

    if (!r.ok || !d.document) {
      setError(d.error ?? 'Ошибка загрузки');
    } else {
      setDocuments(prev => [d.document!, ...prev]);
    }
    setUploading(null);
    setPendingDocType(null);
  }

  async function deleteDoc(id: string) {
    const r = await fetch(`/api/project/documents/${id}`, { method: 'DELETE' });
    if (r.ok) {
      setDocuments(prev => prev.filter(d => d.id !== id));
    }
  }

  const byType = (type: DocumentType) => documents.filter(d => d.doc_type === type);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Загрузка...</p></div>;
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">Документы проекта</h1>
          <p className="text-sm text-gray-500 mt-1">Загрузите необходимые документы для андеррайтинга. Максимальный размер файла — 20 МБ.</p>
        </div>

        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.xls,.xlsx,.ppt,.pptx,.doc,.docx"
          onChange={handleFileChange}
        />

        <div className="space-y-4">
          {DOC_TYPES.map(dt => {
            const docs = byType(dt.value);
            return (
              <div key={dt.value} className="bg-white rounded-lg shadow p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-medium text-sm">{dt.label}</span>
                    {dt.required && <span className="ml-2 text-xs text-red-500">обязательно</span>}
                  </div>
                  <button
                    onClick={() => triggerUpload(dt.value)}
                    disabled={uploading === dt.value}
                    className="text-sm text-blue-600 hover:underline disabled:opacity-50"
                  >
                    {uploading === dt.value ? 'Загружаем...' : '+ Загрузить'}
                  </button>
                </div>
                {docs.length === 0 ? (
                  <p className="text-xs text-gray-400">Файлы не загружены</p>
                ) : (
                  <ul className="space-y-1">
                    {docs.map(doc => (
                      <li key={doc.id} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700 truncate max-w-xs">{doc.filename}</span>
                        <button
                          onClick={() => deleteDoc(doc.id)}
                          className="text-red-500 hover:underline text-xs ml-2 shrink-0"
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-800">
            Все загруженные документы будут использованы исключительно для AI-анализа и проверки модератором.
            Платформа не передаёт документы третьим лицам без вашего согласия.
          </p>
        </div>
      </div>
    </main>
  );
}
```

---

## Шаг 7 — Тесты

Создать `__tests__/t3.test.ts`:

```typescript
import type {
  QS5Answers, QS6Answers, QS7Answers, QS8Answers,
  DocumentType, ProjectDocument,
} from '@/types';

describe('T3 questionnaire types s5-s8', () => {
  it('QS5Answers has financial_model_ready boolean', () => {
    const a: QS5Answers = {
      revenue_current: '100000',
      revenue_last_year: '1000000',
      burn_rate: '50000',
      runway_months: '12',
      unit_economics: 'CAC=500, LTV=5000',
      financial_model_ready: true,
    };
    expect(typeof a.financial_model_ready).toBe('boolean');
  });

  it('QS6Answers investment_type valid values', () => {
    const types: QS6Answers['investment_type'][] = ['equity', 'convertible_note', 'safe', 'debt', ''];
    expect(types).toHaveLength(5);
  });

  it('QS7Answers has traction fields', () => {
    const a: QS7Answers = {
      monthly_users: '1000',
      paying_customers: '100',
      mrr: '500000',
      growth_rate_mom: '15',
      key_metrics: '',
      notable_clients: '',
      awards: '',
    };
    expect(Object.keys(a)).toHaveLength(7);
  });

  it('QS8Answers has exit_strategy field', () => {
    const a: QS8Answers = {
      exit_strategy: 'M&A',
      risks: 'regulatory',
      additional_info: '',
      how_found_platform: 'referral',
    };
    expect(a.exit_strategy).toBe('M&A');
  });
});

describe('T3 document types', () => {
  const VALID_DOC_TYPES: DocumentType[] = [
    'pitch_deck', 'financial_model', 'charter', 'team_cv', 'legal_docs', 'other',
  ];

  it('has 6 document types', () => {
    expect(VALID_DOC_TYPES).toHaveLength(6);
  });

  it('pitch_deck is a valid DocumentType', () => {
    expect(VALID_DOC_TYPES.includes('pitch_deck')).toBe(true);
  });

  it('ProjectDocument shape is correct', () => {
    const doc: ProjectDocument = {
      id: 'uuid-1',
      project_id: 'uuid-2',
      doc_type: 'pitch_deck',
      storage_path: 'uuid-2/pitch_deck_123.pdf',
      filename: 'deck.pdf',
      uploaded_at: '2026-06-27T10:00:00Z',
    };
    expect(doc.doc_type).toBe('pitch_deck');
    expect(typeof doc.storage_path).toBe('string');
  });
});

describe('T3 API validation logic', () => {
  const VALID_SECTIONS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];

  it('sections s5-s8 are valid', () => {
    expect(VALID_SECTIONS.includes('s5')).toBe(true);
    expect(VALID_SECTIONS.includes('s8')).toBe(true);
    expect(VALID_SECTIONS.includes('s9')).toBe(false);
  });

  it('file size limit is 20MB', () => {
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    expect(MAX_FILE_SIZE).toBe(20971520);
  });
});
```

---

## Шаг 8 — Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `supabase/migrations/003_project_documents.sql` — миграция с RLS
2. `types/index.ts` дополнен: QS5-QS8Answers, DocumentType, ProjectDocument
3. `app/api/project/questionnaire/route.ts` — VALID_SECTIONS расширен до s8
4. `app/api/project/documents/route.ts` — GET документов
5. `app/api/project/documents/upload/route.ts` — POST загрузка файла
6. `app/api/project/documents/[id]/route.ts` — DELETE документа
7. `app/(project)/questionnaire/sections58/page.tsx` — 4-шаговая анкета секций 5-8
8. `app/(project)/documents/page.tsx` — страница загрузки документов
9. `__tests__/t3.test.ts` — все тесты проходят
10. `npm run build` — без ошибок TypeScript
11. `npm test` — все тесты проходят (t1 + t2 + t3)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `__tests__/t1.test.ts`, `__tests__/t2.test.ts` — не изменять
- `app/(project)/questionnaire/page.tsx` — не изменять (секции 1-4)
- `supabase/migrations/001_*`, `002_*` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки "REVIEWED: T2":

```
DONE: T3
```

И в раздел "Выполненные задачи":

```
### T3 — Кабинет проекта: анкета (секции 5-8), загрузка документов
Создано:
- supabase/migrations/003_project_documents.sql — таблица project_documents + RLS
- types/index.ts — добавлены QS5-QS8Answers, DocumentType, ProjectDocument
- app/api/project/questionnaire/route.ts — расширен VALID_SECTIONS до s8
- app/api/project/documents/route.ts — GET списка документов
- app/api/project/documents/upload/route.ts — POST загрузки файла в Storage
- app/api/project/documents/[id]/route.ts — DELETE документа
- app/(project)/questionnaire/sections58/page.tsx — анкета секций 5-8
- app/(project)/documents/page.tsx — страница загрузки документов
- __tests__/t3.test.ts — тесты
```
