import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ApplicationNote } from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin', 'moderator', 'manager'];

type UserProfile = {
  role: string;
};

async function requireStaffUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single();
  const typedProfile = profile as UserProfile | null;

  if (!typedProfile || !ALLOWED_ROLES.includes(typedProfile.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { admin, user };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffUser();
  if (auth.error) return auth.error;

  const { id } = await params;
  const { data, error } = await auth.admin
    .from('application_notes')
    .select('id, application_id, author_id, content, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notesRaw = (data ?? []) as Omit<ApplicationNote, 'author_email'>[];
  const authorIds = [...new Set(notesRaw.map((note) => note.author_id))];
  const emailMap: Record<string, string> = {};

  if (authorIds.length > 0) {
    const { data: authors } = await auth.admin.from('users').select('id, email').in('id', authorIds);
    for (const author of (authors ?? []) as Array<{ id: string | null; email: string | null }>) {
      if (author.id && author.email) emailMap[author.id] = author.email;
    }
  }

  const notes: ApplicationNote[] = notesRaw.map((note) => ({
    ...note,
    author_email: emailMap[note.author_id] ?? null,
  }));

  return NextResponse.json({ notes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireStaffUser();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { content?: unknown };
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!content || content.length > 2000) {
    return NextResponse.json({ error: 'content required, max 2000 chars' }, { status: 400 });
  }

  const { data, error } = await auth.admin
    .from('application_notes')
    .insert({ application_id: id, author_id: auth.user.id, content })
    .select('id, application_id, author_id, content, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ note: data }, { status: 201 });
}
