import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase
    .from('invites')
    .select('role,email,used_by,expires_at')
    .eq('code', code)
    .single();
  if (data) {
    if (data.used_by) return NextResponse.json({ valid: false, reason: 'used' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' });
    }
    return NextResponse.json({ valid: true, role: data.role, email: data.email });
  }

  const { data: referralCode } = await supabase
    .from('referral_codes')
    .select('user_id')
    .eq('code', code)
    .single();

  if (!referralCode) return NextResponse.json({ valid: false }, { status: 404 });

  return NextResponse.json({ valid: true, role: 'investor', email: null, is_referral: true });
}
