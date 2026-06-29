import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ReferralRewardsAdmin, type ReferralRewardsResponse } from './referral-rewards-admin';

export const dynamic = 'force-dynamic';

const emptyRewards: ReferralRewardsResponse = {
  items: [],
  total: 0,
};

function isReferralAdmin(role: string | null | undefined) {
  return role === 'admin' || role === 'superadmin';
}

async function getBaseUrl() {
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getRewards(): Promise<ReferralRewardsResponse> {
  const cookieStore = await cookies();
  const response = await fetch(`${await getBaseUrl()}/api/admin/referral-rewards`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return emptyRewards;
  return (await response.json()) as ReferralRewardsResponse;
}

export default async function ReferralRewardsPage() {
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

  if (!isReferralAdmin(profile?.role)) redirect('/login');

  const initialRewards = await getRewards();

  return <ReferralRewardsAdmin initialRewards={initialRewards} />;
}
