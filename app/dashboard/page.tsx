import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SignOutButton } from '@/components/sign-out-button';
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
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto max-w-5xl space-y-8 px-4 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Кабинет инвестора</h1>
            <p className="mt-1 text-sm text-slate-500">
              Сводка по портфелю, заявкам и доступным сделкам
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="bg-slate-900 text-white hover:bg-slate-800">
              <Link href="/catalog">Смотреть каталог</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <Link href="/portfolio">Мой портфель</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <Link href="/applications">Мои заявки</Link>
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-slate-300 text-slate-700 hover:bg-slate-100"
            >
              <Link href="/favorites">Избранное</Link>
            </Button>
            <SignOutButton />
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-900">Мой портфель</h2>
          {dashboard.portfolio.total_invested === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
              Портфель пуст
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">Сумма вложений</div>
                <div className="text-2xl font-bold text-slate-900">
                  {formatRub(dashboard.portfolio.total_invested)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">Активные позиции</div>
                <div className="text-2xl font-bold text-slate-900">
                  {dashboard.portfolio.active_count}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">Завершённые выходы</div>
                <div className="text-2xl font-bold text-slate-900">
                  {dashboard.portfolio.exited_count}
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-xl font-semibold text-slate-900">Заявки</h2>
          {dashboard.applications.total === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
              Заявок нет
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">Всего</div>
                <div className="text-2xl font-bold text-slate-900">{dashboard.applications.total}</div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">На рассмотрении</div>
                <div className="text-2xl font-bold text-slate-900">
                  {dashboard.applications.pending}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-1 text-sm text-slate-500">Одобрено</div>
                <div className="text-2xl font-bold text-slate-900">
                  {dashboard.applications.approved}
                </div>
              </div>
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-900">Последние сделки</h2>
            <span className="text-sm text-slate-500">
              Избранное: {dashboard.favorites_count}
            </span>
          </div>
          {dashboard.recent_deals.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-600 shadow-sm">
              Пока нет доступных сделок
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {dashboard.recent_deals.map((deal) => (
                <div
                  key={deal.id}
                  className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div>
                    <div className="font-semibold text-slate-900">{deal.name}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {deal.industry ?? 'Без отрасли'}
                    </div>
                  </div>
                  <div className="text-sm text-slate-500">
                    {deal.investment_stage ?? 'Стадия не указана'}
                  </div>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className="border-slate-300 text-slate-700 hover:bg-slate-100"
                  >
                    <Link href={`/deals/${deal.id}`}>Открыть deal room</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
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
