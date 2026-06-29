# ТЗ T1 — Supabase клиент, схема БД 16 таблиц, авторизация по invite-коду

**Дата:** 2026-06-27
**Зависимости:** нет (T0 = базовый Next.js проект уже создан)
**Размер:** L

---

## ВАЖНО: что уже сделано (не трогать)

- Next.js 16 + TypeScript + App Router: `invest_market/`
- `package.json` с зависимостями: `next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`
- `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- `tailwind.config.ts`, `tsconfig.json`, `eslint.config.mjs`
- `node_modules/` — НЕ запускай npm install (зависимости уже установлены)

---

## Зачем это нужно

Закрытый инвест-маркет. Вход только по инвайт-коду.
Роли: superadmin, admin, moderator, manager, investor, project.
Все данные в Supabase PostgreSQL с Row Level Security.

---

## Что НЕ делаем в этом этапе

- Не создавать UI дашборды
- Не реализовывать бизнес-логику (AI, сделки, портфели)
- НЕ запускать npx create-next-app — проект уже создан
- НЕ запускать npm install — зависимости установлены

---

## Шаг 1 — Типы TypeScript

Создать файл `types/index.ts`:

```typescript
export type UserRole = 'superadmin' | 'admin' | 'moderator' | 'manager' | 'investor' | 'project';
export type ProjectStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'closed';
export type ApplicationStatus = 'pending' | 'reviewing' | 'approved' | 'rejected' | 'withdrawn';
export type DocumentType = 'pitch_deck' | 'financial_model' | 'legal' | 'team' | 'other';

export interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  invited_by: string | null;
  created_at: string;
  updated_at: string;
}
export type UserInsert = Omit<UserRow, 'id' | 'created_at' | 'updated_at'>;

export interface InviteRow {
  id: string;
  code: string;
  role: UserRole;
  email: string | null;
  created_by: string;
  used_by: string | null;
  used_at: string | null;
  expires_at: string | null;
  created_at: string;
}
export type InviteInsert = Omit<InviteRow, 'id' | 'created_at'>;

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  status: ProjectStatus;
  moderated_by: string | null;
  moderated_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}
export type ProjectInsert = Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>;

export interface DocumentRow {
  id: string;
  project_id: string;
  type: DocumentType;
  name: string;
  storage_path: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
}
export type DocumentInsert = Omit<DocumentRow, 'id' | 'created_at'>;

export interface ApplicationRow {
  id: string;
  investor_id: string;
  project_id: string;
  amount: number | null;
  status: ApplicationStatus;
  message: string | null;
  created_at: string;
  updated_at: string;
}
export type ApplicationInsert = Omit<ApplicationRow, 'id' | 'created_at' | 'updated_at'>;
```

---

## Шаг 2 — Supabase клиенты

Создать `lib/supabase/client.ts`:
```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

Создать `lib/supabase/server.ts`:
```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {}
        },
      },
    }
  );
}
```

Создать `lib/supabase/admin.ts`:
```typescript
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
```

---

## Шаг 3 — SQL миграция

Создать `supabase/migrations/001_initial_schema.sql` — полная схема с 16 таблицами и RLS.

Основные таблицы: users, invites, projects, project_questionnaire, documents, project_videos, ai_reports, commercial_terms, investor_favorites, applications, portfolio, referral_accruals, project_updates, notifications, admin_action_log, document_download_log.

Каждая таблица: ALTER TABLE ... ENABLE ROW LEVEL SECURITY + соответствующие POLICY.

---

## Шаг 4 — Middleware

Создать `middleware.ts` в корне:
```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic = ['/login', '/invite'].some(p => pathname.startsWith(p));
  if (!user && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/health).*)'],
};
```

---

## Шаг 5 — Страница входа

Создать `app/(auth)/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow">
        <h1 className="text-2xl font-semibold mb-6">Вход</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Пароль</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="w-full border rounded px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-black text-white py-2 rounded text-sm font-medium disabled:opacity-50">
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </main>
  );
}
```

---

## Шаг 6 — Страница регистрации по инвайту

Создать `app/(auth)/invite/[code]/page.tsx` — клиентский компонент:
- Загружает инвайт по коду из URL params
- Показывает форму: имя, email (pre-filled если есть), пароль
- При submit: `supabase.auth.signUp` → вставить в `users` с ролью из инвайта → пометить инвайт как использованный → redirect /dashboard

---

## Шаг 7 — .env.local

Создать `invest_market/.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder_anon_key
SUPABASE_SERVICE_ROLE_KEY=placeholder_service_role_key
```

---

## Шаг 8 — API route проверки инвайта

Создать `app/api/invite/check/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });
  const supabase = await createClient();
  const { data } = await supabase.from('invites').select('role,email,used_by,expires_at').eq('code', code).single();
  if (!data) return NextResponse.json({ valid: false }, { status: 404 });
  if (data.used_by) return NextResponse.json({ valid: false, reason: 'used' });
  if (data.expires_at && new Date(data.expires_at) < new Date())
    return NextResponse.json({ valid: false, reason: 'expired' });
  return NextResponse.json({ valid: true, role: data.role, email: data.email });
}
```

---

## Шаг 9 — Placeholder dashboard

Создать `app/dashboard/page.tsx`:
```tsx
export default function DashboardPage() {
  return <div className="p-8"><h1 className="text-2xl font-semibold">Dashboard</h1></div>;
}
```

---

## Шаг 10 — Тесты

Создать `jest.config.ts`:
```typescript
import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
export default config;
```

Добавить в `package.json` → scripts: `"test": "jest"`.

Установить Jest: `/usr/local/bin/npm install --save-dev jest @types/jest ts-jest`

Создать `__tests__/t1.test.ts`:
```typescript
import type { UserRole, ProjectStatus } from '@/types';

describe('T1 types', () => {
  it('UserRole contains all 6 roles', () => {
    const roles: UserRole[] = ['superadmin', 'admin', 'moderator', 'manager', 'investor', 'project'];
    expect(roles).toHaveLength(6);
  });
  it('ProjectStatus contains approved', () => {
    const s: ProjectStatus = 'approved';
    expect(s).toBe('approved');
  });
});
```

---

## Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

Если команда не найдена — используй полный путь `/usr/local/bin/npm`.

---

## Критерии готовности

1. `types/index.ts` — TypeScript типы созданы
2. `lib/supabase/client.ts`, `server.ts`, `admin.ts` — созданы
3. `supabase/migrations/001_initial_schema.sql` — создан
4. `middleware.ts` — создан
5. `app/(auth)/login/page.tsx` — создана
6. `app/(auth)/invite/[code]/page.tsx` — создана
7. `app/api/invite/check/route.ts` — создан
8. `app/dashboard/page.tsx` — создан
9. `__tests__/t1.test.ts` — создан
10. `.env.local` — создан
11. `npm run build` — без ошибок
12. `npm test` — тесты проходят

---

## Что НЕ трогать

- `app/layout.tsx` — не менять (Google Fonts убраны, не добавлять обратно)
- `node_modules/` — не удалять
- `package.json` основные зависимости — не трогать (только добавить test script и jest devDeps)

---

## Формат отчёта

Добавь `DONE: T1` в самое начало файла `invest_market/progress.md`.
