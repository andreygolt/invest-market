-- Таблица обновлений проекта
CREATE TABLE IF NOT EXISTS project_updates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  ai_summary    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;

-- Проект видит только свои обновления
CREATE POLICY "project sees own updates"
  ON project_updates FOR ALL
  USING (
    project_id = (
      SELECT id FROM projects WHERE owner_id = auth.uid() LIMIT 1
    )
  );

-- Инвесторы читают обновления только approved проектов
CREATE POLICY "investor reads updates of approved projects"
  ON project_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_updates.project_id
        AND projects.status = 'approved'
    )
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('investor', 'admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Admins full access
CREATE POLICY "admin full access project_updates"
  ON project_updates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );
