import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ROLES = ['admin', 'superadmin', 'moderator', 'manager'];

type UserProfile = {
  role: string;
};

type ApplicationNoteAuthor = {
  id: string;
  author_id: string;
};

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; note_id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('users').select('role').eq('id', user.id).single();
  const typedProfile = profile as UserProfile | null;

  if (!typedProfile || !ALLOWED_ROLES.includes(typedProfile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, note_id: noteId } = await params;
  const { data: note } = await admin
    .from('application_notes')
    .select('id, author_id')
    .eq('id', noteId)
    .eq('application_id', id)
    .single();
  const typedNote = note as ApplicationNoteAuthor | null;

  if (!typedNote) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (typedNote.author_id !== user.id && typedProfile.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('application_notes').delete().eq('id', noteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
