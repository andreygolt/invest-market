CREATE TABLE IF NOT EXISTS platform_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_settings" ON platform_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'superadmin')
    )
  );

CREATE POLICY "superadmin_write_settings" ON platform_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'superadmin'
    )
  );

INSERT INTO platform_settings (key, value) VALUES
  ('platform_name',        'Invest Market'),
  ('contact_email',        'support@invest-market.ru'),
  ('success_fee_default',  '5'),
  ('min_investment_amount','1000000'),
  ('max_investment_amount','500000000'),
  ('catalog_page_size',    '12')
ON CONFLICT (key) DO NOTHING;
