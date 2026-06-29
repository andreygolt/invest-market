import Link from 'next/link';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectRow } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ModerationPage() {
  const supabase = createAdminClient();

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, created_at, updated_at')
    .in('status', ['submitted', 'under_review'])
    .order('updated_at', { ascending: false });

  const items = (projects ?? []) as Pick<
    ProjectRow,
    'id' | 'name' | 'status' | 'created_at' | 'updated_at'
  >[];

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Модерация проектов</h1>
        <p className="text-gray-500 mt-1">Проекты, ожидающие проверки: {items.length}</p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            Нет проектов на модерации
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((project) => (
            <Card key={project.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  <Badge variant={project.status === 'submitted' ? 'default' : 'secondary'}>
                    {project.status}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">
                  Обновлён: {new Date(project.updated_at).toLocaleDateString('ru-RU')}
                </p>
              </CardHeader>
              <CardContent>
                <Button asChild size="sm">
                  <Link href={`/moderation/${project.id}`}>Открыть на проверку</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
