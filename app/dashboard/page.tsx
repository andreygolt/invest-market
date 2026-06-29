import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { ProjectDashboardClient } from '@/app/(project)/dashboard/project-dashboard-client';
import type { InvestorDashboard, ProjectStatusLogEntry } from '@/types';

export const dynamic = 'force-dynamic';

const emptyDashboard: InvestorDashboard = {
  portfolio: {
    total_invested: 0,
    active_count: 0,
    exited_count: 0,
    defaulted_count: 0,
  },
  applications: {
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  },
  favorites_count: 0,
  recent_deals: [],
};

type DashboardProject = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  category?: string | null;
  short_description?: string | null;
};

type StatsRow = {
  views_count: number | null;
  applications_count: number | null;
};

type RecentUpdate = {
  id: string;
  title: string;
  created_at: string;
  ai_summary?: string | null;
};

function formatRub(value: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value);
}

async function getInvestorDashboard(): Promise<InvestorDashboard> {
  const headersList = await headers();
  const cookieStore = await cookies();
  const protocol = headersList.get('x-forwarded-proto') ?? 'http';
  const host = headersList.get('host') ?? 'localhost:3000';

  const response = await fetch(`${protocol}://${host}/api/investor/dashboard`, {
    headers: {
      cookie: cookieStore.toString(),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return emptyDashboard;
  }

  return (await response.json()) as InvestorDashboard;
}

async function getProjectDashboard(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, created_at, category, short_description')
    .eq('owner_id', userId)
    .maybeSingle<DashboardProject>();

  const { data: statsRow } = await supabase
    .from('project_view_stats')
    .select('views_count, applications_count')
    .eq('project_id', project?.id ?? '')
    .maybeSingle<StatsRow>();

  let viewsCount = statsRow?.views_count ?? 0;
  let applicationsCount = statsRow?.applications_count ?? 0;

  if (!statsRow && project?.id) {
    const [{ count: views }, { count: applications }] = await Promise.all([
      supabase
        .from('deal_room_views')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id),
      supabase
        .from('applications')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id),
    ]);

    viewsCount = views ?? 0;
    applicationsCount = applications ?? 0;
  }

  const { data: updates } = project?.id
    ? await supabase
        .from('project_updates')
        .select('id, title, created_at, ai_summary')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })
        .limit(3)
        .returns<RecentUpdate[]>()
    : { data: [] };

  const admin = createAdminClient();
  const { data: statusLogRaw } = project?.id
    ? await admin
        .from('project_status_log')
        .select('id, project_id, old_status:from_status, new_status:to_status, changed_at, changed_by')
        .eq('project_id', project.id)
        .order('changed_at', { ascending: true })
    : { data: [] };

  const statusLog: ProjectStatusLogEntry[] = statusLogRaw ?? [];

  return {
    project: project ?? null,
    viewsCount,
    applicationsCount,
    recentUpdates: updates ?? [],
    statusLog,
  };
}

function InvestorDashboardView({ dashboard }: { dashboard: InvestorDashboard }) {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Кабинет инвестора</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Сводка по портфелю, заявкам и доступным сделкам
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link href="/catalog">Смотреть каталог</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/portfolio">Мой портфель</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/applications">Мои заявки</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/favorites">Избранное</Link>
          </Button>
          <SignOutButton />
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Мой портфель</h2>
        {dashboard.portfolio.total_invested === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Портфель пуст
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Сумма вложений</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatRub(dashboard.portfolio.total_invested)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Активные позиции</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.portfolio.active_count}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Завершённые выходы</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.portfolio.exited_count}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Заявки</h2>
        {dashboard.applications.total === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Заявок нет
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Всего</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.applications.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">На рассмотрении</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.applications.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Одобрено</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.applications.approved}</div>
              </CardContent>
            </Card>
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Последние сделки</h2>
          <span className="text-sm text-muted-foreground">
            Избранное: {dashboard.favorites_count}
          </span>
        </div>
        {dashboard.recent_deals.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Пока нет доступных сделок
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dashboard.recent_deals.map((deal) => (
              <Card key={deal.id}>
                <CardHeader>
                  <CardTitle className="text-base">{deal.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{deal.industry ?? 'Без отрасли'}</p>
                </CardHeader>
                <CardContent>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {deal.investment_stage ?? 'Стадия не указана'}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/deals/${deal.id}`}>Открыть deal room</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role === 'project') {
    const dashboard = await getProjectDashboard(supabase, user.id);

    return <ProjectDashboardClient {...dashboard} />;
  }

  const dashboard = await getInvestorDashboard();

  return <InvestorDashboardView dashboard={dashboard} />;
}
