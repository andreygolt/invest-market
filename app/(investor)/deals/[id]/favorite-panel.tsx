'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { InvestorFavoriteRow, InvestorPersonalStatus } from '@/types';

const PERSONAL_STATUS_LABELS: Record<InvestorPersonalStatus, string> = {
  watching: 'Слежу',
  interested: 'Интересно',
  passed: 'Пропускаю',
};

interface FavoritePanelProps {
  projectId: string;
}

export function FavoritePanel({ projectId }: FavoritePanelProps) {
  const [userId, setUserId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState<InvestorFavoriteRow | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      const res = await fetch(`/api/investor/favorites?investor_id=${user.id}`);
      const json = await res.json();
      const found =
        (json.favorites ?? []).find((f: InvestorFavoriteRow) => f.project_id === projectId) ??
        null;

      setFavorite(found);
      if (found) setNotes(found.notes ?? '');
      setLoading(false);
    });
  }, [projectId]);

  async function toggleFavorite() {
    if (!userId) return;
    setSaving(true);
    try {
      if (favorite) {
        await fetch(`/api/investor/favorites/${favorite.id}?investor_id=${userId}`, {
          method: 'DELETE',
        });
        setFavorite(null);
        setNotes('');
        setNotesOpen(false);
      } else {
        const res = await fetch('/api/investor/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ investor_id: userId, project_id: projectId }),
        });
        if (res.ok) {
          const data = (await res.json()) as InvestorFavoriteRow;
          setFavorite(data);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (!userId || !favorite) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/investor/favorites/${favorite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: userId, notes: notes.trim() || null }),
      });
      if (res.ok) {
        const data = (await res.json()) as InvestorFavoriteRow;
        setFavorite(data);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSetStatus(status: InvestorPersonalStatus | null) {
    if (!userId || !favorite) return;
    setSaving(true);
    try {
      const newStatus = favorite.personal_status === status ? null : status;
      const res = await fetch(`/api/investor/favorites/${favorite.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: userId, personal_status: newStatus }),
      });
      if (res.ok) {
        const data = (await res.json()) as InvestorFavoriteRow;
        setFavorite(data);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;
  if (!userId) return null;

  const isFavorite = favorite !== null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-center gap-3">
        <Button
          variant={isFavorite ? 'default' : 'outline'}
          size="sm"
          onClick={toggleFavorite}
          disabled={saving}
        >
          {isFavorite ? 'В избранном' : 'В избранное'}
        </Button>

        {isFavorite && (
          <Button variant="ghost" size="sm" onClick={() => setNotesOpen((v) => !v)}>
            {notesOpen ? 'Скрыть заметку' : 'Заметка'}
          </Button>
        )}
      </div>

      {isFavorite && (
        <div className="flex flex-wrap gap-2">
          {(Object.keys(PERSONAL_STATUS_LABELS) as InvestorPersonalStatus[]).map((s) => (
            <Button
              key={s}
              variant={favorite.personal_status === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSetStatus(s)}
              disabled={saving}
            >
              {PERSONAL_STATUS_LABELS[s]}
            </Button>
          ))}
        </div>
      )}

      {isFavorite && notesOpen && (
        <div className="space-y-2">
          <Label htmlFor="fav-notes" className="text-sm">
            Личная заметка
          </Label>
          <Textarea
            id="fav-notes"
            placeholder="Заметки только для вас..."
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
          />
          <Button size="sm" onClick={handleSaveNotes} disabled={saving}>
            {saving ? 'Сохраняем...' : 'Сохранить'}
          </Button>
        </div>
      )}
    </div>
  );
}
