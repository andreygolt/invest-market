'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { InvestorFavoriteDetail, InvestorPersonalStatus } from '@/types';

const STATUS_LABELS: Record<InvestorPersonalStatus, string> = {
  watching: 'Слежу',
  interested: 'Интересно',
  passed: 'Пропускаю',
};

const STATUS_FILTERS: Array<{ value: InvestorPersonalStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Все' },
  { value: 'watching', label: 'Слежу' },
  { value: 'interested', label: 'Интересно' },
  { value: 'passed', label: 'Пропускаю' },
];

export function FavoritesClient() {
  const [favorites, setFavorites] = useState<InvestorFavoriteDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InvestorPersonalStatus | 'all'>('all');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      loadFavorites(user.id, 'all');
    });
  }, []);

  async function loadFavorites(uid: string, statusFilter: InvestorPersonalStatus | 'all') {
    setLoading(true);
    const url =
      statusFilter === 'all'
        ? `/api/investor/favorites?investor_id=${uid}`
        : `/api/investor/favorites?investor_id=${uid}&personal_status=${statusFilter}`;
    const res = await fetch(url);
    const json = await res.json();
    setFavorites(json.favorites ?? []);
    setLoading(false);
  }

  function handleFilter(f: InvestorPersonalStatus | 'all') {
    setFilter(f);
    if (userId) loadFavorites(userId, f);
  }

  async function handleRemove(favoriteId: string) {
    if (!userId) return;
    const res = await fetch(`/api/investor/favorites/${favoriteId}?investor_id=${userId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-slate-500">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-white">Избранное</h1>
          <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
            <Link href="/catalog">← Каталог</Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => handleFilter(f.value)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                filter === f.value
                  ? 'bg-white text-black'
                  : 'border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {favorites.length === 0 ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-12 text-center">
            <p className="text-slate-500">
            {filter === 'all' ? (
              <>
                Избранных проектов нет.{' '}
                <Link href="/catalog" className="text-blue-400 hover:text-blue-300">
                  Перейти в каталог
                </Link>
              </>
            ) : (
              <>Нет проектов с таким статусом.</>
            )}
            </p>
          </div>
        ) : (
          favorites.map((fav) => (
            <div key={fav.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/deals/${fav.project_id}`}
                    className="text-base font-semibold text-white hover:text-slate-300"
                  >
                    {fav.project_name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {fav.project_industry && (
                      <span className="text-xs text-slate-500">{fav.project_industry}</span>
                    )}
                    {fav.project_stage && (
                      <span className="text-xs text-slate-600">{fav.project_stage}</span>
                    )}
                    {fav.project_ai_score !== null && (
                      <span className={`text-xs ${fav.project_ai_score >= 80 ? 'text-emerald-400' : 'text-yellow-400'}`}>
                        AI {fav.project_ai_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {fav.personal_status && (
                    <span className="rounded-md bg-slate-800 border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
                      {STATUS_LABELS[fav.personal_status]}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500 hover:text-red-400"
                    onClick={() => handleRemove(fav.id)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
              {fav.notes && (
                <p className="mt-3 text-sm text-slate-500 line-clamp-3">{fav.notes}</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
