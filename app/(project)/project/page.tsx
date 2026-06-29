import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import ProjectDashboardClient from './project-dashboard-client';
import type { ProjectDashboardData, ProjectStats, ProjectStatusLogEntry } from '@/types';

export const dynamic = 'force-dynamic';

async function createProject(formData: FormData) {
  'use server';

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  const headersList = await headers();
  const cookieStore = await cookies();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';

  const response = await fetch(`${protocol}://${host}/api/project/my`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieStore.toString(),
    },
    body: JSON.stringify({ name }),
    cache: 'no-store',
  });

  if (response.ok) {
    redirect('/project');
  }
}

export default async function ProjectDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: project } = await supabase
    .from('projects')
    .select('id,name,status,questionnaire_s1,questionnaire_s5,video_path,created_at,rejection_reason')
    .eq('owner_id', user.id)
    .maybeSingle<ProjectDashboardData>();

  if (!project) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8">
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Создать проект</h1>
          <p className="mb-6 text-sm text-slate-500">Введите название проекта, чтобы открыть кабинет.</p>
          <form action={createProject} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm text-slate-600">Название проекта</Label>
              <Input
                id="name"
                name="name"
                required
                placeholder="Например: FinTech Startup"
                className="border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-slate-500"
              />
            </div>
            <Button type="submit" className="w-full bg-slate-900 text-white hover:bg-slate-700">
              Создать
            </Button>
          </form>
        </div>
      </main>
    );
  }

  const { count } = await supabase
    .from('project_documents')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', project.id);

  let stats: ProjectStats | null = null;
  if (project.status === 'approved') {
    const cookieStore = await cookies();
    const cookieHeader = cookieStore.toString();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const statsRes = await fetch(`${baseUrl}/api/project/stats`, {
      headers: { cookie: cookieHeader },
      cache: 'no-store',
    });

    if (statsRes.ok) {
      stats = (await statsRes.json()) as ProjectStats;
    }
  }

  const admin = createAdminClient();
  const { data: statusLogRaw } = await admin
    .from('project_status_log')
    .select('id, project_id, old_status:from_status, new_status:to_status, changed_at, changed_by')
    .eq('project_id', project.id)
    .order('changed_at', { ascending: true });

  const statusLog: ProjectStatusLogEntry[] = statusLogRaw ?? [];

  return (
    <ProjectDashboardClient
      docsCount={count ?? 0}
      project={project}
      stats={stats}
      statusLog={statusLog}
    />
  );
}
