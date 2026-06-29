import { getSettings, settingAsNumber } from '@/lib/settings/get-settings';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CommercialTermsRow } from '@/types';
import { TermsForm } from './terms-form';

export const dynamic = 'force-dynamic';

type ProjectWithTerms = {
  id: string;
  name: string;
  commercial_terms: CommercialTermsRow | CommercialTermsRow[] | null;
};

function getTerms(value: ProjectWithTerms['commercial_terms']) {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function CommercialTermsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('projects')
    .select(
      'id, name, commercial_terms(id, project_id, success_fee_pct, fixed_fee, notes, created_by, created_at, updated_at)'
    )
    .eq('status', 'approved')
    .order('name', { ascending: true });

  const projects = ((data ?? []) as ProjectWithTerms[]).map((project) => ({
    id: project.id,
    name: project.name,
    terms: getTerms(project.commercial_terms),
  }));
  const settings = await getSettings();
  const defaultSuccessFee = settingAsNumber(settings, 'success_fee_default', 5);

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Коммерческие условия</h1>
        <p className="mt-1 text-sm text-slate-500">Success fee и фиксированные условия по проектам</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Одобренные проекты</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Название проекта</TableHead>
                <TableHead>Success fee, %</TableHead>
                <TableHead>Фиксированная часть, ₽</TableHead>
                <TableHead>Заметки</TableHead>
                <TableHead>Действие</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell>{project.terms?.success_fee_pct ?? 'Не установлено'}</TableCell>
                  <TableCell>
                    {project.terms ? formatRub(project.terms.fixed_fee) : 'Не установлено'}
                  </TableCell>
                  <TableCell className="max-w-xs text-slate-600">
                    {project.terms?.notes ?? 'Не установлено'}
                  </TableCell>
                  <TableCell>
                    <TermsForm
                      projectId={project.id}
                      terms={project.terms}
                      defaultSuccessFee={defaultSuccessFee}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                    Нет одобренных проектов
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
