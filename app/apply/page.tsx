'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';

export default function ApplyPage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const trimmedCompanyName = companyName.trim();
    const trimmedEmail = email.trim();

    if (!trimmedCompanyName || !trimmedEmail || password.length < 8) {
      setError('Заполните все поля. Пароль должен быть не короче 8 символов.');
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { full_name: trimmedCompanyName } },
    });

    if (signUpError || !data.user) {
      setError(signUpError?.message ?? 'Не удалось зарегистрировать пользователя.');
      setLoading(false);
      return;
    }

    const response = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: data.user.id,
        email: trimmedEmail,
        companyName: trimmedCompanyName,
      }),
    });
    const result = (await response.json()) as { projectId?: string; error?: string };

    if (!response.ok || !result.projectId) {
      setError(result.error ?? 'Не удалось создать заявку.');
      setLoading(false);
      return;
    }

    router.push(`/apply/questionnaire?project_id=${result.projectId}`);
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10 text-slate-950">
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-slate-500">Invest Market</p>
          <h1 className="mt-2 text-3xl font-semibold">Предложить проект</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Регистрация проекта</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="companyName">
                  Название компании / проекта
                </label>
                <Input
                  id="companyName"
                  type="text"
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="password">
                  Пароль
                </label>
                <Input
                  id="password"
                  type="password"
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error ? <p className="text-sm text-red-600">{error}</p> : null}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Отправляем...' : 'Подать заявку'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
