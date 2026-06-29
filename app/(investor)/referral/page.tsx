import { cookies, headers } from 'next/headers';
import type { ReferralStats } from '@/types';
import { ReferralDashboard, type ReferralListResponse } from './referral-dashboard';

export const dynamic = 'force-dynamic';

type ReferralCodeResponse = {
  code: string;
  invite_link: string;
};

const emptyStats: ReferralStats = {
  code: null,
  total_referrals: 0,
  level1_count: 0,
  level2_count: 0,
  level3_count: 0,
  rewards_pending: 0,
  rewards_approved: 0,
  rewards_paid: 0,
};

const emptyList: ReferralListResponse = {
  items: [],
  total: 0,
};

async function getBaseUrl() {
  const headersList = await headers();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';
  return `${protocol}://${host}`;
}

async function getJson<T>(path: string, fallback: T): Promise<T> {
  const cookieStore = await cookies();
  const response = await fetch(`${await getBaseUrl()}${path}`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) return fallback;
  return (await response.json()) as T;
}

export default async function ReferralPage() {
  const [codeData, stats, referralList] = await Promise.all([
    getJson<ReferralCodeResponse | null>('/api/referral/code', null),
    getJson<ReferralStats>('/api/referral/stats', emptyStats),
    getJson<ReferralListResponse>('/api/referral/list?limit=20&offset=0', emptyList),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (await getBaseUrl());

  return (
    <ReferralDashboard
      appUrl={appUrl}
      code={codeData?.code ?? stats.code}
      stats={stats}
      initialReferralList={referralList}
    />
  );
}
