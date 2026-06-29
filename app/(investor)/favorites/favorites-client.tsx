'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { InvestorFavoriteDetail, InvestorPersonalStatus } from '@/types';

const STATUS_LABELS: Record<InvestorPersonalStatus, string> = {
  watching: 'Слежу',
  interested: 'Интересно',
  passed: 'Пропускаю',
};

const STATUS_VARIANTS: Record<InvestorPersonalStatus, 'default' | 'secondary' | 'outline'> = {
  watching: 'secondary',
  interested: 'default',
  passed: 'outline',
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
      <div className="container mx-auto max-w-3xl py-8">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Избранное</h1>
        <Button asChild variant="outline">
          <Link href="/catalog">← Каталог</Link>
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'default' : 'outline'}
            size="sm"
            onClick={() => handleFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {favorites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {filter === 'all' ? (
              <>
                Избранных проектов нет.{' '}
                <Link href="/catalog" className="text-blue-600 hover:underline">
                  Перейти в каталог
                </Link>
              </>
            ) : (
              <>Нет проектов с таким статусом.</>
            )}
          </CardContent>
        </Card>
      ) : (
        favorites.map((fav) => (
          <Card key={fav.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">
                    <Link href={`/deals/${fav.project_id}`} className="hover:underline">
                      {fav.project_name}
                    </Link>
                  </CardTitle>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {fav.project_industry && (
                      <span className="text-xs text-muted-foreground">{fav.project_industry}</span>
                    )}
                    {fav.project_stage && (
                      <span className="text-xs text-muted-foreground">{fav.project_stage}</span>
                    )}
                    {fav.project_ai_score !== null && (
                      <span className="text-xs text-muted-foreground">
                        AI-score: {fav.project_ai_score}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {fav.personal_status && (
                    <Badge variant={STATUS_VARIANTS[fav.personal_status]}>
                      {STATUS_LABELS[fav.personal_status]}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleRemove(fav.id)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </CardHeader>
            {fav.notes && (
              <CardContent>
                <p className="line-clamp-3 text-sm text-muted-foreground">{fav.notes}</p>
              </CardContent>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
