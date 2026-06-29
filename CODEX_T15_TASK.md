# CODEX TASK T15 — Коммерческие условия с проектом, success fee

## Цель

Реализовать модуль коммерческих условий платформы с проектом: администратор устанавливает
success fee и прочие условия для каждого проекта, проект видит свои условия в кабинете.

## Контекст

После T14 инвестор видит dashboard. Платформа монетизируется через success fee —
процент от суммы сделки, которую инвестор фиксирует при инвестировании.
Условия устанавливает администратор для каждого проекта отдельно.

Существующие таблицы: `projects`, `investor_portfolio` (содержит `amount`).

## Что создать

### 1. Миграция БД

**Файл:** `supabase/migrations/009_commercial_terms.sql`

```sql
CREATE TABLE IF NOT EXISTS commercial_terms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  success_fee_pct  numeric(5,2) NOT NULL DEFAULT 5.00,  -- % от суммы сделки
  fixed_fee        numeric(15,2) NOT NULL DEFAULT 0,    -- фиксированная часть в ₽
  notes            text,                                 -- произвольный комментарий
  created_by    uuid NOT NULL REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- только одна запись на проект
CREATE UNIQUE INDEX IF NOT EXISTS commercial_terms_project_id_idx ON commercial_terms(project_id);

ALTER TABLE commercial_terms ENABLE ROW LEVEL SECURITY;

-- суперадмин и админ — полный доступ
CREATE POLICY "admin_all" ON commercial_terms
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('superadmin', 'admin')
    )
  );

-- проект-владелец — только чтение своих условий
CREATE POLICY "project_select" ON commercial_terms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = commercial_terms.project_id
        AND projects.owner_id = auth.uid()
    )
  );
```

### 2. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец:

```typescript
export interface CommercialTermsRow {
  id: string;
  project_id: string;
  success_fee_pct: number;
  fixed_fee: number;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export type CommercialTermsInsert = Omit<CommercialTermsRow, 'id' | 'created_at' | 'updated_at'>;
export type CommercialTermsUpdate = Partial<Pick<CommercialTermsRow, 'success_fee_pct' | 'fixed_fee' | 'notes'>>;

export interface CommercialTermsWithProject extends CommercialTermsRow {
  project_name: string;
}

export interface SuccessFeeSummary {
  terms: CommercialTermsRow | null;
  estimated_fee: number | null; // вычисляется из суммы портфеля если есть
}
```

### 3. Admin API: управление коммерческими условиями

**Файл:** `app/api/admin/commercial-terms/route.ts`

- **GET** — список всех проектов с условиями (join projects + commercial_terms):

```typescript
// Response:
{
  items: Array<{
    project_id: string;
    project_name: string;
    terms: CommercialTermsRow | null; // null если условия ещё не установлены
  }>
}
```

Требует роль `admin` или `superadmin` (проверка через `users` table).

- **POST** — создать или обновить условия для проекта (upsert по `project_id`):

```typescript
// Body:
{
  project_id: string;
  success_fee_pct: number;  // 0–100
  fixed_fee: number;        // >= 0
  notes?: string;
}
```

Валидация: `success_fee_pct` от 0 до 100, `fixed_fee` >= 0.
Возвращает `CommercialTermsRow` или ошибку 400/401/403.

**Файл:** `app/api/admin/commercial-terms/[project_id]/route.ts`

- **GET** — получить условия конкретного проекта:

```typescript
// Response: CommercialTermsRow | { terms: null }
```

- **DELETE** — удалить условия проекта (роль admin/superadmin).

### 4. Project API: просмотр своих условий

**Файл:** `app/api/project/commercial-terms/route.ts`

- **GET** — условия для текущего проекта (проект видит только свои):

```typescript
// Response: SuccessFeeSummary
{
  terms: CommercialTermsRow | null,
  estimated_fee: number | null  // null если terms нет или портфельных данных нет
}
```

`estimated_fee` — вычисляется из суммы всех подтверждённых инвестиций (`investor_portfolio` WHERE `project_id = текущий проект AND status = 'confirmed'`):
```
estimated_fee = SUM(amount) * success_fee_pct / 100 + fixed_fee
```

Если `terms` не установлены — возвращает `{ terms: null, estimated_fee: null }`.

### 5. Страница администратора: коммерческие условия

**Файл:** `app/(admin)/commercial-terms/page.tsx`

Серверный компонент. Список всех проектов (одобренных) с их условиями.

Таблица с колонками:
- Название проекта
- Success fee, %
- Фиксированная часть, ₽
- Заметки
- Действие: кнопка «Редактировать» (открывает форму)

**Файл:** `app/(admin)/commercial-terms/terms-form.tsx`

Клиентский компонент — форма редактирования условий одного проекта:
- Input для `success_fee_pct` (type="number", min=0, max=100, step=0.01)
- Input для `fixed_fee` (type="number", min=0)
- Textarea для `notes`
- Кнопка «Сохранить»

После сохранения — `router.refresh()`.

Используй shadcn/ui: `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Input`, `Textarea`, `Button`, `Card`.

### 6. Страница проекта: мои условия

**Файл:** `app/(project)/commercial-terms/page.tsx`

Серверный компонент. Вызывает `/api/project/commercial-terms`.

Отображает:
- Если `terms === null`: информационный блок «Условия сотрудничества ещё не установлены. Обратитесь к администратору платформы.»
- Если `terms` есть:
  - Карточка с полями: Success fee (%), Фиксированная часть (₽), Заметки
  - Если `estimated_fee` есть: блок «Ориентировочное вознаграждение платформы: X ₽» с дисклеймером «Расчёт носит оценочный характер и основан на зафиксированных инвестициях.»

Используй shadcn/ui: `Card`, `CardContent`, `CardHeader`, `CardTitle`.

### 7. Тесты

**Файл:** `__tests__/t15.test.ts`

Тесты (мок Supabase аналогично предыдущим):

1. `GET /api/admin/commercial-terms` — 401 без авторизации
2. `GET /api/admin/commercial-terms` — 403 для роли investor
3. `POST /api/admin/commercial-terms` — 400 при невалидном `success_fee_pct` (> 100)
4. `POST /api/admin/commercial-terms` — 200 + upsert при корректных данных (mock admin)
5. `GET /api/project/commercial-terms` — 401 без авторизации
6. `GET /api/project/commercial-terms` — 200 возвращает `{ terms: null, estimated_fee: null }` если условий нет
7. Тип `CommercialTermsRow` — проверка наличия полей `success_fee_pct`, `fixed_fee`, `project_id`

Паттерн мока (как в t13.test.ts, t14.test.ts): `jest.mock('@/lib/supabase/server', ...)`.

## Что НЕ делать

- Не трогать существующие API routes или страницы других модулей
- Не добавлять новые npm-зависимости
- Не изменять существующие таблицы (только новая `commercial_terms`)
- Не реализовывать автоматическое выставление счётов — платформа только отображает условия

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t15.test.ts)
4. Администратор может установить/изменить success fee для любого проекта
5. Проект видит свои условия в кабинете с ориентировочным расчётом
6. RLS настроен: проект видит только свои условия, admin видит все
7. Запись в `progress.md`: `DONE: T15 + список созданных файлов`
