'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { InviteRole } from '@/types';

interface InvitePageProps {
  params: Promise<{ code: string }>;
}

interface InviteCheckResponse {
  valid: boolean;
  role?: InviteRole;
  email?: string | null;
  reason?: string;
}

export default function InvitePage({ params }: InvitePageProps) {
  const { code } = use(params);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [valid, setValid] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function loadInvite() {
      setLoading(true);
      setError('');
      const response = await fetch(`/api/invite/${encodeURIComponent(code)}`);
      const data = (await response.json()) as InviteCheckResponse;
      if (!response.ok || !data.valid) {
        setError('Ссылка недействительна');
        setValid(false);
        setLoading(false);
        return;
      }
      setEmail(data.email || '');
      setValid(true);
      setLoading(false);
    }

    void loadInvite();
  }, [code]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;

    setSubmitting(true);
    setError('');

    const {
      data: { user },
      error: signUpError,
    } = await supabase.auth.signUp({ email, password });

    if (signUpError || !user) {
      setError(signUpError?.message || 'Не удалось зарегистрироваться');
      setSubmitting(false);
      return;
    }

    const response = await fetch(`/api/invite/${encodeURIComponent(code)}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error || 'Не удалось использовать инвайт');
      setSubmitting(false);
      return;
    }

    router.push('/pending');
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 text-white">
        <p className="text-sm text-slate-400">Проверяем ссылку...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] px-6 py-10 text-white">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="h-[360px] w-[560px] rounded-full bg-white/5 blur-3xl" />
      </div>
      <div className="relative z-10 w-full max-w-md rounded-lg border border-slate-800 bg-black/50 p-8 shadow-2xl">
        <div className="mb-6 text-xs uppercase tracking-widest text-slate-500">
          Закрытая платформа
        </div>
        <h1 className="mb-6 text-2xl font-semibold text-white">Создание аккаунта</h1>

        {error && !valid ? (
          <p className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
            Ссылка недействительна
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-slate-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-slate-400"
            />
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !valid}
            className="w-full rounded-lg bg-white py-2.5 text-sm font-medium text-black transition hover:bg-slate-100 disabled:opacity-50"
          >
            {submitting ? 'Создаём аккаунт...' : 'Создать аккаунт'}
          </button>
          </form>
        )}
      </div>
    </main>
  );
}
