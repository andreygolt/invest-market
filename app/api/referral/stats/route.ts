import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ReferralRewardStatus, ReferralStats } from '@/types';

type ReferralLinkData = {
  level: 1 | 2 | 3;
};

type ReferralRewardData = {
  amount: number | string | null;
  status: ReferralRewardStatus;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: codeRow, error: codeError } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', user.id)
    .maybeSingle();

  if (codeError) {
    return NextResponse.json({ error: codeError.message }, { status: 500 });
  }

  const { data: links, error: linksError } = await supabase
    .from('referral_links')
    .select('level')
    .eq('referrer_id', user.id);

  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }

  const { data: rewards, error: rewardsError } = await supabase
    .from('referral_rewards')
    .select('amount,status')
    .eq('referrer_id', user.id);

  if (rewardsError) {
    return NextResponse.json({ error: rewardsError.message }, { status: 500 });
  }

  const rows = (links ?? []) as ReferralLinkData[];
  const rewardRows = (rewards ?? []) as ReferralRewardData[];

  const stats: ReferralStats = {
    code: ((codeRow as { code: string } | null) ?? null)?.code ?? null,
    total_referrals: rows.length,
    level1_count: rows.filter((row) => row.level === 1).length,
    level2_count: rows.filter((row) => row.level === 2).length,
    level3_count: rows.filter((row) => row.level === 3).length,
    rewards_pending: 0,
    rewards_approved: 0,
    rewards_paid: 0,
  };

  for (const reward of rewardRows) {
    const amount = Number(reward.amount ?? 0);
    if (reward.status === 'pending') stats.rewards_pending += amount;
    if (reward.status === 'approved') stats.rewards_approved += amount;
    if (reward.status === 'paid') stats.rewards_paid += amount;
  }

  return NextResponse.json(stats);
}
