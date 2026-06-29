# T111 — Недостающие страницы: Dashboard инвестора, Уведомления, Профиль

## Цель

Навигация инвестора ссылается на `/dashboard`, `/notifications`, `/profile`, но ни одна из этих
страниц не существует (404). API-маршруты для всех трёх уже реализованы — нужно создать UI-страницы.

Затронутые роли: investor (dashboard, notifications, profile), project/manager (profile).

---

## Контекст

- `app/api/investor/dashboard/route.ts` — GET, возвращает `InvestorDashboard`
- `app/api/notifications/route.ts` — GET, возвращает `NotificationsResponse`
- `app/api/notifications/read-all/route.ts` — POST, отмечает все прочитанными
- `app/api/notifications/[id]/route.ts` — PATCH, отмечает одно уведомление прочитанным
- `app/api/profile/route.ts` — GET + PATCH, возвращает/обновляет `UserProfile`
- Типы: `InvestorDashboard`, `NotificationRow`, `NotificationsResponse`, `UserProfile`, `ProfileUpdate` — в `types/index.ts`
- Investor layout: `app/(investor)/layout.tsx` — уже содержит header с навигацией
- Slate-тема: `bg-slate-50`, `border-slate-200`, `text-slate-900/600/500`, `bg-white`

---

## Шаг 1 — Dashboard инвестора: `app/(investor)/dashboard/page.tsx`

Серверный компонент. Загружает данные с `/api/investor/dashboard` через `fetch` с сервера.

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { InvestorDashboard } from '@/types';

async function getDashboard(): Promise<InvestorDashboard | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const [portfolioResult, applicationsResult, favoritesResult, recentDealsResult] =
    await Promise.all([
      supabase.from('investor_portfolio').select('amount_invested, deal_status').eq('investor_id', user.id),
      supabase.from('applications').select('status').eq('investor_id', user.id),
      supabase.from('investor_favorites').select('id').eq('investor_id', user.id),
      supabase.from('v_investor_catalog').select('id, name, industry, investment_stage, min_investment').order('created_at', { ascending: false }).limit(5),
    ]);

  const portfolioRows = portfolioResult.data ?? [];
  const appRows = applicationsResult.data ?? [];

  const portfolio = portfolioRows.reduce(
    (s, r) => {
      const amt = (r.amount_invested as number | null) ?? 0;
      const st = r.deal_status as string | null;
      if (st === 'confirmed' || st === 'active') { s.total_invested += amt; s.active_count += 1; }
      else if (st === 'exited') { s.total_invested += amt; s.exited_count += 1; }
      else if (st === 'defaulted' || st === 'written_off') { s.defaulted_count += 1; }
      return s;
    },
    { total_invested: 0, active_count: 0, exited_count: 0, defaulted_count: 0 }
  );

  const applications = appRows.reduce(
    (s, r) => {
      s.total += 1;
      const st = r.status as string | null;
      if (st === 'submitted' || st === 'reviewing' || st === 'pending') s.pending += 1;
      else if (st === 'approved') s.approved += 1;
      else if (st === 'rejected') s.rejected += 1;
      return s;
    },
    { total: 0, pending: 0, approved: 0, rejected: 0 }
  );

  return {
    portfolio,
    applications,
    favorites_count: (favoritesResult.data ?? []).length,
    recent_deals: (recentDealsResult.data ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      industry: d.industry as string | null,
      investment_stage: d.investment_stage as string | null,
      min_investment: d.min_investment as number | null,
    })),
  };
}

