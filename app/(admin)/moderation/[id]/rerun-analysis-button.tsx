'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface RerunAnalysisButtonProps {
  projectId: string;
}

export function RerunAnalysisButton({ projectId }: RerunAnalysisButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsLoading(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/admin/projects/${projectId}/ai-report`, {
        method: 'POST',
      });
      const body = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setError(body.error ?? 'Не удалось запустить анализ');
        return;
      }

      setMessage('Анализ запущен — обновите страницу');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось запустить анализ');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" onClick={handleClick} disabled={isLoading}>
        {isLoading ? 'Запускаем...' : 'Перезапустить AI-анализ'}
      </Button>
      {message && <span className="text-sm text-slate-600">{message}</span>}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
