import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

type AppRow = {
  id: string;
  status: string;
  amount: number | null;
  instrument: string | null;
  message: string | null;
  created_at: string;
  rejection_reason: string | null;
  projects: { name: string | null } | { name: string | null }[] | null;
  users: { email: string | null } | { email: string | null }[] | null;
};

function getName(p: AppRow['projects']): string | null {
  return (Array.isArray(p) ? p[0]?.name : p?.name) ?? null;
}

function getEmail(u: AppRow['users']): string | null {
  return (Array.isArray(u) ? u[0]?.email : u?.email) ?? null;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();

  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single();

  const allowed = ['admin', 'superadmin', 'manager'];
  if (!profile || !allowed.includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const projectId = searchParams.get('project_id');
  const dateFrom = searchParams.get('date_from');
  const dateTo = searchParams.get('date_to');

  let query = admin
    .from('investor_applications')
    .select(
      'id, status, amount, instrument, message, created_at, rejection_reason, projects(name), users(email)'
    )
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (projectId) query = query.eq('project_id', projectId);
  if (dateFrom) query = query.gte('created_at', dateFrom);
  if (dateTo) query = query.lte('created_at', dateTo);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const csvHeaders = [
    'ID',
    'Проект',
    'Инвестор (email)',
    'Статус',
    'Сумма',
    'Инструмент',
    'Сообщение',
    'Причина отклонения',
    'Дата создания',
  ];

  const rows = ((data ?? []) as AppRow[]).map((row) => [
    row.id,
    getName(row.projects),
    getEmail(row.users),
    row.status,
    row.amount,
    row.instrument,
    row.message,
    row.rejection_reason,
    row.created_at,
  ]);

  const csv = [csvHeaders, ...rows].map((r) => r.map(escapeCSV).join(',')).join('\n');

  const filename = `applications-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
