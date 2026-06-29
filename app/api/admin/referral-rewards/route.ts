import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireReferralAdmin } from '@/lib/referral/admin-auth';
import type { ReferralRewardRow, ReferralRewardStatus } from '@/types';

type UserJoin = { email: string } | { email: string }[] | null;

type RewardWithUsers = ReferralRewardRow & {
  referrer: UserJoin;
  referee: UserJoin;
};

function isRewardStatus(value: string | null): value is ReferralRewardStatus {
  return value === 'pending' || value === 'approved' || value === 'paid';
}

function getEmail(users: UserJoin): string {
  return (Array.isArray(users) ? users[0]?.email : users?.email) ?? '';
}

export async function GET(request: NextRequest) {
  const auth = await requireReferralAdmin();
  if (auth.error) return auth.error;

  const supabase = createAdminClient();
  const status = request.nextUrl.searchParams.get('status');

  let query = supabase
    .from('referral_rewards')
    .select(
      'id, referrer_id, referee_id, portfolio_id, level, amount, status, created_at, updated_at, referrer:users!referral_rewards_referrer_id_fkey(email), referee:users!referral_rewards_referee_id_fkey(email)',
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (isRewardStatus(status)) {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as RewardWithUsers[]).map((row) => ({
    id: row.id,
    referrer_id: row.referrer_id,
    referee_id: row.referee_id,
    portfolio_id: row.portfolio_id,
    level: row.level,
    amount: Number(row.amount),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    referrer_email: getEmail(row.referrer),
    referee_email: getEmail(row.referee),
  }));

  return NextResponse.json({
    items,
    total: count ?? items.length,
  });
}
