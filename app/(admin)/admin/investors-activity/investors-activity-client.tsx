'use client';

import { useEffect, useState } from 'react';
import type { InvestorActivityRow } from '@/types';

interface ActivityResponse {
  rows: InvestorActivityRow[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export default function InvestorsActivityClient() {
  const [rows, setRows] = useState<InvestorActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/admin/investors-activity');
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? 'Ошибка загрузки данных');
          return;
        }
        const data = (await res.json()) as ActivityResponse;
        setRows(data.rows);
      } catch {
        setError('Ошибка загрузки данных');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="py-12 text-center text-gray-400">Загрузка...</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-gray-400">
        Нет зарегистрированных инвесторов
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Инвестор</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Просмотры</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Избранное</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Заявки</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Портфель</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">
              Последняя активность
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.investor_id} className="hover:bg-gray-50">
              <td className="max-w-[180px] truncate px-4 py-3 font-medium">
                {row.investor_name || '—'}
              </td>
              <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">{row.email}</td>
              <td className="px-4 py-3 text-right">{row.views_count}</td>
              <td className="px-4 py-3 text-right">{row.favorites_count}</td>
              <td className="px-4 py-3 text-right">{row.applications_count}</td>
              <td className="px-4 py-3 text-right">{row.portfolio_count}</td>
              <td className="px-4 py-3 text-right text-gray-500">
                {formatDate(row.last_active_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
