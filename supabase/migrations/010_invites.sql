CREATE TABLE IF NOT EXISTS public.invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 12),
  role        text NOT NULL CHECK (role IN ('investor','project','admin','moderator','manager')),
  email       text,
  used_by     uuid REFERENCES auth.users(id),
  used_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id) NOT NULL,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz,
  note        text
);

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.invites
  ALTER COLUMN code SET DEFAULT substr(md5(random()::text), 1, 12);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage invites"
  ON public.invites FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
