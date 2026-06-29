'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import type { UserApplication, UserPortfolioEntry } from './page';
import type { UserProfile, UserRole } from '@/types';

const ALL_ROLES: UserRole[] = ['investor', 'project', 'manager', 'moderator', 'admin', 'superadmin'];

const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Суперадмин',
  admin: 'Администратор',
  moderator: 'Модератор',
  manager: 'Менеджер',
  investor: 'Инвестор',
  project: 'Проект',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  accepted: 'Принята',
  declined: 'Отклонена',
  cancelled: 'Отменена',
  withdrawn: 'Отозвана',
  approved: 'Одобрена',
  rejected: 'Отклонена',
  reviewing: 'На проверке',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

async function getErrorMessage(response: Response, fallback: string) {
  const json = (await response.json()) as { error?: string };
  return json.error ?? fallback;
}

interface Props {
  user: UserProfile;
  actorRole: string;
  applications: UserApplication[];
  portfolioEntries: UserPortfolioEntry[];
}

export default function UserDetailClient({ user, actorRole, applications, portfolioEntries }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [saving, setSaving] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canAssignSuperadmin = actorRole === 'superadmin';
  const availableRoles = canAssignSuperadmin
    ? ALL_ROLES
    : ALL_ROLES.filter((availableRole) => availableRole !== 'superadmin');

  async function handleSaveRole() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        setError(await getErrorMessage(response, 'Ошибка сохранения'));
        return;
      }

      setSuccess('Роль обновлена');
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleBlock() {
    setBlocking(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });

      if (!response.ok) {
        setError(await getErrorMessage(response, 'Ошибка'));
        return;
      }

      setIsActive((current) => !current);
      setSuccess(isActive ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
      router.refresh();
    } catch {
      setError('Ошибка сети');
    } finally {
      setBlocking(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium text-gray-500">Имя</dt>
              <dd className="mt-1 text-sm font-medium">{user.full_name ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Email</dt>
              <dd className="mt-1 text-sm">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Текущая роль</dt>
              <dd className="mt-1 text-sm">{ROLE_LABELS[user.role] ?? user.role}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Дата регистрации</dt>
              <dd className="mt-1 text-sm">{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-gray-500">Статус</dt>
              <dd className="mt-1">
                <Badge
                  variant="outline"
                  className={
                    isActive
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : 'border-red-200 bg-red-50 text-red-800'
                  }
                >
                  {isActive ? 'Активен' : 'Заблокирован'}
                </Badge>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Изменить роль</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((availableRole) => (
                  <SelectItem key={availableRole} value={availableRole}>
                    {ROLE_LABELS[availableRole]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              disabled={saving || role === user.role}
              onClick={() => void handleSaveRole()}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {isActive ? 'Заблокировать пользователя' : 'Разблокировать пользователя'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant={isActive ? 'destructive' : 'outline'}
            disabled={blocking}
            onClick={() => void handleToggleBlock()}
          >
            {blocking ? 'Обработка...' : isActive ? 'Заблокировать' : 'Разблокировать'}
          </Button>
        </CardContent>
      </Card>

      {applications.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Заявки ({applications.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Проект</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="font-medium">{application.project_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {application.amount != null
                        ? `${application.amount.toLocaleString('ru-RU')} ₽`
                        : '-'}
                    </TableCell>
                    <TableCell>{STATUS_LABELS[application.status] ?? application.status}</TableCell>
                    <TableCell className="text-gray-500">
                      {formatDate(application.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {portfolioEntries.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Портфель ({portfolioEntries.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Проект</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Дата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {portfolioEntries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.project_name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {entry.amount.toLocaleString('ru-RU')} ₽
                    </TableCell>
                    <TableCell className="text-gray-500">{formatDate(entry.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
