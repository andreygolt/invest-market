import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildReferralLinks } from '@/lib/referral/links';
import { createClient } from '@/lib/supabase/server';

type ReferralBody = {
  code?: string;
  user_id?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as ReferralBody;
  if (!body.code || !body.user_id) {
    return NextResponse.json({ error: 'code and user_id required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== body.user_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = createAdminClient();
  const { data: refCode, error } = await supabaseAdmin
    .from('referral_codes')
    .select('user_id')
    .eq('code', body.code)
    .single();

  if (error || !refCode) {
    return NextResponse.json({ error: 'Referral code not found' }, { status: 404 });
  }

  if (refCode.user_id === body.user_id) {
    return NextResponse.json({ error: 'Self referral is not allowed' }, { status: 400 });
  }

  await buildReferralLinks(supabaseAdmin, body.user_id, refCode.user_id);

  return NextResponse.json({ ok: true });
}
