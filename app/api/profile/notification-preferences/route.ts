import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/profile/notification-preferences
 * Возвращает { email_enabled: boolean } текущего пользователя.
 * Если записи нет — email_enabled: true (дефолт).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ email_enabled: data?.email_enabled ?? true });
}

/**
 * PATCH /api/profile/notification-preferences
 * Body: { email_enabled: boolean }
 * Upsert предпочтений пользователя.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { email_enabled?: unknown };
  try {
    body = (await request.json()) as { email_enabled?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.email_enabled !== 'boolean') {
    return NextResponse.json({ error: 'email_enabled must be boolean' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('notification_preferences').upsert(
    {
      user_id: user.id,
      email_enabled: body.email_enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, email_enabled: body.email_enabled });
}
