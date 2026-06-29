import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PasswordUpdate } from '@/types';

function validatePasswordUpdate(value: unknown): PasswordUpdate | null {
  if (!value || typeof value !== 'object') return null;

  const body = value as { new_password?: unknown };
  if (typeof body.new_password !== 'string' || body.new_password.length < 8) {
    return null;
  }

  return { new_password: body.new_password };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = validatePasswordUpdate((await request.json()) as unknown);
  if (!update) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const { error } = await supabase.auth.updateUser({ password: update.new_password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
