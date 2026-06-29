# T22 — Панель администратора: управление пользователями

## Контекст

Платформа имеет роли: `superadmin`, `admin`, `moderator`, `manager`, `investor`, `project`.
Инвайты созданы в T21. Однако у администратора нет UI для **просмотра и управления
зарегистрированными пользователями** — нельзя сменить роль, деактивировать аккаунт
или найти конкретного пользователя.

T22 закрывает этот пробел: страница управления пользователями в admin-панели.

## Что нужно создать

### 1. Миграция — `supabase/migrations/011_profiles_active.sql`

Добавить поле `is_active` в таблицу `profiles` (если не существует):

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Политика: admin/superadmin могут читать все профили и обновлять is_active/role
CREATE POLICY IF NOT EXISTS "admins read all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );

CREATE POLICY IF NOT EXISTS "admins update profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('superadmin', 'admin')
    )
  );
```

> Примечание: если политики с такими именами уже существуют — миграция должна
> использовать `IF NOT EXISTS` или `DO $$ BEGIN ... EXCEPTION WHEN ... END $$`.

### 2. TypeScript типы — `types/index.ts`

Добавить к существующим типам (не удалять ничего):

```typescript
export type UserRole = 'superadmin' | 'admin' | 'moderator' | 'manager' | 'investor' | 'project'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  full_name: string | null
  is_active: boolean
  created_at: string
}

export interface UserProfileUpdate {
  role?: UserRole
  is_active?: boolean
}
```

### 3. API routes

#### `app/api/admin/users/route.ts`

- **GET** — список пользователей с пагинацией и поиском
  - Query params: `?page=1&limit=20&search=email_or_name&role=investor`
  - Только для `superadmin` / `admin`
  - Возвращает `{ users: UserProfile[], total: number }`
  - JOIN с `auth.users` для получения email (через Supabase admin client)

  ```typescript
  // Использовать lib/supabase/admin.ts для доступа к auth.users
  // SELECT profiles.*, auth.users.email FROM profiles
  //   JOIN auth.users ON auth.users.id = profiles.id
  //   WHERE (search по email/full_name) AND (role = ?)
  //   ORDER BY created_at DESC LIMIT ? OFFSET ?
  ```

- **Не нужен POST** — пользователи создаются через инвайты (T21).

#### `app/api/admin/users/[id]/route.ts`

- **GET** — получить одного пользователя по id
  - Только для `superadmin` / `admin`
  - Возвращает `UserProfile`

- **PATCH** — обновить роль и/или статус активности
  - Body: `UserProfileUpdate`
  - Валидация: нельзя изменить собственный аккаунт (`id === auth.uid()` → 400)
  - Нельзя назначить роль `superadmin` если текущий пользователь не `superadmin`
  - Возвращает обновлённый `UserProfile`

- **Нет DELETE** — деактивация через `is_active = false`

### 4. Страница Admin — `app/(admin)/users/page.tsx`

Серверный компонент, проверяет роль (`superadmin` / `admin`), рендерит `<UsersClient />`.

### 5. Клиентский компонент — `app/(admin)/users/users-client.tsx`

**Фильтры** (над таблицей):
- Input: поиск по email / имени (debounce 300ms через `useCallback`)
- Select: фильтр по роли (все / investor / project / admin / moderator / manager)

**Таблица** (shadcn/ui `Table`) с колонками:
| Email | Имя | Роль | Статус | Создан | Действия |

- Статус: badge `active` (зелёный) / `inactive` (красный)
- Действия:
  - Select для смены роли (inline, применяется кнопкой «Сохранить»)
  - Кнопка «Деактивировать» / «Активировать» (toggle `is_active`)
  - Кнопки отключены для собственного аккаунта администратора

**Пагинация**: кнопки «Назад» / «Вперёд» (по 20 записей).

После изменения роли или статуса — обновить список без перезагрузки страницы.

### 6. Навигация

В файле навигации admin-панели (найди по существующим пунктам меню) добавить
пункт **«Пользователи»** → `/users`.

### 7. Тесты — `__tests__/t22.test.ts`

```typescript
// 1. GET /api/admin/users возвращает 401 без авторизации
// 2. GET /api/admin/users возвращает 403 для role=investor
// 3. GET /api/admin/users возвращает список с total (мок supabase)
// 4. GET /api/admin/users?role=investor фильтрует по роли
// 5. PATCH /api/admin/users/[id] — 400 если id === auth.uid() (нельзя изменить себя)
// 6. PATCH /api/admin/users/[id] — 403 если не superadmin пытается назначить роль superadmin
// 7. PATCH /api/admin/users/[id] — обновляет is_active (мок supabase)
// 8. PATCH /api/admin/users/[id] — обновляет role (мок supabase)
// 9. GET /api/admin/users/[id] — возвращает одного пользователя
```

## Ограничения

- NO новых npm-зависимостей
- RLS должен быть включён (уже есть на profiles из T1, миграция только ДОБАВЛЯЕТ поле)
- Не трогать файлы других модулей кроме указанных
- TypeScript strict, никаких `any`
- Весь UI через shadcn/ui компоненты

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t22.test.ts)
4. Страница `/users` доступна в admin-навигации
5. Можно найти пользователя по email, сменить роль, деактивировать
6. Нельзя изменить собственный аккаунт через UI и API
7. Записать в `progress.md`: `DONE: T22 + что создано/изменено`
