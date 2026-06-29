-- Аддитивная миграция: добавляем personal_status и updated_at в investor_favorites

ALTER TABLE public.investor_favorites
  ADD COLUMN IF NOT EXISTS personal_status text
    CONSTRAINT investor_favorites_personal_status_check
    CHECK (personal_status IN ('watching', 'interested', 'passed'));

ALTER TABLE public.investor_favorites
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
