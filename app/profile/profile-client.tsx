'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile, UserRole } from '@/types';

type ProfileClientProps = {
  profile: UserProfile;
  email: string;
};

const ROLE_LABELS: Record<UserRole, string> = {
  investor: 'Инвестор',
  project: 'Проект',
  admin: 'Администратор',
  moderator: 'Модератор',
  manager: 'Менеджер',
  superadmin: 'Суперадмин',
};

function getBackHref(role: UserRole) {
  return role === 'project' ? '/project' : '/dashboard';
}

export function ProfileClient({ profile, email }: ProfileClientProps) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const registrationDate = useMemo(
    () => new Date(profile.created_at).toLocaleDateString('ru-RU'),
    [profile.created_at]
  );

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameMessage(null);
    setNameError(null);
    setSavingName(true);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: fullName }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setNameError(body.error ?? 'Не удалось обновить имя');
        return;
      }

      const updated = (await response.json()) as UserProfile;
      setFullName(updated.full_name ?? '');
      setNameMessage('Имя обновлено');
    } finally {
      setSavingName(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Пароль должен быть не короче 8 символов');
      return;
    }

    if (newPassword !== repeatPassword) {
      setPasswordError('Пароли не совпадают');
      return;
    }

    setSavingPassword(true);
    try {
      const response = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword }),
      });

      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        setPasswordError(body.error ?? 'Не удалось изменить пароль');
        return;
      }

      setNewPassword('');
      setRepeatPassword('');
      setPasswordMessage('Пароль изменён');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-slate-400 hover:text-white">
          <Link href={getBackHref(profile.role)}>← Назад</Link>
        </Button>

        <h1 className="text-3xl font-bold text-white">Профиль</h1>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-lg font-semibold text-white">Информация об аккаунте</h2>
          <div className="space-y-3 text-sm">
            <div className="grid gap-1">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-300">{email}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-slate-500">Роль</span>
              <span className="font-medium text-slate-300">{ROLE_LABELS[profile.role]}</span>
            </div>
            <div className="grid gap-1">
              <span className="text-slate-500">Дата регистрации</span>
              <span className="font-medium text-slate-300">{registrationDate}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Редактирование имени</h2>
          <form className="space-y-4" onSubmit={saveName}>
            <div className="space-y-2">
              <Label htmlFor="full_name" className="text-sm text-slate-400">
                Полное имя
              </Label>
              <Input
                id="full_name"
                value={fullName}
                maxLength={100}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            {nameMessage ? <p className="text-sm text-emerald-400">{nameMessage}</p> : null}
            {nameError ? <p className="text-sm text-red-400">{nameError}</p> : null}
            <Button
              type="submit"
              disabled={savingName}
              className="bg-white text-black hover:bg-slate-200"
            >
              {savingName ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </form>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Смена пароля</h2>
          <form className="space-y-4" onSubmit={changePassword}>
            <div className="space-y-2">
              <Label htmlFor="new_password" className="text-sm text-slate-400">
                Новый пароль
              </Label>
              <Input
                id="new_password"
                type="password"
                minLength={8}
                value={newPassword}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repeat_password" className="text-sm text-slate-400">
                Повторите пароль
              </Label>
              <Input
                id="repeat_password"
                type="password"
                minLength={8}
                value={repeatPassword}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
                onChange={(event) => setRepeatPassword(event.target.value)}
              />
            </div>
            {passwordMessage ? (
              <p className="text-sm text-emerald-400">{passwordMessage}</p>
            ) : null}
            {passwordError ? <p className="text-sm text-red-400">{passwordError}</p> : null}
            <Button
              type="submit"
              disabled={savingPassword}
              className="bg-white text-black hover:bg-slate-200"
            >
              {savingPassword ? 'Изменение...' : 'Изменить пароль'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
