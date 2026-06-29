create extension if not exists "pgcrypto";

create type public.user_role as enum ('superadmin', 'admin', 'moderator', 'manager', 'investor', 'project');
create type public.project_status as enum ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'closed');
create type public.application_status as enum ('pending', 'reviewing', 'approved', 'rejected', 'withdrawn');
create type public.document_type as enum ('pitch_deck', 'financial_model', 'legal', 'team', 'other');

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('superadmin', 'admin'), false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() in ('superadmin', 'admin', 'moderator', 'manager'), false)
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.user_role not null,
  invited_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  role public.user_role not null,
  email text,
  created_by uuid not null references public.users(id) on delete restrict,
  used_by uuid references public.users(id) on delete set null,
  used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  status public.project_status not null default 'draft',
  moderated_by uuid references public.users(id) on delete set null,
  moderated_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_questionnaire (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  section text not null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, section)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  type public.document_type not null,
  name text not null,
  storage_path text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.project_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  duration_seconds integer,
  uploaded_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.ai_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  report jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.commercial_terms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  terms jsonb not null default '{}'::jsonb,
  success_fee_percent numeric(6, 3),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investor_favorites (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  unique (investor_id, project_id)
);

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  amount numeric(18, 2),
  status public.application_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portfolio (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  invested_amount numeric(18, 2) not null,
  invested_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.referral_accruals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id) on delete cascade,
  referred_id uuid not null references public.users(id) on delete cascade,
  application_id uuid references public.applications(id) on delete set null,
  level integer not null check (level between 1 and 3),
  amount numeric(18, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  body text not null,
  published_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.users(id) on delete restrict,
  action text not null,
  target_table text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.document_download_log (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;
alter table public.invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_questionnaire enable row level security;
alter table public.documents enable row level security;
alter table public.project_videos enable row level security;
alter table public.ai_reports enable row level security;
alter table public.commercial_terms enable row level security;
alter table public.investor_favorites enable row level security;
alter table public.applications enable row level security;
alter table public.portfolio enable row level security;
alter table public.referral_accruals enable row level security;
alter table public.project_updates enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_action_log enable row level security;
alter table public.document_download_log enable row level security;

create policy "users read own or staff" on public.users
  for select using (id = auth.uid() or public.is_staff());
create policy "users insert own" on public.users
  for insert with check (id = auth.uid());
create policy "users update own or admin" on public.users
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy "invites read public valid code" on public.invites
  for select using (used_by is null and (expires_at is null or expires_at > now()) or public.is_staff());
create policy "invites manage admin" on public.invites
  for all using (public.is_admin()) with check (public.is_admin());
create policy "invites mark own used" on public.invites
  for update using (used_by is null) with check (used_by = auth.uid());

create policy "projects read approved or owner or staff" on public.projects
  for select using (status = 'approved' or owner_id = auth.uid() or public.is_staff());
create policy "projects insert owner" on public.projects
  for insert with check (owner_id = auth.uid() or public.is_staff());
create policy "projects update owner draft or staff" on public.projects
  for update using (owner_id = auth.uid() or public.is_staff())
  with check (owner_id = auth.uid() or public.is_staff());

create policy "questionnaire read project access" on public.project_questionnaire
  for select using (
    public.is_staff() or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.status = 'approved')
    )
  );
create policy "questionnaire manage project owner or staff" on public.project_questionnaire
  for all using (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  ) with check (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "documents read project access" on public.documents
  for select using (
    public.is_staff() or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.status = 'approved')
    )
  );
create policy "documents manage project owner or staff" on public.documents
  for all using (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  ) with check (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "videos read project access" on public.project_videos
  for select using (
    public.is_staff() or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.status = 'approved')
    )
  );
create policy "videos manage project owner or staff" on public.project_videos
  for all using (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  ) with check (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "ai reports read owner or staff" on public.ai_reports
  for select using (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );
create policy "ai reports manage staff" on public.ai_reports
  for all using (public.is_staff()) with check (public.is_staff());

create policy "commercial terms read project access" on public.commercial_terms
  for select using (
    public.is_staff() or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.owner_id = auth.uid() or p.status = 'approved')
    )
  );
create policy "commercial terms manage staff" on public.commercial_terms
  for all using (public.is_staff()) with check (public.is_staff());

create policy "favorites owner access" on public.investor_favorites
  for all using (investor_id = auth.uid() or public.is_staff())
  with check (investor_id = auth.uid() or public.is_staff());

create policy "applications read participant or staff" on public.applications
  for select using (
    investor_id = auth.uid() or public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );
create policy "applications insert investor" on public.applications
  for insert with check (investor_id = auth.uid());
create policy "applications update investor or staff" on public.applications
  for update using (investor_id = auth.uid() or public.is_staff())
  with check (investor_id = auth.uid() or public.is_staff());

create policy "portfolio read owner or staff" on public.portfolio
  for select using (investor_id = auth.uid() or public.is_staff());
create policy "portfolio manage staff" on public.portfolio
  for all using (public.is_staff()) with check (public.is_staff());

create policy "referrals read participant or staff" on public.referral_accruals
  for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_staff());
create policy "referrals manage staff" on public.referral_accruals
  for all using (public.is_staff()) with check (public.is_staff());

create policy "updates read project access" on public.project_updates
  for select using (
    published_at is not null or public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );
create policy "updates manage project owner or staff" on public.project_updates
  for all using (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  ) with check (
    public.is_staff() or exists (
      select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()
    )
  );

create policy "notifications owner access" on public.notifications
  for all using (user_id = auth.uid() or public.is_staff())
  with check (user_id = auth.uid() or public.is_staff());

create policy "admin log read staff" on public.admin_action_log
  for select using (public.is_staff());
create policy "admin log insert staff" on public.admin_action_log
  for insert with check (public.is_staff());

create policy "download log read own or staff" on public.document_download_log
  for select using (user_id = auth.uid() or public.is_staff());
create policy "download log insert own" on public.document_download_log
  for insert with check (user_id = auth.uid() or public.is_staff());
