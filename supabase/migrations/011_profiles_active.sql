ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

    BEGIN
      CREATE POLICY "admins read all profiles"
        ON public.profiles FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('superadmin', 'admin')
          )
        );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;

    BEGIN
      CREATE POLICY "admins update profiles"
        ON public.profiles FOR UPDATE
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.role IN ('superadmin', 'admin')
          )
        );
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
