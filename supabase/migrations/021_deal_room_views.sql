CREATE TABLE IF NOT EXISTS deal_room_views (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewed_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE deal_room_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deal_room_views_insert" ON deal_room_views
  FOR INSERT WITH CHECK (auth.uid() = investor_id);

