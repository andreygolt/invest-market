import { NextResponse } from 'next/server';
import { buildCsv } from '@/lib/csv/build';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ApplicationExportRow } from '@/types';

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
  const { data: applications, error } = await admin
    .from('investor_applications')
    .select(
      `
      id,
      project_id,
      investor_id,
      amount,
      currency,
      status,
      created_at,
      projects ( name ),
      profiles ( email, full_name )
    `
    )
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch applications' }, { status: 500 });

  const rows: ApplicationExportRow[] = (applications ?? []).map((application) => ({
    id: application.id as string,
    project_id: application.project_id as string,
    project_name: ((application.projects as { name?: string } | null)?.name ?? '') as string,
    investor_id: application.investor_id as string,
    investor_email: ((application.profiles as { email?: string } | null)?.email ?? '') as string,
    amount: application.amount as number | null,
    currency: application.currency as string | null,
    status: (application.status ?? '') as string,
    created_at: (application.created_at ?? '') as string,
  }));

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'project_id', header: 'ID проекта' },
    { key: 'project_name', header: 'Проект' },
    { key: 'investor_id', header: 'ID инвестора' },
    { key: 'investor_email', header: 'Email инвестора' },
    { key: 'amount', header: 'Сумма' },
    { key: 'currency', header: 'Валюта' },
    { key: 'status', header: 'Статус' },
    { key: 'created_at', header: 'Дата заявки' },
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="applications.csv"',
    },
  });
}
