'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const INDUSTRIES = ['Энергетика', 'Медтех', 'АгроТех', 'Логистика', 'Финтех', 'Другое'];
const STAGES = ['idea', 'pre_seed', 'seed', 'series_a_plus'];

export default function ApplyQuestionnairePage() {
  const router = useRouter();
  const [projectId] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : (new URLSearchParams(window.location.search).get('project_id') ?? '')
  );
  const [industry, setIndustry] = useState('');
  const [stage, setStage] = useState('');
  const [description, setDescription] = useState('');
  const [raiseAmount, setRaiseAmount] = useState('');
  const [useOfFunds, setUseOfFunds] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (!projectId) {
      setError('Не найден project_id.');
      return;
    }
    if (description.trim().length < 100) {
      setError('Описание проекта должно быть не короче 100 символов.');
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/projects/${projectId}/questionnaire`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industry,
        stage,
        description: description.trim(),
        raiseAmount: raiseAmount.trim(),
        useOfFunds: useOfFunds.trim(),
        teamSize: Number(teamSize),
        website: website.trim() || null,
      }),
    });
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? 'Не удалось сохранить анкету.');
      setLoading(false);
      return;
    }

    router.push('/apply/done');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-slate-500">Invest Market</p>
          <h1 className="mt-2 text-3xl font-semibold">Анкета проекта</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Расскажите о проекте</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="industry">
                  Отрасль
                </label>
                <select
                  id="industry"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  required
                >
                  <option value="">Выберите отрасль</option>
                  {INDUSTRIES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="stage">
                  Стадия
                </label>
                <select
                  id="stage"
                  className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={stage}
                  onChange={(event) => setStage(event.target.value)}
                  required
                >
                  <option value="">Выберите стадию</option>
                  {STAGES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="description">
                  Описание проекта
                </label>
                <textarea
                  id="description"
                  className="min-h-32 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  minLength={100}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="raiseAmount">
                  Сколько привлекаете
                </label>
                <Input
                  id="raiseAmount"
                  type="text"
                  placeholder="5 000 000 ₽"
                  value={raiseAmount}
                  onChange={(event) => setRaiseAmount(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="useOfFunds">
                  На что планируете потратить
                </label>
                <textarea
                  id="useOfFunds"
                  className="min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={useOfFunds}
                  onChange={(event) => setUseOfFunds(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="teamSize">
                  Размер команды
                </label>
                <Input
                  id="teamSize"
                  type="number"
                  min={1}
                  value={teamSize}
                  onChange={(event) => setTeamSize(event.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="website">
                  Сайт или соцсети
                </label>
                <Input
                  id="website"
                  type="text"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Сохраняем...' : 'Отправить анкету'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
