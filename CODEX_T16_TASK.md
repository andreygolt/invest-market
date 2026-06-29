# CODEX TASK T16 — Реферальная система (3 линии)

## Цель

Реализовать реферальную систему платформы: пользователи получают персональные реферальные
коды, приглашают других через эти коды, платформа отслеживает 3 уровня рефералов
и начисляет вознаграждения (для отображения — фактические выплаты вне платформы).

## Контекст

После T15 у платформы есть коммерческие условия с проектами. Следующий шаг —
партнёрская/реферальная система. T16 создаёт БД, API и базовую логику 3-уровневой
реферальной сети. T17 создаст полноценный кабинет партнёра.

Существующие таблицы: `users`, `projects`, `investor_portfolio`.
Таблица `invites` уже есть (из T1) — содержит `code`, `used_by`, `invited_by` или аналогичные поля.
Изучи структуру `invites` перед написанием миграции.

## Что создать

### 1. Миграция БД

**Файл:** `supabase/migrations/010_referral_system.sql`

```sql
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
```

**Уровни реферальной сети:**
- Уровень 1: пользователь А пригласил пользователя Б (через реферальный код А)
- Уровень 2: Б пригласил В → А получает вознаграждение 2-го уровня за В
- Уровень 3: В пригласил Г → А получает вознаграждение 3-го уровня за Г

### 2. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец:

```typescript
export type ReferralRewardStatus = 'pending' | 'approved' | 'paid';

export interface ReferralCodeRow {
  id: string;
  user_id: string;
  code: string;
  created_at: string;
}

export interface ReferralLinkRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  level: 1 | 2 | 3;
  created_at: string;
}

export interface ReferralRewardRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  portfolio_id: string | null;
  level: 1 | 2 | 3;
  amount: number;
  status: ReferralRewardStatus;
  created_at: string;
  updated_at: string;
}

export interface ReferralStats {
  code: string | null;
  total_referrals: number;       // сумма по уровням 1+2+3
  level1_count: number;
  level2_count: number;
  level3_count: number;
  rewards_pending: number;       // сумма в ₽
  rewards_approved: number;
  rewards_paid: number;
}
```

### 3. Утилита генерации реферального кода

**Файл:** `lib/referral/code.ts`

```typescript
// Генерирует уникальный 8-символьный код (буквы + цифры, uppercase)
export function generateReferralCode(userId: string): string {
  // Используй crypto.randomBytes или Math.random — без новых зависимостей
  // Формат: XXXX-XXXX (8 символов + дефис для читаемости)
}
```

**Файл:** `lib/referral/links.ts`

```typescript
// Строит реферальные связи 2-го и 3-го уровня при регистрации нового пользователя
// refereeId — новый пользователь
// directReferrerId — пользователь, чей код использовался
// Вставляет записи в referral_links для всех уровней (1, 2, 3)
export async function buildReferralLinks(
  supabaseAdmin: SupabaseClient,
  refereeId: string,
  directReferrerId: string
): Promise<void>
```

Логика:
1. Вставить link (referrer=directReferrerId, referee=refereeId, level=1)
2. Найти, кто пригласил directReferrerId (level=1 где referee=directReferrerId) → если есть → вставить level=2
3. Найти, кто пригласил того человека → если есть → вставить level=3

Использовать `lib/supabase/admin.ts` (admin client).

### 4. API: управление реферальным кодом пользователя

**Файл:** `app/api/referral/code/route.ts`

- **GET** — получить реферальный код текущего пользователя:
  - Если код существует — вернуть `{ code: string }`
  - Если не существует — автоматически создать, вставить в БД, вернуть `{ code: string }`
  - 401 если не авторизован

- **Response:**
```typescript
{ code: string; invite_link: string } // invite_link = /invite/[code]
```

### 5. API: статистика рефералов

**Файл:** `app/api/referral/stats/route.ts`

- **GET** — статистика для текущего авторизованного пользователя:
  - Возвращает `ReferralStats`
  - Считает `total_referrals`, разбивку по уровням из `referral_links`
  - Считает суммы вознаграждений по статусам из `referral_rewards`
  - 401 если не авторизован

### 6. API: список рефералов (пагинация)

**Файл:** `app/api/referral/list/route.ts`

- **GET** — список рефералов с уровнем:
  - Query params: `level` (1|2|3|all, default all), `limit` (default 20), `offset` (default 0)
  - Join с `users` для получения email (только домен для приватности: `user@mail.com` → `u***@mail.com`)
  - Возвращает:
```typescript
{
  items: Array<{
    referee_id: string;
    masked_email: string;
    level: 1 | 2 | 3;
    joined_at: string;
  }>;
  total: number;
}
```

### 7. Интеграция с invite flow

**Файл:** `app/api/invite/[code]/route.ts` (или аналогичный invite endpoint из T1)

Изучи существующий invite flow. При успешной регистрации через invite-код:
- Если invite-код совпадает с `referral_codes.code` — вызвать `buildReferralLinks(adminClient, newUserId, codeOwnerUserId)`
- Добавь эту логику только если она не нарушает существующий код

Если в T1 invite-коды и реферальные коды разные сущности — добавь отдельную проверку:
```typescript
// После регистрации пользователя
const { data: refCode } = await supabaseAdmin
  .from('referral_codes')
  .select('user_id')
  .eq('code', usedCode)
  .single();

if (refCode) {
  await buildReferralLinks(supabaseAdmin, newUserId, refCode.user_id);
}
```

### 8. Admin API: вознаграждения

**Файл:** `app/api/admin/referral-rewards/route.ts`

- **GET** — список всех вознаграждений с фильтром `status` (query param):
```typescript
{
  items: Array<ReferralRewardRow & { referrer_email: string; referee_email: string }>;
  total: number;
}
```
Требует роль `admin` или `superadmin`.

- **PATCH** `app/api/admin/referral-rewards/[id]/route.ts` — изменить статус:
```typescript
// Body: { status: 'approved' | 'paid' }
```

### 9. Тесты

**Файл:** `__tests__/t16.test.ts`

Тесты (мок Supabase как в предыдущих тестах):

1. `generateReferralCode()` — возвращает строку длиной >= 8, содержащую только допустимые символы
2. `GET /api/referral/code` — 401 без авторизации
3. `GET /api/referral/code` — 200 возвращает `{ code, invite_link }` для авторизованного пользователя (mock: код уже существует)
4. `GET /api/referral/stats` — 401 без авторизации
5. `GET /api/referral/stats` — 200 возвращает `ReferralStats` с нулевыми значениями если рефералов нет
6. `GET /api/referral/list` — 401 без авторизации
7. `GET /api/admin/referral-rewards` — 403 для роли investor
8. Тип `ReferralStats` — проверка наличия полей `level1_count`, `level2_count`, `level3_count`

Паттерн мока: `jest.mock('@/lib/supabase/server', ...)` как в t13.test.ts–t15.test.ts.

## Что НЕ делать

- Не трогать существующие страницы и API других модулей (кроме интеграции с invite)
- Не добавлять новые npm-зависимости
- Не создавать кабинет партнёра (это T17)
- Не реализовывать автоматическое начисление выплат — только отображение
- Не изменять существующие таблицы (только новые таблицы)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t16.test.ts)
4. Пользователь может получить свой реферальный код через `GET /api/referral/code`
5. 3-уровневые связи строятся корректно через `buildReferralLinks`
6. Статистика возвращается через `GET /api/referral/stats`
7. RLS настроен: каждый видит только своих рефералов и свои вознаграждения
8. Запись в `progress.md`: `DONE: T16 + список созданных файлов`
