-- Добавить поле статуса и видео в таблицу projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS video_path text;

-- Индекс по статусу для будущих выборок
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects(status);

-- Таблица лога смены статусов
CREATE TABLE IF NOT EXISTS project_status_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id),
  changed_at  timestamptz NOT NULL DEFAULT now(),
  comment     text
);

CREATE INDEX IF NOT EXISTS project_status_log_project_idx ON project_status_log(project_id);

-- RLS для project_status_log
ALTER TABLE project_status_log ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит лог своего проекта
CREATE POLICY "project_owner_select_log" ON project_status_log
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Администраторы и модераторы видят все логи
CREATE POLICY "admin_select_log" ON project_status_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Только сервисный роль пишет в лог (через admin client)
CREATE POLICY "service_insert_log" ON project_status_log
  FOR INSERT
  WITH CHECK (true);
