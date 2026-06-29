import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

type ReferralLevel = 1 | 2 | 3;

type UserJoin = { email: string } | { email: string }[] | null;

type ReferralListRow = {
  referee_id: string;
  level: ReferralLevel;
  created_at: string;
  users: UserJoin;
};

function isReferralLevel(value: string | null): value is '1' | '2' | '3' {
  return value === '1' || value === '2' || value === '3';
}

function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  const first = local[0] ?? '*';
  return `${first}***@${domain}`;
}

function getEmail(users: UserJoin): string {
  return (Array.isArray(users) ? users[0]?.email : users?.email) ?? '';
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const level = request.nextUrl.searchParams.get('level') ?? 'all';
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '20');
  const offset = Number(request.nextUrl.searchParams.get('offset') ?? '0');
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20;
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

  let query = supabase
    .from('referral_links')
    .select('referee_id, level, created_at, users!referral_links_referee_id_fkey(email)', {
      count: 'exact',
    })
    .eq('referrer_id', user.id)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (isReferralLevel(level)) {
    query = query.eq('level', Number(level) as ReferralLevel);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as ReferralListRow[]).map((row) => ({
    referee_id: row.referee_id,
    masked_email: maskEmail(getEmail(row.users)),
    level: row.level,
    joined_at: row.created_at,
  }));

  return NextResponse.json({
    items,
    total: count ?? items.length,
  });
}
