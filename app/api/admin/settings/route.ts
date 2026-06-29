import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PlatformSetting, PlatformSettingKey, PlatformSettings } from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin'];
const WRITE_ROLES = ['superadmin'];

const VALID_KEYS: PlatformSettingKey[] = [
  'platform_name',
  'contact_email',
  'success_fee_default',
  'min_investment_amount',
  'max_investment_amount',
  'catalog_page_size',
];

const NUMERIC_KEYS: PlatformSettingKey[] = [
  'success_fee_default',
  'min_investment_amount',
  'max_investment_amount',
  'catalog_page_size',
];

async function getActorProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return data ? { id: user.id, role: data.role as string } : null;
}

export async function GET() {
  const actor = await getActorProfile();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!ALLOWED_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('platform_settings')
    .select('key, value, updated_at, updated_by');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const settings: PlatformSettings = {} as PlatformSettings;
  for (const row of (data ?? []) as PlatformSetting[]) {
    settings[row.key] = row.value;
  }

  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const actor = await getActorProfile();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!WRITE_ROLES.includes(actor.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates = Object.entries(body);
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No settings provided' }, { status: 400 });
  }

  for (const [key] of updates) {
    if (!VALID_KEYS.includes(key as PlatformSettingKey)) {
      return NextResponse.json({ error: `Unknown setting key: ${key}` }, { status: 400 });
    }
  }

  for (const [key, value] of updates) {
    if (NUMERIC_KEYS.includes(key as PlatformSettingKey)) {
      const num = Number(value);
      if (Number.isNaN(num) || num < 0) {
        return NextResponse.json(
          { error: `Setting "${key}" must be a non-negative number` },
          { status: 400 }
        );
      }
    }

    if (typeof value !== 'string' && typeof value !== 'number') {
      return NextResponse.json(
        { error: `Setting "${key}" must be a string or number` },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();
  const now = new Date().toISOString();
  const rows = updates.map(([key, value]) => ({
    key,
    value: String(value),
    updated_at: now,
    updated_by: actor.id,
  }));

  const { error } = await admin.from('platform_settings').upsert(rows, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
