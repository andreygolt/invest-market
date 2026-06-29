'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Обновления проекта</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Опубликовать обновление</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={publishUpdate} className="space-y-4">
              <Input
                value={title}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Краткий заголовок обновления"
              />
              <Textarea
                value={body}
                maxLength={5000}
                rows={6}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Подробное описание..."
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Публикуем...' : 'Опубликовать'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {loading ? (
          <p className="text-sm text-gray-500">Загрузка...</p>
        ) : updates.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-sm text-gray-500">
              Обновлений ещё нет. Опубликуйте первое!
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {updates.map((update) => (
              <Card key={update.id}>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{update.title}</CardTitle>
                    <p className="mt-1 text-xs text-gray-500">
                      {new Date(update.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => void deleteUpdate(update.id)}
                  >
                    Удалить
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm">{update.body}</p>
                  {update.ai_summary !== null ? (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">AI-резюме:</span> {update.ai_summary}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500">Резюме генерируется...</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
