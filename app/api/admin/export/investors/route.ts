import { NextResponse } from 'next/server';
import { buildCsv } from '@/lib/csv/build';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { InvestorExportRow } from '@/types';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: investors, error } = await admin
    .from('profiles')
    .select('id, email, full_name, created_at')
    .eq('role', 'investor')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch investors' }, { status: 500 });

  const rows: InvestorExportRow[] = (investors ?? []).map((investor) => ({
    id: investor.id as string,
    email: (investor.email ?? '') as string,
    full_name: investor.full_name as string | null,
    created_at: (investor.created_at ?? '') as string,
  }));

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'email', header: 'Email' },
    { key: 'full_name', header: 'Полное имя' },
    { key: 'created_at', header: 'Дата регистрации' },
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="investors.csv"',
    },
  });
}
