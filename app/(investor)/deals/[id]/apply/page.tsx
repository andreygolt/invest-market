import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSettings, settingAsNumber } from '@/lib/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/admin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { QS6Answers } from '@/types';
import { ApplyForm } from './apply-form';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ApplyPage({ params }: PageProps) {
  const { id: projectId } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  if (!project) notFound();

  const { data: s6Row } = await supabase
    .from('project_questionnaire')
    .select('answers')
    .eq('project_id', projectId)
    .eq('section', 's6')
    .maybeSingle();

  const s6 = (s6Row?.answers ?? {}) as Partial<QS6Answers>;
  const settings = await getSettings();
  const minAmount = settingAsNumber(settings, 'min_investment_amount', 1_000_000);
  const maxAmount = settingAsNumber(settings, 'max_investment_amount', 500_000_000);

  return (
    <div className="container mx-auto max-w-2xl py-8">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/deals/${projectId}`}>← Назад к проекту</Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Оставить заявку</CardTitle>
        </CardHeader>
        <CardContent>
          <ApplyForm
            projectId={project.id}
            projectName={project.name}
            investmentAsk={s6.investment_ask ?? null}
            minAmount={minAmount}
            maxAmount={maxAmount}
          />
        </CardContent>
      </Card>
    </div>
  );
}
