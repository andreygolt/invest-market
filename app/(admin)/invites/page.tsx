import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { InvitesClient, type InvitesResponse } from './invites-client';

export const dynamic = 'force-dynamic';

const emptyInvites: InvitesResponse = {
  invites: [],
  total: 0,
};

function isInviteAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

async function getBaseUrl() {
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getInvites(): Promise<InvitesResponse> {
  const cookieStore = await cookies();
  const response = await fetch(`${await getBaseUrl()}/api/admin/invites?page=1&limit=20`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return emptyInvites;
  return (await response.json()) as InvitesResponse;
}

export default async function InvitesPage() {
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

  if (!isInviteAdmin(profile?.role)) redirect('/login');

  const initialInvites = await getInvites();

  return <InvitesClient initialInvites={initialInvites} />;
}
