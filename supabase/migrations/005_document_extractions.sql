-- Таблица для хранения извлечённого текста из документов
CREATE TABLE IF NOT EXISTS document_extractions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status         text NOT NULL DEFAULT 'pending',
  -- pending | processing | done | error
  extracted_text text,
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_extractions_project_idx ON document_extractions(project_id);
CREATE INDEX IF NOT EXISTS document_extractions_document_idx ON document_extractions(document_id);
CREATE INDEX IF NOT EXISTS document_extractions_status_idx ON document_extractions(status);

ALTER TABLE document_extractions ENABLE ROW LEVEL SECURITY;

-- Владелец проекта видит свои экстракции
CREATE POLICY "project_owner_select_extractions" ON document_extractions
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  );

-- Администраторы и модераторы видят все
CREATE POLICY "admin_select_extractions" ON document_extractions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin', 'moderator', 'manager')
    )
  );

-- Только сервисный клиент пишет (через admin client)
CREATE POLICY "service_all_extractions" ON document_extractions
  FOR ALL
  WITH CHECK (true);
