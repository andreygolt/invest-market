import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { ProfileUpdate, UserProfile } from '@/types';

type ProfileRow = Omit<UserProfile, 'email'>;

function withEmail(profile: ProfileRow, email: string): UserProfile {
  return {
    id: profile.id,
    email,
    role: profile.role,
    full_name: profile.full_name,
    is_active: profile.is_active,
    created_at: profile.created_at,
  };
}

function validateProfileUpdate(value: unknown): ProfileUpdate | null {
  if (!value || typeof value !== 'object') return null;

  const body = value as { full_name?: unknown };
  if (body.full_name === undefined || typeof body.full_name !== 'string') return null;

  const fullName = body.full_name.trim();
  if (fullName.length === 0 || fullName.length > 100) return null;

  return { full_name: fullName };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active, created_at')
    .eq('id', user.id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(withEmail(data as ProfileRow, user.email ?? ''));
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const update = validateProfileUpdate((await request.json()) as unknown);
  if (!update) {
    return NextResponse.json({ error: 'Invalid full_name' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(update)
    .eq('id', user.id)
    .select('id, role, full_name, is_active, created_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(withEmail(data as ProfileRow, user.email ?? ''));
}
