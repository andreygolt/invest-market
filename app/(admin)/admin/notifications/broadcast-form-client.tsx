'use client';

import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import type { BroadcastResult, BroadcastTargetRole } from '@/types';

const ROLE_LABELS: Record<BroadcastTargetRole, string> = {
  all: 'Все пользователи',
  investor: 'Инвесторы',
  project: 'Владельцы проектов',
  manager: 'Менеджеры',
  moderator: 'Модераторы',
  admin: 'Администраторы',
  superadmin: 'Суперадмины',
};

export default function BroadcastFormClient() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [targetRole, setTargetRole] = useState<BroadcastTargetRole>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BroadcastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const res = await fetch('/api/admin/notifications/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        body: body.trim(),
        link: link.trim() || undefined,
        target_role: targetRole,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as BroadcastResult;
      setResult(data);
      setTitle('');
      setBody('');
      setLink('');
      setTargetRole('all');
    } else {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Ошибка при отправке');
    }

    setLoading(false);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <div className="space-y-1">
        <Label>Получатели</Label>
        <Select
          value={targetRole}
          onValueChange={(value) => setTargetRole(value as BroadcastTargetRole)}
        >
          <SelectTrigger>
            <SelectValue />
            <SelectContent>
              {(Object.keys(ROLE_LABELS) as BroadcastTargetRole[]).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectTrigger>
        </Select>
      </div>

      <div className="space-y-1">
        <Label>Заголовок</Label>
        <Input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          required
          placeholder="Краткий заголовок объявления"
        />
        <div className="text-right text-xs text-slate-400">{title.length}/120</div>
      </div>

      <div className="space-y-1">
        <Label>Текст</Label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={1000}
          required
          rows={4}
          placeholder="Текст объявления"
        />
        <div className="text-right text-xs text-slate-400">{body.length}/1000</div>
      </div>

      <div className="space-y-1">
        <Label>
          Ссылка <span className="text-slate-400">(необязательно)</span>
        </Label>
        <Input
          type="text"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="/catalog или https://..."
        />
      </div>

      {result && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Объявление отправлено: {result.sent}{' '}
          {result.sent === 1 ? 'пользователю' : 'пользователям'} (
          {ROLE_LABELS[result.target_role]})
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      <Button type="submit" disabled={loading || !title.trim() || !body.trim()}>
        {loading ? 'Отправка...' : 'Отправить объявление'}
      </Button>
    </form>
  );
}
