import { NextResponse } from 'next/server';
import { buildCsv } from '@/lib/csv/build';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ProjectExportRow } from '@/types';

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
  const { data: projects, error } = await admin
    .from('projects')
    .select(
      'id, name, category, status, created_at, investment_min, investment_max, target_amount, currency'
    )
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });

  const rows: ProjectExportRow[] = (projects ?? []).map((project) => ({
    id: project.id as string,
    name: (project.name ?? '') as string,
    category: (project.category ?? '') as string,
    status: (project.status ?? '') as string,
    created_at: (project.created_at ?? '') as string,
    investment_min: project.investment_min as number | null,
    investment_max: project.investment_max as number | null,
    target_amount: project.target_amount as number | null,
    currency: project.currency as string | null,
  }));

  const csv = buildCsv(rows, [
    { key: 'id', header: 'ID' },
    { key: 'name', header: 'Название' },
    { key: 'category', header: 'Категория' },
    { key: 'status', header: 'Статус' },
    { key: 'created_at', header: 'Дата создания' },
    { key: 'investment_min', header: 'Мин. инвестиция' },
    { key: 'investment_max', header: 'Макс. инвестиция' },
    { key: 'target_amount', header: 'Целевая сумма' },
    { key: 'currency', header: 'Валюта' },
  ]);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="projects.csv"',
    },
  });
}
