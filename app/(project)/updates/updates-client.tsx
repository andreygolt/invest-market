'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ProjectUpdate } from '@/types';

export default function UpdatesClient() {
  const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function loadUpdates() {
    const response = await fetch('/api/project/updates', { cache: 'no-store' });
    if (!response.ok) {
      setUpdates([]);
      setLoading(false);
      return;
    }

    const data = (await response.json()) as ProjectUpdate[];
    setUpdates(data);
    setLoading(false);
  }

  useEffect(() => {
    let cancelled = false;

    fetch('/api/project/updates', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: ProjectUpdate[]) => {
        if (cancelled) return;
        setUpdates(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setUpdates([]);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function publishUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    const response = await fetch('/api/project/updates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body }),
    });

    if (!response.ok) {
      setError('Не удалось опубликовать обновление');
      setSubmitting(false);
      return;
    }

    setTitle('');
    setBody('');
    await loadUpdates();
    setSubmitting(false);
  }

  async function deleteUpdate(id: string) {
    const response = await fetch(`/api/project/updates/${id}`, { method: 'DELETE' });
    if (response.ok) {
      setUpdates((current) => current.filter((update) => update.id !== id));
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Обновления проекта</h1>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Опубликовать обновление</h2>
          <form onSubmit={publishUpdate} className="space-y-4">
            <Input
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Краткий заголовок обновления"
              className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-slate-500"
            />
            <Textarea
              value={body}
              maxLength={5000}
              rows={6}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Подробное описание..."
              className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-slate-500"
            />
            {error && <p className="text-sm text-red-400">{error}</p>}
            <Button type="submit" disabled={submitting} className="bg-slate-900 text-white hover:bg-slate-700">
              {submitting ? 'Публикуем...' : 'Опубликовать'}
            </Button>
          </form>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Загрузка...</p>
        ) : updates.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white py-8 text-center text-sm text-slate-600">
            Обновлений ещё нет. Опубликуйте первое!
          </div>
        ) : (
          <div className="space-y-4">
            {updates.map((update) => (
              <div key={update.id} className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{update.title}</h3>
                    <p className="mt-1 text-xs text-slate-600">
                      {new Date(update.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-600 hover:bg-red-50 shrink-0"
                    onClick={() => void deleteUpdate(update.id)}
                  >
                    Удалить
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-700">{update.body}</p>
                {update.ai_summary !== null ? (
                  <p className="mt-3 text-sm text-slate-500">
                    <span className="font-medium text-slate-600">AI-резюме:</span> {update.ai_summary}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-600">Резюме генерируется...</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
