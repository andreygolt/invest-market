CREATE TABLE IF NOT EXISTS commercial_terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  success_fee_pct  numeric(5,2) NOT NULL DEFAULT 5.00,
  fixed_fee        numeric(15,2) NOT NULL DEFAULT 0,
  notes            text,
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commercial_terms ADD COLUMN IF NOT EXISTS success_fee_pct numeric(5,2) NOT NULL DEFAULT 5.00;
ALTER TABLE commercial_terms ADD COLUMN IF NOT EXISTS fixed_fee numeric(15,2) NOT NULL DEFAULT 0;
ALTER TABLE commercial_terms ADD COLUMN IF NOT EXISTS notes text;

-- только одна запись на проект
CREATE UNIQUE INDEX IF NOT EXISTS commercial_terms_project_id_idx ON commercial_terms(project_id);

ALTER TABLE commercial_terms ENABLE ROW LEVEL SECURITY;

-- суперадмин и админ — полный доступ
CREATE POLICY "admin_all" ON commercial_terms
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('superadmin', 'admin')
    )
  );

-- проект-владелец — только чтение своих условий
CREATE POLICY "project_select" ON commercial_terms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = commercial_terms.project_id
        AND projects.owner_id = auth.uid()
    )
  );
