'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface ExportItem {
  label: string;
  url: string;
  filename: string;
}

const EXPORTS: ExportItem[] = [
  { label: 'Проекты', url: '/api/admin/export/projects', filename: 'projects.csv' },
  {
    label: 'Заявки инвесторов',
    url: '/api/admin/export/applications',
    filename: 'applications.csv',
  },
  { label: 'Инвесторы', url: '/api/admin/export/investors', filename: 'investors.csv' },
];

export default function ExportPageClient() {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(item: ExportItem) {
    setLoading(item.url);
    setError(null);

    try {
      const res = await fetch(item.url);
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Ошибка при экспорте');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Ошибка при скачивании файла');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Скачайте данные платформы в формате CSV для отчётности или интеграции с внешними системами.
      </p>

      <div className="divide-y rounded-lg border">
        {EXPORTS.map((item) => (
          <div key={item.url} className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">{item.label}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={loading === item.url}
              onClick={() => void handleDownload(item)}
            >
              {loading === item.url ? 'Загрузка...' : 'Скачать CSV'}
            </Button>
          </div>
        ))}
      </div>

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
    </div>
  );
}
