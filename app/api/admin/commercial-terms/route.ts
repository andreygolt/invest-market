import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notifyCommercialTerms } from '@/lib/notifications/notify-commercial-terms';
import type { CommercialTermsRow } from '@/types';

type AdminRole = 'superadmin' | 'admin';

type ProjectWithTerms = {
  id: string;
  name: string;
  commercial_terms: CommercialTermsRow | CommercialTermsRow[] | null;
};

type CommercialTermsBody = {
  project_id?: string;
  success_fee_pct?: number;
  fixed_fee?: number;
  notes?: string | null;
};

function isAdminRole(role: string | null | undefined): role is AdminRole {
  return role === 'superadmin' || role === 'admin';
}

function getTerms(value: ProjectWithTerms['commercial_terms']) {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const { data: profile, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    return { error: NextResponse.json({ error: error.message }, { status: 500 }) };
  }

  if (!isAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id, name, commercial_terms(id, project_id, success_fee_pct, fixed_fee, notes, created_by, created_at, updated_at)'
    )
    .eq('status', 'approved')
    .order('name', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as ProjectWithTerms[]).map((project) => ({
    project_id: project.id,
    project_name: project.name,
    terms: getTerms(project.commercial_terms),
  }));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const auth = await requireAdmin(supabase);
  if (auth.error) return auth.error;

  const body = (await request.json()) as CommercialTermsBody;
  const { project_id, success_fee_pct, fixed_fee } = body;

  if (
    !project_id ||
    typeof success_fee_pct !== 'number' ||
    success_fee_pct < 0 ||
    success_fee_pct > 100 ||
    typeof fixed_fee !== 'number' ||
    fixed_fee < 0
  ) {
    return NextResponse.json({ error: 'Invalid commercial terms' }, { status: 400 });
  }

  const payload = {
    project_id,
    success_fee_pct,
    fixed_fee,
    notes: body.notes ?? null,
    created_by: auth.user.id,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('commercial_terms')
    .upsert(payload, { onConflict: 'project_id' })
    .select('id, project_id, success_fee_pct, fixed_fee, notes, created_by, created_at, updated_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  notifyCommercialTerms({
    projectId: data.project_id,
    successFeePct: data.success_fee_pct,
    fixedFee: data.fixed_fee,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  });

  return NextResponse.json(data as CommercialTermsRow);
}
