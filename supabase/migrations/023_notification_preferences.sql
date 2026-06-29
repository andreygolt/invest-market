CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_manage_own_prefs" ON notification_preferences
  FOR ALL USING (auth.uid() = user_id);