export default async function InvestorDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const dashboard = await getDashboard();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">Главная</h1>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Инвестировано</div>
          <div className="text-xl font-semibold text-slate-900">
            {dashboard ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(dashboard.portfolio.total_invested) : '—'}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Активных сделок</div>
          <div className="text-xl font-semibold text-slate-900">{dashboard?.portfolio.active_count ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Заявок</div>
          <div className="text-xl font-semibold text-slate-900">{dashboard?.applications.total ?? 0}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-500 mb-1">Избранное</div>
          <div className="text-xl font-semibold text-slate-900">{dashboard?.favorites_count ?? 0}</div>
        </div>
      </div>

      {/* Последние сделки */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-slate-900">Новые проекты</h2>
          <Link href="/catalog" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Весь каталог →
          </Link>
        </div>
        {dashboard && dashboard.recent_deals.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {dashboard.recent_deals.map((deal) => (
              <Link
                key={deal.id}
                href={`/deals/${deal.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{deal.name}</div>
                  <div className="text-xs text-slate-500">{deal.industry ?? '—'} · {deal.investment_stage ?? '—'}</div>
                </div>
                {deal.min_investment && (
                  <div className="text-sm text-slate-600 shrink-0">
                    от {new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(deal.min_investment)}
                  </div>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Проектов пока нет</p>
        )}
      </div>

      <p className="mt-6 text-xs text-slate-400">
        Доходность не гарантирована. Инвестирование сопряжено с риском потери капитала.
        Платформа не принимает денежные средства и не является брокером.
      </p>
    </div>
  );
}
```

---

## Шаг 2 — Уведомления: `app/(investor)/notifications/page.tsx`

Серверный компонент — загружает первые 20 уведомлений.
Кнопка «Отметить все прочитанными» — клиентская (отдельный client-компонент).

### `app/(investor)/notifications/mark-all-read.tsx`

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch('/api/notifications/read-all', { method: 'POST' });
    router.refresh();
    setLoading(false);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleClick} disabled={loading}>
      {loading ? 'Обновление...' : 'Отметить все прочитанными'}
    </Button>
  );
}
```

### `app/(investor)/notifications/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { NotificationRow } from '@/types';
import { MarkAllReadButton } from './mark-all-read';

export default async function NotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('notifications')
    .select('id, user_id, type, title, body, link, is_read, created_at')
    .eq('user_id', user.id)
    .order('is_read', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(50);

  const notifications = (data ?? []) as NotificationRow[];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Уведомления</h1>
          {unreadCount > 0 && (
            <p className="text-sm text-slate-500 mt-0.5">{unreadCount} непрочитанных</p>
          )}
        </div>
        {unreadCount > 0 && <MarkAllReadButton />}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-slate-500">Уведомлений нет</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`p-4 ${n.is_read ? '' : 'bg-slate-50'}`}
            >
              <div className="flex items-start gap-3">
                {!n.is_read && (
                  <span className="mt-1.5 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                )}
                <div className={n.is_read ? 'pl-5' : ''}>
                  <div className="text-sm font-medium text-slate-900">{n.title}</div>
                  <div className="text-sm text-slate-600 mt-0.5">{n.body}</div>
                  {n.link && (
                    <Link
                      href={n.link}
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      Перейти →
                    </Link>
                  )}
                  <div className="text-xs text-slate-400 mt-1">
                    {new Date(n.created_at).toLocaleString('ru-RU')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Шаг 3 — Профиль: `app/profile/page.tsx`

Доступен для всех ролей (investor, project, manager). Без route-группы —
отдельная страница с минимальным header.

### `app/profile/profile-client.tsx`

Клиентский компонент: форма редактирования имени.

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { UserProfile } from '@/types';

interface ProfileClientProps {
  profile: UserProfile;
}

const ROLE_LABELS: Record<string, string> = {
  investor: 'Инвестор',
  project: 'Проект',
  manager: 'Менеджер',
  admin: 'Администратор',
  superadmin: 'Суперадмин',
  moderator: 'Модератор',
};

export function ProfileClient({ profile }: ProfileClientProps) {
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
    } else {
      const json = (await res.json()) as { error?: string };
      setError(json.error ?? 'Ошибка сохранения');
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <Label htmlFor="email" className="text-slate-700">Email</Label>
        <Input id="email" value={profile.email} disabled className="mt-1 bg-slate-50 text-slate-500" />
      </div>
      <div>
        <Label htmlFor="role" className="text-slate-700">Роль</Label>
        <Input id="role" value={ROLE_LABELS[profile.role] ?? profile.role} disabled className="mt-1 bg-slate-50 text-slate-500" />
      </div>
      <div>
        <Label htmlFor="full_name" className="text-slate-700">Имя</Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={100}
          className="mt-1"
          placeholder="Ваше имя"
        />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && <p className="text-sm text-emerald-600">Сохранено</p>}

      <Button type="submit" disabled={saving || fullName.trim().length === 0}>
        {saving ? 'Сохранение...' : 'Сохранить'}
      </Button>
    </form>
  );
}
```

### `app/profile/page.tsx`

```tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { UserProfile } from '@/types';
import { ProfileClient } from './profile-client';

const BACK_LINKS: Record<string, string> = {
  investor: '/dashboard',
  project: '/project',
  manager: '/manager/dashboard',
  admin: '/admin/dashboard',
  superadmin: '/admin/dashboard',
  moderator: '/admin/dashboard',
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await supabase
    .from('profiles')
    .select('id, role, full_name, is_active, created_at')
    .eq('id', user.id)
    .single();

  if (!data) redirect('/login');

  const profile: UserProfile = {
    ...(data as Omit<UserProfile, 'email'>),
    email: user.email ?? '',
  };

  const backHref = BACK_LINKS[profile.role] ?? '/dashboard';

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <Link href={backHref} className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            ← Назад
          </Link>
          <span className="font-semibold text-slate-900">Профиль</span>
        </div>
      </header>
      <main className="container mx-auto px-4 py-8 max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Настройки профиля</h1>
          <ProfileClient profile={profile} />
        </div>
      </main>
    </div>
  );
}
```

---

## Ограничения

- НЕ трогать `app/api/**` — API уже реализованы
- НЕ трогать `types/index.ts` — все типы уже есть
- НЕ трогать `middleware.ts` — `/profile` не требует исключений (не API)
- НЕ трогать `app/(investor)/layout.tsx`
- NO новых npm-зависимостей
- TypeScript strict — никаких `any`

---

## Файлы для создания

| Файл | Описание |
|------|----------|
| `app/(investor)/dashboard/page.tsx` | Dashboard инвестора |
| `app/(investor)/notifications/page.tsx` | Список уведомлений |
| `app/(investor)/notifications/mark-all-read.tsx` | Кнопка «Отметить все» |
| `app/profile/page.tsx` | Страница профиля |
| `app/profile/profile-client.tsx` | Форма редактирования профиля |

**Новых тестовых файлов: 0** (страницы без бизнес-логики, API протестированы)

---

## Команды проверки

```bash
cd invest_market
npm run build
npm run lint
npm test
```

---

## Критерии готовности

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. Страница `/dashboard` рендерится для роли `investor` — отображает статистику
4. Страница `/notifications` показывает список уведомлений с кнопкой «Отметить все»
5. Страница `/profile` доступна всем ролям, позволяет редактировать имя
6. Дисклеймер присутствует на `/dashboard`
7. Записать в progress.md: `DONE: T111` + что создано

---

## Формат отчёта

```
DONE: T111
- создан app/(investor)/dashboard/page.tsx (инвест. dashboard: портфель, заявки, новые проекты)
- создан app/(investor)/notifications/page.tsx + mark-all-read.tsx
- создан app/profile/page.tsx + profile-client.tsx (редактирование имени для всех ролей)
```
