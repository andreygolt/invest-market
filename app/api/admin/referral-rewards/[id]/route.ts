import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyReferralReward } from '@/lib/notifications/notify-referral-reward';
import { requireReferralAdmin } from '@/lib/referral/admin-auth';
import type { ReferralRewardStatus } from '@/types';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isPatchStatus(value: unknown): value is Extract<ReferralRewardStatus, 'approved' | 'paid'> {
  return value === 'approved' || value === 'paid';
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireReferralAdmin();
  if (auth.error) return auth.error;

  const body = (await request.json()) as { status?: unknown };
  if (!isPatchStatus(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const { id } = await context.params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('referral_rewards')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, referrer_id, referee_id, portfolio_id, level, amount, status, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (data.referrer_id && (data.status === 'approved' || data.status === 'paid')) {
    notifyReferralReward({
      rewardId: data.id,
      referrerId: data.referrer_id,
      newStatus: data.status,
      amount: Number(data.amount),
      baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    });
  }

  return NextResponse.json(data);
}
