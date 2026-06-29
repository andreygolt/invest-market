'use client';

import { useEffect, useState } from 'react';
import type { AnalyticsBucket, AnalyticsPeriod, AnalyticsResponse } from '@/types';

const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
];

const COLUMNS: { key: keyof Omit<AnalyticsBucket, 'label' | 'date_from'>; label: string }[] = [
  { key: 'registrations', label: 'Регистрации' },
  { key: 'project_submissions', label: 'Проекты (подача)' },
  { key: 'deal_room_views', label: 'Просмотры Deal Room' },
  { key: 'applications', label: 'Заявки' },
  { key: 'portfolio_entries', label: 'Портфель' },
];

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-right tabular-nums">{value}</span>
      <div className="h-2 w-24 rounded-full bg-gray-100">
        <div className="h-2 rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function AnalyticsClient() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/analytics?period=${period}`);
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setError(json.error ?? 'Ошибка загрузки');
          return;
        }
        setData((await res.json()) as AnalyticsResponse);
      } catch {
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    }

    void loadAnalytics();
  }, [period]);

  const maxValues = COLUMNS.reduce<Record<string, number>>((acc, col) => {
    acc[col.key] = data ? Math.max(1, ...data.buckets.map((b) => b[col.key])) : 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-gray-900 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && <div className="py-12 text-center text-gray-400">Загрузка...</div>}

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!loading && !error && data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {COLUMNS.map((col) => (
              <div key={col.key} className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-semibold tabular-nums">{data.totals[col.key]}</div>
                <div className="mt-1 text-xs text-gray-500">{col.label}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Период</th>
                  {COLUMNS.map((col) => (
                    <th key={col.key} className="px-4 py-3 text-left font-medium text-gray-600">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.buckets.map((bucket) => (
                  <tr key={bucket.date_from} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-2 font-medium">{bucket.label}</td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className="px-4 py-2">
                        <MiniBar value={bucket[col.key]} max={maxValues[col.key] ?? 1} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
