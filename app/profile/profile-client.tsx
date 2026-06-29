'use client';

import type { FormEvent } from 'react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';

interface ProfileClientProps {
  profile: UserProfile;
}

const ROLE_LABELS: Record<string, string> = {
  investor: 'Инвестор',
  project: 'Проект',
  manager: 'Менеджер',
  admin: 'Администратор',
  superadmin: 'Суперадмин',
  moderator: 'Модератор',
};

export function ProfileClient({ profile }: ProfileClientProps) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Ошибка сохранения');
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <Label htmlFor="email" className="text-slate-700">
          Email
        </Label>
        <Input
          id="email"
          value={profile.email}
          disabled
          className="mt-1 bg-slate-50 text-slate-500"
        />
      </div>
      <div>
        <Label htmlFor="role" className="text-slate-700">
          Роль
        </Label>
        <Input
          id="role"
          value={ROLE_LABELS[profile.role] ?? profile.role}
          disabled
          className="mt-1 bg-slate-50 text-slate-500"
        />
      </div>
      <div>
        <Label htmlFor="full_name" className="text-slate-700">
          Имя
        </Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={100}
          className="mt-1"
          placeholder="Ваше имя"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Сохранено</p>}

      <Button type="submit" disabled={saving || fullName.trim().length === 0}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </Button>
    </form>
  );
}
