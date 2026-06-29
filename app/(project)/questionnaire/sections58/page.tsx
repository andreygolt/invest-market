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
    return d.answers;
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadSection(0)
      .then(sectionAnswers => {
        if (cancelled || Object.keys(sectionAnswers).length === 0) return;
        setAnswers(prev => {
          const next = [...prev] as typeof prev;
          next[0] = sectionAnswers as never;
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [loadSection]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    loadSection(step).then(sectionAnswers => {
      if (cancelled || Object.keys(sectionAnswers).length === 0) return;
      setAnswers(prev => {
        const next = [...prev] as typeof prev;
        next[step] = sectionAnswers as never;
        return next;
      });
    });
    return () => { cancelled = true; };
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
