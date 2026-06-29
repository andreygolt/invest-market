'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { GlobalSearchResponse } from '@/types';

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    submitted: 'bg-yellow-100 text-yellow-700',
    under_review: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    pending: 'bg-yellow-100 text-yellow-700',
    accepted: 'bg-green-100 text-green-700',
    declined: 'bg-red-100 text-red-700',
  };

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        map[status] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {status}
    </span>
  );
}

export default function SearchClient() {
  const [query, setQuery] = useState('');
  const [data, setData] = useState<GlobalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);

    if (value.trim().length < 2) {
      setData(null);
      setError(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (query.trim().length < 2) {
      return;
    }

    timerRef.current = setTimeout(() => {
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const res = await fetch(`/api/admin/search?q=${encodeURIComponent(query.trim())}`);
          if (!res.ok) {
            const json = (await res.json()) as { error?: string };
            setError(json.error ?? 'Ошибка поиска');
            return;
          }
          setData((await res.json()) as GlobalSearchResponse);
        } catch {
          setError('Ошибка загрузки результатов');
        } finally {
          setLoading(false);
        }
      })();
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const hasResults =
    data &&
    (data.projects.length > 0 || data.investors.length > 0 || data.applications.length > 0);

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder="Название проекта, email инвестора..."
        className="w-full rounded-lg border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400 focus:ring-0"
        autoFocus
      />

      {loading && <div className="py-6 text-center text-sm text-gray-400">Поиск...</div>}

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {data && !loading && !hasResults && (
        <div className="py-6 text-center text-sm text-gray-400">
          Ничего не найдено по запросу «{data.query}»
        </div>
      )}

      {data && data.projects.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Проекты ({data.projects.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/admin/moderation/${project.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{project.name}</div>
                    <div className="text-xs text-gray-500">{project.category}</div>
                  </div>
                  {statusBadge(project.status)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.investors.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Инвесторы ({data.investors.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.investors.map((investor) => (
              <li key={investor.id}>
                <Link
                  href={`/admin/users?id=${investor.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{investor.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-500">{investor.email}</div>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(investor.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.applications.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Заявки ({data.applications.length})
          </h2>
          <ul className="divide-y rounded-lg border">
            {data.applications.map((application) => (
              <li key={application.id}>
                <Link
                  href={`/admin/applications?id=${application.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <div className="font-medium">{application.project_name}</div>
                    <div className="text-xs text-gray-500">{application.investor_email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {application.amount != null && (
                      <span className="text-sm tabular-nums text-gray-700">
                        {application.amount.toLocaleString('ru-RU')} ₽
                      </span>
                    )}
                    {statusBadge(application.status)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
