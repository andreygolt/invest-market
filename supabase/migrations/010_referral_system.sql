-- Таблица реферальных кодов пользователей
CREATE TABLE IF NOT EXISTS referral_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code         text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS referral_codes_user_id_idx ON referral_codes(user_id);

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

-- Пользователь видит только свой код
CREATE POLICY "owner_select" ON referral_codes
  FOR SELECT USING (user_id = auth.uid());

-- Создать себе код (один)
CREATE POLICY "owner_insert" ON referral_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Суперадмин/админ — полный доступ
CREATE POLICY "admin_all" ON referral_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
        AND users.role IN ('superadmin', 'admin')
    )
  );

-- Таблица реферальных связей
CREATE TABLE IF NOT EXISTS referral_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level           smallint NOT NULL CHECK (level IN (1, 2, 3)),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referee_id)
);

ALTER TABLE referral_links ENABLE ROW LEVEL SECURITY;

-- Реферер видит своих рефералов
CREATE POLICY "referrer_select" ON referral_links
  FOR SELECT USING (referrer_id = auth.uid());

-- Система вставляет (через admin client)
CREATE POLICY "admin_all" ON referral_links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
        AND users.role IN ('superadmin', 'admin')
    )
  );

-- Таблица реферальных вознаграждений
CREATE TABLE IF NOT EXISTS referral_rewards (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES investor_portfolio(id) ON DELETE SET NULL,
  level           smallint NOT NULL CHECK (level IN (1, 2, 3)),
  amount          numeric(15,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Реферер видит свои вознаграждения
CREATE POLICY "referrer_select" ON referral_rewards
  FOR SELECT USING (referrer_id = auth.uid());

-- Суперадмин/админ — полный доступ
CREATE POLICY "admin_all" ON referral_rewards
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid()
        AND users.role IN ('superadmin', 'admin')
    )
  );
