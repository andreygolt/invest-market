ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
