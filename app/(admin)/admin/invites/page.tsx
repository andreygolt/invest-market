import { redirect } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { CopyInviteLink, InviteCreateForm } from './invite-create-form';

export const dynamic = 'force-dynamic';

type InviteRow = {
  id: string;
  code: string;
  role: string;
  email: string | null;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
};

function isInviteAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

function getInviteStatus(invite: Pick<InviteRow, 'used_by' | 'expires_at'>) {
  if (invite.used_by) {
    return {
      label: 'Использован',
      className: 'border-green-200 bg-green-50 text-green-800',
    };
  }

  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return {
      label: 'Истёк',
      className: 'border-red-200 bg-red-50 text-red-800',
    };
  }

  return {
    label: 'Активен',
    className: 'border-gray-200 bg-gray-50 text-gray-700',
  };
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('ru-RU').format(new Date(value));
}

function inviteUrl(code: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${baseUrl}/invite/${code}`;
}

export default async function AdminInvitesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!isInviteAdmin(profile?.role)) redirect('/');

  const admin = createAdminClient();
  const { data: invites } = await admin
    .from('invites')
    .select('id, code, role, email, used_by, used_at, expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-bold">Инвайт-ссылки</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Создать инвайт</CardTitle>
        </CardHeader>
        <CardContent>
          <InviteCreateForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Существующие инвайты</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Роль</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Ссылка</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Создан</TableHead>
                <TableHead>Истекает</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invites ?? []).map((invite) => {
                const status = getInviteStatus(invite);
                const url = inviteUrl(invite.code);

                return (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.role}</TableCell>
                    <TableCell>{invite.email ?? '-'}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="max-w-xs truncate font-mono text-xs">{url}</span>
                        <CopyInviteLink url={url} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatDate(invite.created_at)}</TableCell>
                    <TableCell>{formatDate(invite.expires_at)}</TableCell>
                  </TableRow>
                );
              })}

              {(invites ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-gray-500">
                    Инвайтов нет
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
