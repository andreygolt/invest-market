-- Таблица документов проекта
CREATE TABLE IF NOT EXISTS project_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_type      text NOT NULL,
  storage_path  text NOT NULL,
  filename      text NOT NULL,
  uploaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_documents_project_id_idx ON project_documents(project_id);

-- RLS
ALTER TABLE project_documents ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит свои документы
CREATE POLICY "project_owner_select_docs" ON project_documents
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Владелец проекта добавляет документы
CREATE POLICY "project_owner_insert_docs" ON project_documents
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Владелец проекта удаляет свои документы
CREATE POLICY "project_owner_delete_docs" ON project_documents
  FOR DELETE
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Модераторы и администраторы видят все документы
CREATE POLICY "admin_select_docs" ON project_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );
