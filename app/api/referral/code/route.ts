import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateReferralCode } from '@/lib/referral/code';
import type { ReferralCodeRow } from '@/types';

type ReferralCodeData = Pick<ReferralCodeRow, 'code'>;

async function insertReferralCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = generateReferralCode(userId);
    const { data, error } = await supabase
      .from('referral_codes')
      .insert({ user_id: userId, code })
      .select('code')
      .single();

    if (!error && data) {
      return (data as ReferralCodeData).code;
    }
  }

  throw new Error('Referral code creation failed');
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: existing, error } = await supabase
    .from('referral_codes')
    .select('code')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const code = ((existing as ReferralCodeData | null) ?? null)?.code ?? (await insertReferralCode(supabase, user.id));

  return NextResponse.json({
    code,
    invite_link: `/invite/${code}`,
  });
}
