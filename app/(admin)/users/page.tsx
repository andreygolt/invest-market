import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { UsersClient, type UsersResponse } from './users-client';

export const dynamic = 'force-dynamic';

const emptyUsers: UsersResponse = {
  users: [],
  total: 0,
};

function isUsersAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

async function getBaseUrl() {
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getUsers(): Promise<UsersResponse> {
  const cookieStore = await cookies();
  const response = await fetch(`${await getBaseUrl()}/api/admin/users?page=1&limit=20`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return emptyUsers;
  return (await response.json()) as UsersResponse;
}

export default async function UsersPage() {
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

  if (!isUsersAdmin(profile?.role)) redirect('/login');

  const initialUsers = await getUsers();

  return <UsersClient initialUsers={initialUsers} currentUserId={user.id} />;
}
