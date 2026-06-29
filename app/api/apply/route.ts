import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type ApplyBody = {
  userId?: unknown;
  email?: unknown;
  companyName?: unknown;
};

function parseBody(body: ApplyBody) {
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const companyName = typeof body.companyName === 'string' ? body.companyName.trim() : '';

  if (!userId || !email || !companyName) return null;
  return { userId, email, companyName };
}

export async function POST(request: NextRequest) {
  const parsed = parseBody((await request.json()) as ApplyBody);
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid apply payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { error: userError } = await supabase.from('users').upsert({
    id: parsed.userId,
    email: parsed.email,
    full_name: parsed.companyName,
    role: 'project',
    is_active: false,
  });

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 500 });
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .insert({
      owner_id: parsed.userId,
      name: parsed.companyName,
      status: 'draft',
    })
    .select('id')
    .single();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  return NextResponse.json({ projectId: project.id });
}
