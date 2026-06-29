import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const INDUSTRIES = ['Энергетика', 'Медтех', 'АгроТех', 'Логистика', 'Финтех', 'Другое'];
const STAGES = ['idea', 'pre_seed', 'seed', 'series_a_plus'];

type QuestionnaireBody = {
  industry?: unknown;
  stage?: unknown;
  description?: unknown;
  raiseAmount?: unknown;
  useOfFunds?: unknown;
  teamSize?: unknown;
  website?: unknown;
};

function parseBody(body: QuestionnaireBody) {
  const industry = typeof body.industry === 'string' ? body.industry : '';
  const stage = typeof body.stage === 'string' ? body.stage : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const raiseAmount = typeof body.raiseAmount === 'string' ? body.raiseAmount.trim() : '';
  const useOfFunds = typeof body.useOfFunds === 'string' ? body.useOfFunds.trim() : '';
  const teamSize = typeof body.teamSize === 'number' ? body.teamSize : NaN;
  const website = typeof body.website === 'string' ? body.website.trim() : null;

  if (!INDUSTRIES.includes(industry)) return null;
  if (!STAGES.includes(stage)) return null;
  if (description.length < 100) return null;
  if (!raiseAmount || !useOfFunds) return null;
  if (!Number.isFinite(teamSize) || teamSize < 1) return null;

  return { industry, stage, description, raiseAmount, useOfFunds, teamSize, website };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = parseBody((await request.json()) as QuestionnaireBody);
  if (!body) {
    return NextResponse.json({ error: 'Invalid questionnaire payload' }, { status: 400 });
  }

  const { projectId } = await params;
  const admin = createAdminClient();

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, owner_id')
    .eq('id', projectId)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (project.owner_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await admin.from('project_questionnaire').upsert(
    {
      project_id: projectId,
      section: 's1',
      answers: body,
    },
    { onConflict: 'project_id,section' }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
