# T21 — Управление инвайтами: панель администратора

## Контекст

В T1 реализована авторизация через инвайт-коды (страница `/invite/[code]`).
Однако у администратора нет UI для **создания и управления инвайтами** — коды вводятся вручную в БД.
T21 закрывает этот пробел: полная CRUD-панель инвайтов + API.

## Что нужно создать

### 1. Миграция — `supabase/migrations/010_invites.sql`

```sql
CREATE TABLE IF NOT EXISTS invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text UNIQUE NOT NULL DEFAULT substr(md5(random()::text), 1, 12),
  role        text NOT NULL CHECK (role IN ('investor','project','admin','moderator','manager')),
  email       text,                      -- если инвайт персональный
  used_by     uuid REFERENCES auth.users(id),
  used_at     timestamptz,
  created_by  uuid REFERENCES auth.users(id) NOT NULL,
  created_at  timestamptz DEFAULT now(),
  expires_at  timestamptz,               -- NULL = бессрочный
  note        text                       -- внутренний комментарий
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- только superadmin/admin видят и управляют инвайтами
CREATE POLICY "admins manage invites"
  ON invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('superadmin', 'admin')
    )
  );
```

### 2. TypeScript типы — `types/index.ts`

Добавить к существующим типам (не удалять ничего):

```typescript
export type InviteRole = 'investor' | 'project' | 'admin' | 'moderator' | 'manager'

export interface Invite {
  id: string
  code: string
  role: InviteRole
  email: string | null
  used_by: string | null
  used_at: string | null
  created_by: string
  created_at: string
  expires_at: string | null
  note: string | null
}

export interface InviteInsert {
  role: InviteRole
  email?: string
  expires_at?: string
  note?: string
}
```

### 3. API routes

#### `app/api/admin/invites/route.ts`

- **GET** — список всех инвайтов (с пагинацией: `?page=1&limit=20`), отсортированных по `created_at DESC`
  - Возвращает `{ invites: Invite[], total: number }`
  - Только для `superadmin` / `admin`

- **POST** — создать инвайт
  - Body: `InviteInsert`
  - `code` генерируется автоматически через `crypto.randomUUID().slice(0,8)`
  - Записывает `created_by = auth.uid()`
  - Возвращает созданный `Invite`

#### `app/api/admin/invites/[id]/route.ts`

- **DELETE** — удалить инвайт (только если `used_by IS NULL`)
  - Если инвайт уже использован — возвращать `400 { error: "invite already used" }`

### 4. Страница Admin — `app/(admin)/invites/page.tsx`

Серверный компонент (SSR), проверяет роль, рендерит `<InvitesClient />`.

### 5. Клиентский компонент — `app/(admin)/invites/invites-client.tsx`

UI панели управления инвайтами:

**Таблица** (shadcn/ui `Table`) с колонками:
| Код | Роль | Email | Статус | Создан | Истекает | Примечание | Действия |

- Статус: badge `unused` (серый) / `used` (зелёный) / `expired` (красный, если `expires_at < now`)
- Действия: кнопка **Копировать ссылку** (`/invite/[code]`) + кнопка **Удалить** (только для unused)

**Форма создания инвайта** (над таблицей):
- Select: Роль (investor / project / admin / moderator / manager)
- Input: Email (необязательный)
- Input: Дата истечения (необязательная, `type="date"`)
- Input: Примечание (необязательное)
- Кнопка **Создать инвайт**

После создания — обновить список без перезагрузки страницы.

**Пагинация**: кнопки «Назад» / «Вперёд» (по 20 записей).

### 6. Навигация

В `app/(admin)/layout.tsx` (или в файле навигации админки — найди сам) добавить пункт меню **«Инвайты»** → `/invites`.

### 7. Тесты — `__tests__/t21.test.ts`

Покрыть Jest-тестами:

```typescript
// 1. InviteInsert валидация роли
// 2. GET /api/admin/invites возвращает 401 без авторизации
// 3. GET /api/admin/invites возвращает 403 для role=investor
// 4. POST /api/admin/invites создаёт инвайт (мок supabase)
// 5. DELETE /api/admin/invites/[id] — 400 если invite уже использован
// 6. DELETE /api/admin/invites/[id] — 204 если unused
// 7. Инвайт с истёкшей датой имеет статус 'expired'
```

## Ограничения

- NO новых npm-зависимостей
- RLS уже включён в миграции выше — не менять
- Не трогать файлы других модулей кроме указанных
- TypeScript strict, никаких `any`
- Весь UI через shadcn/ui компоненты

## Definition of Done

1. `npm run build` — без ошибок
2. `npm run lint` — без ошибок
3. `npm test` — все тесты проходят
4. Страница `/invites` доступна в admin-навигации
5. Можно создать инвайт → получить ссылку → удалить (если не использован)
6. Записать в `progress.md`: `DONE: T21 + что создано/изменено`
