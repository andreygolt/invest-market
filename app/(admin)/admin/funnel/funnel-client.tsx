'use client';

import { useEffect, useState } from 'react';
import type { FunnelRow } from '@/types';

interface FunnelResponse {
  rows: FunnelRow[];
}

function ConversionBadge({ rate }: { rate: number }) {
  const color =
    rate >= 20
      ? 'bg-green-100 text-green-800'
      : rate >= 10
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-slate-100 text-slate-600';

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {rate}%
    </span>
  );
}

export default function FunnelClient() {
  const [rows, setRows] = useState<FunnelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/funnel');
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? 'Ошибка загрузки данных');
          return;
        }
        const data = (await res.json()) as FunnelResponse;
        setRows(data.rows);
      } catch {
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Загрузка...</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400">
        Нет одобренных проектов с данными о просмотрах
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Проект</th>
            <th className="px-4 py-3 text-left font-medium text-slate-600">Категория</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Просмотры</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Уник. зрители</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Избранное</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Заявки</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Портфель</th>
            <th className="px-4 py-3 text-right font-medium text-slate-600">Конверсия</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.project_id} className="hover:bg-slate-50">
              <td className="max-w-[200px] truncate px-4 py-3 font-medium">
                {row.project_name}
              </td>
              <td className="px-4 py-3 text-slate-500">{row.category}</td>
              <td className="px-4 py-3 text-right">{row.views_count}</td>
              <td className="px-4 py-3 text-right">{row.unique_viewers}</td>
              <td className="px-4 py-3 text-right">{row.favorites_count}</td>
              <td className="px-4 py-3 text-right">{row.applications_count}</td>
              <td className="px-4 py-3 text-right">{row.portfolio_count}</td>
              <td className="px-4 py-3 text-right">
                <ConversionBadge rate={row.conversion_rate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
