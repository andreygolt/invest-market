'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import type { UserProfile, UserProfileUpdate, UserRole } from '@/types';

type UserWithConfirmed = UserProfile & { email_confirmed?: boolean };

export type UsersResponse = {
  users: UserProfile[];
  total: number;
};

type UsersClientProps = {
  initialUsers: UsersResponse;
  currentUserId: string;
};

type RoleFilter = 'all' | Exclude<UserRole, 'superadmin'>;

const PAGE_SIZE = 20;
const USER_ROLES: UserRole[] = [
  'superadmin',
  'admin',
  'moderator',
  'manager',
  'investor',
  'project',
];
const ROLE_FILTERS: RoleFilter[] = ['all', 'investor', 'project', 'admin', 'moderator', 'manager'];

const STATUS_BADGE_CLASSES = {
  active: 'border-green-200 bg-green-50 text-green-800',
  inactive: 'border-red-200 bg-red-50 text-red-800',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

function getDraftRoles(users: UserProfile[]) {
  return Object.fromEntries(users.map((user) => [user.id, user.role])) as Record<string, UserRole>;
}

export function UsersClient({ initialUsers, currentUserId }: UsersClientProps) {
  const [users, setUsers] = useState(initialUsers.users);
  const [total, setTotal] = useState(initialUsers.total);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [draftRoles, setDraftRoles] = useState<Record<string, UserRole>>(() =>
    getDraftRoles(initialUsers.users)
  );
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const queryString = useCallback(
    (nextPage: number, nextSearch: string, nextRole: RoleFilter) => {
      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(PAGE_SIZE),
      });
      if (nextSearch.trim()) params.set('search', nextSearch.trim());
      if (nextRole !== 'all') params.set('role', nextRole);
      return params.toString();
    },
    []
  );

  const loadUsers = useCallback(
    async (nextPage: number, nextSearch = search, nextRole = roleFilter) => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/users?${queryString(nextPage, nextSearch, nextRole)}`);
        if (!response.ok) return;
        const data = (await response.json()) as UsersResponse;
        setUsers(data.users);
        setTotal(data.total);
        setPage(nextPage);
        setDraftRoles(getDraftRoles(data.users));
      } finally {
        setLoading(false);
      }
    },
    [queryString, roleFilter, search]
  );

  const debouncedLoad = useCallback(
    (nextSearch: string, nextRole: RoleFilter) => {
      return window.setTimeout(() => {
        void loadUsers(1, nextSearch, nextRole);
      }, 300);
    },
    [loadUsers]
  );

  useEffect(() => {
    const timer = debouncedLoad(search, roleFilter);
    return () => window.clearTimeout(timer);
  }, [debouncedLoad, roleFilter, search]);

  const hasPrevious = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  const rows = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        draftRole: draftRoles[user.id] ?? user.role,
        isSelf: user.id === currentUserId,
      })),
    [currentUserId, draftRoles, users]
  );

  async function confirmEmail(userId: string) {
    setSavingId(userId);
    try {
      await fetch(`/api/admin/users/${userId}`, { method: 'POST' });
      await loadUsers(page);
    } finally {
      setSavingId(null);
    }
  }

  async function updateUser(userId: string, payload: UserProfileUpdate) {
    setSavingId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        await loadUsers(page);
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold">Пользователи</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Просмотр пользователей, смена ролей и управление активностью
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Список пользователей</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <Input
              placeholder="Поиск по email / имени"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_FILTERS.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role === 'all' ? 'Все роли' : role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Имя</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.full_name ?? '-'}</TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.is_active
                          ? STATUS_BADGE_CLASSES.active
                          : STATUS_BADGE_CLASSES.inactive
                      }
                    >
                      {user.is_active ? 'active' : 'inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(user.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Select
                        value={user.draftRole}
                        onValueChange={(value) => {
                          if (user.isSelf || savingId === user.id) return;
                          setDraftRoles((current) => ({
                            ...current,
                            [user.id]: value as UserRole,
                          }));
                        }}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {USER_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {role}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={user.isSelf || savingId === user.id || user.draftRole === user.role}
                        onClick={() => void updateUser(user.id, { role: user.draftRole })}
                      >
                        Сохранить
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={user.is_active ? 'destructive' : 'outline'}
                        disabled={user.isSelf || savingId === user.id}
                        onClick={() => void updateUser(user.id, { is_active: !user.is_active })}
                      >
                        {user.is_active ? 'Деактивировать' : 'Активировать'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={savingId === user.id}
                        onClick={() => void confirmEmail(user.id)}
                      >
                        Подтвердить email
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                    Пользователи не найдены
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
                onClick={() => void loadUsers(page - 1)}
              >
                Назад
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasNext || loading}
                onClick={() => void loadUsers(page + 1)}
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
