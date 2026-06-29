'use client';

import { FormEvent, useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Invite, InviteInsert, InviteRole } from '@/types';

export type InviteStatus = 'unused' | 'used' | 'expired';

export type InvitesResponse = {
  invites: Invite[];
  total: number;
};

type InvitesClientProps = {
  initialInvites: InvitesResponse;
};

const PAGE_SIZE = 20;
const INVITE_ROLES: InviteRole[] = ['investor', 'project', 'admin', 'moderator', 'manager'];

const STATUS_BADGE_CLASSES: Record<InviteStatus, string> = {
  unused: 'border-gray-200 bg-gray-50 text-gray-700',
  used: 'border-green-200 bg-green-50 text-green-800',
  expired: 'border-red-200 bg-red-50 text-red-800',
};

export function getInviteStatus(invite: Pick<Invite, 'used_by' | 'expires_at'>): InviteStatus {
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) return 'expired';
  if (invite.used_by) return 'used';
  return 'unused';
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

export function InvitesClient({ initialInvites }: InvitesClientProps) {
  const [role, setRole] = useState<InviteRole>('investor');
  const [email, setEmail] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [invites, setInvites] = useState(initialInvites.invites);
  const [total, setTotal] = useState(initialInvites.total);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadInvites = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/invites?page=${nextPage}&limit=${PAGE_SIZE}`);
      if (!response.ok) return;
      const data = (await response.json()) as InvitesResponse;
      setInvites(data.invites);
      setTotal(data.total);
      setPage(nextPage);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    try {
      const payload: InviteInsert = {
        role,
        email: email || undefined,
        expires_at: expiresAt || undefined,
        note: note || undefined,
      };

      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        setEmail('');
        setExpiresAt('');
        setNote('');
        await loadInvites(1);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(inviteId: string) {
    setDeletingId(inviteId);
    try {
      const response = await fetch(`/api/admin/invites/${inviteId}`, { method: 'DELETE' });
      if (response.ok) {
        await loadInvites(page);
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCopy(code: string) {
    const link = `${window.location.origin}/invite/${code}`;
    await navigator.clipboard.writeText(link);
  }

  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Инвайты</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Создание и управление кодами доступа
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Создать инвайт</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Роль</Label>
              <Select value={role} onValueChange={(value) => setRole(value as InviteRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Дата истечения</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Примечание</Label>
              <Input value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? 'Создаём...' : 'Создать инвайт'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Список инвайтов</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Код</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Истекает</TableHead>
                <TableHead>Примечание</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.map((invite) => {
                const status = getInviteStatus(invite);
                return (
                  <TableRow key={invite.id}>
                    <TableCell className="font-mono text-sm">{invite.code}</TableCell>
                    <TableCell>{invite.role}</TableCell>
                    <TableCell>{invite.email ?? '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_BADGE_CLASSES[status]}>
                        {status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invite.created_at)}</TableCell>
                    <TableCell>{formatDate(invite.expires_at)}</TableCell>
                    <TableCell>{invite.note ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => void handleCopy(invite.code)}
                        >
                          Копировать ссылку
                        </Button>
                        {status === 'unused' ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={deletingId === invite.id}
                            onClick={() => void handleDelete(invite.id)}
                          >
                            {deletingId === invite.id ? 'Удаляем...' : 'Удалить'}
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-gray-500">
                    Инвайтов нет
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{loading ? 'Загрузка...' : `Всего записей: ${total}`}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasPrevious || loading}
                onClick={() => void loadInvites(page - 1)}
              >
                Назад
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasNext || loading}
                onClick={() => void loadInvites(page + 1)}
              >
                Вперёд
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
