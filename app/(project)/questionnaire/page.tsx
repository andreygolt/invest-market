'use client';
import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import type { ProjectRow, QS1Answers, QS2Answers, QS3Answers, QS4Answers } from '@/types';

const STEPS = ['Основная информация', 'Команда', 'Продукт', 'Рынок'] as const;
const SECTIONS = ['s1', 's2', 's3', 's4'] as const;
const TOTAL = STEPS.length;

function Section1({ value, onChange }: { value: Partial<QS1Answers>; onChange: (v: Partial<QS1Answers>) => void }) {
  const set = (k: keyof QS1Answers) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [k]: e.target.value });

  const INDUSTRIES = ['Технологии', 'Финансы', 'Здравоохранение', 'Образование', 'Ритейл', 'Недвижимость', 'Производство', 'Другое'];
  const STAGES = [
    { value: 'idea', label: 'Идея' },
    { value: 'pre_seed', label: 'Pre-seed' },
    { value: 'seed', label: 'Seed' },
    { value: 'series_a_plus', label: 'Series A+' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Краткое описание проекта *</label>
        <textarea value={value.description ?? ''} onChange={set('description')} rows={3} required
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Что делает ваш проект?" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Отрасль *</label>
          <select value={value.industry ?? ''} onChange={set('industry')} required
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Выбрать...</option>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Стадия проекта *</label>
          <select value={value.stage ?? ''} onChange={set('stage')} required
            className="w-full border rounded px-3 py-2 text-sm">
            <option value="">Выбрать...</option>
            {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Юридическая форма</label>
        <input type="text" value={value.legal_form ?? ''} onChange={set('legal_form')}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="ООО, ИП, АО..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Страна</label>
          <input type="text" value={value.country ?? ''} onChange={set('country')}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Россия" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Город</label>
          <input type="text" value={value.city ?? ''} onChange={set('city')}
            className="w-full border rounded px-3 py-2 text-sm" placeholder="Москва" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Год основания</label>
        <input type="number" value={value.founding_year ?? ''} onChange={set('founding_year')}
          min={1990} max={new Date().getFullYear()}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="2023" />
      </div>
    </div>
  );
}

function Section2({ value, onChange }: { value: Partial<QS2Answers>; onChange: (v: Partial<QS2Answers>) => void }) {
  const founders = value.founders ?? [{ name: '', role: '', linkedin: '', bio: '' }];

  const setFounder = (i: number, k: keyof QS2Answers['founders'][number]) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const updated = founders.map((f, idx) => idx === i ? { ...f, [k]: e.target.value } : f);
      onChange({ ...value, founders: updated });
    };

  const addFounder = () => onChange({ ...value, founders: [...founders, { name: '', role: '', linkedin: '', bio: '' }] });
  const removeFounder = (i: number) => onChange({ ...value, founders: founders.filter((_, idx) => idx !== i) });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium">Основатели *</label>
          <button type="button" onClick={addFounder}
            className="text-sm text-blue-600 hover:underline">+ Добавить основателя</button>
        </div>
        {founders.map((f, i) => (
          <div key={i} className="border rounded p-4 mb-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-500">Основатель {i + 1}</span>
              {founders.length > 1 && (
                <button type="button" onClick={() => removeFounder(i)}
                  className="text-sm text-red-500 hover:underline">Удалить</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={f.name} onChange={setFounder(i, 'name')}
                className="border rounded px-3 py-2 text-sm" placeholder="Имя Фамилия" />
              <input type="text" value={f.role} onChange={setFounder(i, 'role')}
                className="border rounded px-3 py-2 text-sm" placeholder="Должность (CEO, CTO...)" />
            </div>
            <input type="url" value={f.linkedin} onChange={setFounder(i, 'linkedin')}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="LinkedIn URL (необязательно)" />
            <textarea value={f.bio} onChange={setFounder(i, 'bio')} rows={2}
              className="w-full border rounded px-3 py-2 text-sm" placeholder="Краткое описание опыта" />
          </div>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Размер команды (всего)</label>
        <input type="number" value={value.team_size ?? ''} min={1}
          onChange={e => onChange({ ...value, team_size: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="5" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Ключевые компетенции команды</label>
        <textarea value={value.key_skills ?? ''} rows={2}
          onChange={e => onChange({ ...value, key_skills: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Разработка, маркетинг, продажи..." />
      </div>
    </div>
  );
}

function Section3({ value, onChange }: { value: Partial<QS3Answers>; onChange: (v: Partial<QS3Answers>) => void }) {
  const PSTAGES = [
    { value: 'concept', label: 'Концепция' },
    { value: 'mvp', label: 'MVP' },
    { value: 'beta', label: 'Бета' },
    { value: 'launched', label: 'Запущен' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Какую проблему вы решаете? *</label>
        <textarea value={value.problem ?? ''} rows={3} required
          onChange={e => onChange({ ...value, problem: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Опишите проблему, которую испытывает ваша целевая аудитория" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Ваше решение *</label>
        <textarea value={value.solution ?? ''} rows={3} required
          onChange={e => onChange({ ...value, solution: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Как ваш продукт решает эту проблему?" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Уникальное торговое предложение (УТП)</label>
        <textarea value={value.usp ?? ''} rows={2}
          onChange={e => onChange({ ...value, usp: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Почему именно ваш продукт, а не конкурентов?" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Стадия разработки продукта *</label>
        <select value={value.product_stage ?? ''} required
          onChange={e => onChange({ ...value, product_stage: e.target.value as QS3Answers['product_stage'] })}
          className="w-full border rounded px-3 py-2 text-sm">
          <option value="">Выбрать...</option>
          {PSTAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function Section4({ value, onChange }: { value: Partial<QS4Answers>; onChange: (v: Partial<QS4Answers>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Целевая аудитория *</label>
        <textarea value={value.target_audience ?? ''} rows={2} required
          onChange={e => onChange({ ...value, target_audience: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Кто ваш клиент? Сегмент B2B/B2C, описание профиля" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Объём рынка (TAM/SAM/SOM)</label>
        <textarea value={value.tam_description ?? ''} rows={2}
          onChange={e => onChange({ ...value, tam_description: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Например: TAM — $50B, SAM — $5B, SOM — $100M" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Конкуренты *</label>
        <textarea value={value.competitors ?? ''} rows={2} required
          onChange={e => onChange({ ...value, competitors: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Перечислите основных конкурентов" />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Конкурентные преимущества</label>
        <textarea value={value.competitive_advantage ?? ''} rows={2}
          onChange={e => onChange({ ...value, competitive_advantage: e.target.value })}
          className="w-full border rounded px-3 py-2 text-sm" placeholder="Чем вы лучше конкурентов?" />
      </div>
    </div>
  );
}

export default function QuestionnairePage() {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [projectName, setProjectName] = useState('');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<[Partial<QS1Answers>, Partial<QS2Answers>, Partial<QS3Answers>, Partial<QS4Answers>]>([{}, {}, {}, {}]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch('/api/project/my')
      .then(r => r.json())
      .then(d => {
        setProject(d.project);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!project) return;

    const section = SECTIONS[step];
    fetch(`/api/project/questionnaire?section=${section}`)
      .then(r => r.json())
      .then((d: { answers: Record<string, unknown> }) => {
        if (Object.keys(d.answers).length > 0) {
          setAnswers(prev => {
            const next = [...prev] as typeof prev;
            next[step] = d.answers as never;
            return next;
          });
        }
      });
  }, [project, step]);

  async function createProject() {
    if (!projectName.trim()) return;
    setSaving(true);
    setError('');
    const r = await fetch('/api/project/my', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: projectName.trim() }),
    });
    const d = await r.json() as { project?: ProjectRow; error?: string };
    if (!r.ok || !d.project) { setError(d.error ?? 'Ошибка создания проекта'); setSaving(false); return; }
    setProject(d.project);
    setSaving(false);
  }

  async function saveAndNext() {
    if (!project) return;
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

  if (!project) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
          <h1 className="text-2xl font-semibold mb-2">Добро пожаловать</h1>
          <p className="text-gray-500 text-sm mb-6">Введите название вашего проекта, чтобы начать анкету.</p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название проекта *</label>
              <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm" placeholder="Например: FinTech Startup" />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button onClick={createProject} disabled={saving || !projectName.trim()}
              className="w-full bg-black text-white py-2 rounded text-sm font-medium disabled:opacity-50">
              {saving ? 'Создаём...' : 'Начать'}
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow text-center">
          <div className="text-4xl mb-4">✓</div>
          <h1 className="text-2xl font-semibold mb-2">Секции 1-4 заполнены</h1>
          <p className="text-gray-500 text-sm">Продолжите заполнение анкеты в следующем этапе (секции 5-8) и загрузите документы.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Анкета проекта — шаг {step + 1} из {TOTAL}</p>
        </div>

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
            <Section1
              value={answers[0]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[0] = v; return n; })}
            />
          )}
          {step === 1 && (
            <Section2
              value={answers[1]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[1] = v; return n; })}
            />
          )}
          {step === 2 && (
            <Section3
              value={answers[2]}
              onChange={v => setAnswers(prev => { const n = [...prev] as typeof prev; n[2] = v; return n; })}
            />
          )}
          {step === 3 && (
            <Section4
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
              {saving ? 'Сохраняем...' : step === TOTAL - 1 ? 'Завершить секции 1-4' : 'Сохранить и продолжить'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
