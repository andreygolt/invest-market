'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type InviteRole = 'investor' | 'project' | 'moderator' | 'manager';

type InviteCreateResponse = {
  code: string;
  url: string;
};

const INVITE_ROLES: InviteRole[] = ['investor', 'project', 'moderator', 'manager'];

export function InviteCreateForm() {
  const router = useRouter();
  const [role, setRole] = useState<InviteRole>('investor');
  const [email, setEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('30');
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        email: email.trim() || undefined,
        expiresInDays: expiresInDays === 'none' ? undefined : Number(expiresInDays),
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as InviteCreateResponse;
      setCreatedUrl(data.url);
      setEmail('');
      setExpiresInDays('30');
    } else {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? 'Не удалось создать инвайт');
    }

    setLoading(false);
  }

  async function handleCopy() {
    if (!createdUrl) return;
    await navigator.clipboard.writeText(createdUrl);
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4 md:grid-cols-4">
      <div className="space-y-2">
        <Label>Role</Label>
        <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
          <SelectTrigger>
            <SelectValue />
            <SelectContent>
              {INVITE_ROLES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectTrigger>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Email</Label>
        <Input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="user@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label>Expires in</Label>
        <Select value={expiresInDays} onValueChange={setExpiresInDays}>
          <SelectTrigger>
            <SelectValue />
            <SelectContent>
              <SelectItem value="7">7 дней</SelectItem>
              <SelectItem value="30">30 дней</SelectItem>
              <SelectItem value="none">Без срока</SelectItem>
            </SelectContent>
          </SelectTrigger>
        </Select>
      </div>

      <div className="flex items-end">
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Создание...' : 'Создать инвайт'}
        </Button>
      </div>

      {error ? <div className="md:col-span-4 text-sm text-red-700">{error}</div> : null}

      {createdUrl ? (
        <div className="md:col-span-4 rounded-md border bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-medium">Инвайт создан</div>
          <div className="mb-4 break-all rounded-md bg-gray-50 p-3 font-mono text-sm">
            {createdUrl}
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={() => void handleCopy()}>
              Скопировать
            </Button>
            <Button type="button" variant="outline" onClick={() => setCreatedUrl(null)}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

export function CopyInviteLink({ url }: { url: string }) {
  async function handleCopy() {
    await navigator.clipboard.writeText(url);
  }

  return (
    <Button type="button" size="sm" variant="outline" onClick={() => void handleCopy()}>
      Скопировать
    </Button>
  );
}
