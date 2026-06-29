'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AuditAction, AuditLogRow } from '@/types';

const ACTION_LABELS: Record<AuditAction, string> = {
  project_approved: 'Проект одобрен',
  project_rejected: 'Проект отклонен',
  application_approved: 'Заявка одобрена',
  application_rejected: 'Заявка отклонена',
  broadcast_sent: 'Объявление отправлено',
  invite_created: 'Инвайт создан',
  user_role_changed: 'Роль изменена',
};

const PAGE_SIZE = 20;

interface AuditResponse {
  rows: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
}

export default function AuditLogClient() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchLog() {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (action) params.set('action', action);

      const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
        if (cancelled) return;

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
          if (cancelled) return;
        setError(data.error ?? 'Ошибка загрузки лога');
        return;
      }

      const data = (await res.json()) as AuditResponse;
        if (cancelled) return;
      setRows(data.rows);
      setTotal(data.total);
        setError(null);
    } catch {
        if (cancelled) return;
      setError('Ошибка загрузки лога');
    } finally {
        if (cancelled) return;
      setLoading(false);
    }
    }

    void fetchLog();

    return () => {
      cancelled = true;
    };
  }, [action, page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <select
          className="rounded-md border px-3 py-1.5 text-sm"
          value={action}
          onChange={(event) => {
            setLoading(true);
            setAction(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Все действия</option>
          {(Object.keys(ACTION_LABELS) as AuditAction[]).map((auditAction) => (
            <option key={auditAction} value={auditAction}>
              {ACTION_LABELS[auditAction]}
            </option>
          ))}
        </select>
        <span className="text-sm text-slate-500">Всего: {total}</span>
      </div>

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Дата</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Действие</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Объект</th>
              <th className="px-4 py-2 text-left font-medium text-slate-600">Исполнитель</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Загрузка...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Записей нет
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {new Date(row.created_at).toLocaleString('ru-RU')}
                  </td>
                  <td className="px-4 py-2 font-medium">{ACTION_LABELS[row.action]}</td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.entity_type}
                    {row.entity_id ? ` #${row.entity_id.slice(0, 8)}` : ''}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.actor_email ?? row.actor_id.slice(0, 8)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => {
              setLoading(true);
              setPage((currentPage) => currentPage - 1);
            }}
          >
            Назад
          </Button>
          <span className="text-sm text-slate-600">
            Страница {page} из {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => {
              setLoading(true);
              setPage((currentPage) => currentPage + 1);
            }}
          >
            Вперед
          </Button>
        </div>
      )}
    </div>
  );
}
