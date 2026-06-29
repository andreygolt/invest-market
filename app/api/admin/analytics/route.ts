import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { AnalyticsBucket, AnalyticsPeriod, AnalyticsResponse } from '@/types';

const ALLOWED_ROLES = ['admin', 'superadmin'];

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

function weekLabel(iso: string, index: number): string {
  return `Нед. ${index + 1} (${dayLabel(iso)})`;
}

function countInRange(dates: string[], from: string, to: string): number {
  return dates.filter((d) => d >= from && d < to).length;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const raw = request.nextUrl.searchParams.get('period') ?? '30d';
  const period: AnalyticsPeriod = (['7d', '30d', '90d'] as const).includes(
    raw as AnalyticsPeriod
  )
    ? (raw as AnalyticsPeriod)
    : '30d';

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
  const useWeeks = period === '90d';

  const now = startOfDay(new Date());
  const from = addDays(now, -days);
  const fromIso = from.toISOString();

  const admin = createAdminClient();

  const [regResult, projResult, viewsResult, appsResult, portResult] = await Promise.all([
    admin.from('profiles').select('created_at').gte('created_at', fromIso),
    admin.from('projects').select('created_at').gte('created_at', fromIso),
    admin.from('deal_room_views').select('viewed_at').gte('viewed_at', fromIso),
    admin.from('investor_applications').select('created_at').gte('created_at', fromIso),
    admin.from('investor_portfolio').select('created_at').gte('created_at', fromIso),
  ]);

  const firstError =
    regResult.error ??
    projResult.error ??
    viewsResult.error ??
    appsResult.error ??
    portResult.error;

  if (firstError) {
    return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 });
  }

  const regDates = ((regResult.data ?? []) as { created_at: string }[]).map((r) =>
    r.created_at.slice(0, 10)
  );
  const projDates = ((projResult.data ?? []) as { created_at: string }[]).map((r) =>
    r.created_at.slice(0, 10)
  );
  const viewDates = ((viewsResult.data ?? []) as { viewed_at: string }[]).map((r) =>
    r.viewed_at.slice(0, 10)
  );
  const appDates = ((appsResult.data ?? []) as { created_at: string }[]).map((r) =>
    r.created_at.slice(0, 10)
  );
  const portDates = ((portResult.data ?? []) as { created_at: string }[]).map((r) =>
    r.created_at.slice(0, 10)
  );

  const buckets: AnalyticsBucket[] = [];

  if (!useWeeks) {
    for (let i = 0; i < days; i++) {
      const bucketStart = addDays(from, i);
      const bucketEnd = addDays(from, i + 1);
      const bs = isoDate(bucketStart);
      const be = isoDate(bucketEnd);

      buckets.push({
        label: dayLabel(bs),
        date_from: bs,
        registrations: countInRange(regDates, bs, be),
        project_submissions: countInRange(projDates, bs, be),
        deal_room_views: countInRange(viewDates, bs, be),
        applications: countInRange(appDates, bs, be),
        portfolio_entries: countInRange(portDates, bs, be),
      });
    }
  } else {
    const weekCount = Math.ceil(days / 7);
    for (let i = 0; i < weekCount; i++) {
      const bucketStart = addDays(from, i * 7);
      const bucketEnd = addDays(from, Math.min((i + 1) * 7, days));
      const bs = isoDate(bucketStart);
      const be = isoDate(bucketEnd);

      buckets.push({
        label: weekLabel(bs, i),
        date_from: bs,
        registrations: countInRange(regDates, bs, be),
        project_submissions: countInRange(projDates, bs, be),
        deal_room_views: countInRange(viewDates, bs, be),
        applications: countInRange(appDates, bs, be),
        portfolio_entries: countInRange(portDates, bs, be),
      });
    }
  }

  const totals = {
    registrations: buckets.reduce((s, b) => s + b.registrations, 0),
    project_submissions: buckets.reduce((s, b) => s + b.project_submissions, 0),
    deal_room_views: buckets.reduce((s, b) => s + b.deal_room_views, 0),
    applications: buckets.reduce((s, b) => s + b.applications, 0),
    portfolio_entries: buckets.reduce((s, b) => s + b.portfolio_entries, 0),
  };

  const response: AnalyticsResponse = { period, buckets, totals };
  return NextResponse.json(response);
}
