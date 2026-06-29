-- Портфель инвестора: фиксация факта инвестиции вне платформы

CREATE TABLE IF NOT EXISTS investor_portfolio (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id   uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  amount_invested numeric   NOT NULL CHECK (amount_invested > 0),
  date_invested date        NOT NULL,
  instrument    text        NOT NULL DEFAULT 'equity'
                              CHECK (instrument IN ('equity', 'convertible_note', 'safe', 'debt', 'other')),
  deal_status   text        NOT NULL DEFAULT 'active'
                              CHECK (deal_status IN ('active', 'exited', 'written_off')),
  notes         text,
  exit_amount   numeric     CHECK (exit_amount > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE investor_portfolio ENABLE ROW LEVEL SECURITY;

-- Инвестор видит только свои записи
CREATE POLICY "portfolio_investor_self" ON investor_portfolio
  FOR ALL USING (investor_id = auth.uid());

-- Администраторы видят все
CREATE POLICY "portfolio_admin" ON investor_portfolio
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
