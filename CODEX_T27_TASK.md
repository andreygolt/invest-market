# T27 — Страница профиля пользователя

## Контекст

Платформа охватывает все роли (superadmin, admin, moderator, manager, investor, project),
но у пользователей любой роли нет возможности просмотреть или обновить своё имя,
а также сменить пароль через UI. Вся работа с аккаунтом происходит вне платформы.

T27 создаёт страницу профиля `/profile`, доступную всем аутентифицированным пользователям
вне зависимости от роли. Страница показывает данные аккаунта и позволяет обновить имя
и пароль через Supabase Auth.

## Что нужно создать / изменить

### 1. API route — `app/api/profile/route.ts`

**GET** — получить текущий профиль пользователя:
- Только для аутентифицированных пользователей (иначе 401)
- Возвращает `{ id, email, role, full_name, is_active, created_at }` типа `UserProfile`
- `email` берётся из `supabase.auth.getUser()` (не из `profiles`, так как там может не быть)

**PATCH** — обновить профиль:
- Body: `{ full_name?: string }` (только это поле редактируется)
- Валидация: `full_name` не пустая строка, максимум 100 символов
- Обновляет `profiles.full_name` где `id = auth.uid()`
- Возвращает обновлённый `UserProfile`

### 2. API route — `app/api/profile/password/route.ts`

**POST** — сменить пароль:
- Body: `{ current_password: string, new_password: string }`
- Валидация: `new_password.length >= 8`
- Использует `supabase.auth.updateUser({ password: new_password })`

> Примечание: Supabase не позволяет проверить текущий пароль на стороне сервера через
> server client. Поэтому `current_password` проверяется через
> `supabase.auth.signInWithPassword({ email, password: current_password })` с клиентом,
> созданным через `createClientComponentClient`. Это означает, что `/api/profile/password`
> должен быть вызван с клиента, а не сервера. В серверном API route используй
> `supabase.auth.updateUser({ password: new_password })` без проверки текущего.
> Поле `current_password` в body принимать, но не проверять (UX-поле для клиента).
> Валидировать только `new_password.length >= 8`.

### 3. Страница — `app/profile/page.tsx`

Серверный компонент:
- Проверить аутентификацию через `lib/supabase/server.ts`
- Если не авторизован — `redirect('/login')`
- Получить данные профиля напрямую через Supabase server client (без HTTP fetch):
  ```typescript
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  ```
- Передать данные в `<ProfileClient profile={...} email={user.email} />`

### 4. Клиентский компонент — `app/profile/profile-client.tsx`

**Секция 1: Информация об аккаунте** (shadcn/ui `Card`)

Поля (только чтение):
- Email: `user.email`
- Роль: перевод роли на русский (investor → «Инвестор», project → «Проект», admin → «Администратор», moderator → «Модератор», manager → «Менеджер», superadmin → «Суперадмин»)
- Дата регистрации: `profile.created_at` → `toLocaleDateString('ru-RU')`

**Секция 2: Редактирование имени** (shadcn/ui `Card`)

Форма:
- Input: «Полное имя» (prefill из `profile.full_name`)
- Кнопка «Сохранить»
- При сохранении — PATCH `/api/profile` с `{ full_name }`
- Показывать success-сообщение «Имя обновлено» / error-сообщение

**Секция 3: Смена пароля** (shadcn/ui `Card`)

Форма:
- Input type=password: «Новый пароль» (минимум 8 символов)
- Input type=password: «Повторите пароль»
- Кнопка «Изменить пароль»
- Клиентская валидация: пароли совпадают + длина ≥ 8
- При сохранении — POST `/api/profile/password` с `{ new_password }`
- Показывать success «Пароль изменён» / error

**Кнопка «Назад»** вверху страницы:
- Для `investor` → `/dashboard`
- Для `project` → `/project`
- Для `admin` / `moderator` / `manager` / `superadmin` → `/dashboard` (admin-раздел)
- Определяется по `profile.role`

### 5. Обновить навигацию в layoutах

Добавить ссылку «Профиль» → `/profile` в nav-меню каждого кабинета:

**`app/(investor)/layout.tsx`** — добавить пункт «Профиль» последним в nav.

**`app/(project)/layout.tsx`** — добавить пункт «Профиль» последним в nav.

**`app/(admin)/layout.tsx`** — добавить пункт «Профиль» последним в nav.

Не трогать остальные пункты меню.

### 6. Типы — `types/index.ts`

`UserProfile` уже добавлен в T22. Проверь — если нет, добавь:

```typescript
export interface ProfileUpdate {
  full_name: string
}

export interface PasswordUpdate {
  new_password: string
}
```

Не дублировать если уже существуют.

### 7. Тесты — `__tests__/t27.test.ts`

```typescript
// 1. GET /api/profile — 401 без авторизации
// 2. GET /api/profile — 200 возвращает { id, email, role, full_name } для авторизованного (мок supabase)
// 3. PATCH /api/profile — 401 без авторизации
// 4. PATCH /api/profile — 400 если full_name пустая строка
// 5. PATCH /api/profile — 400 если full_name длиннее 100 символов
// 6. PATCH /api/profile — 200 обновляет full_name (мок supabase)
// 7. POST /api/profile/password — 401 без авторизации
// 8. POST /api/profile/password — 400 если new_password короче 8 символов
// 9. POST /api/profile/password — 400 если new_password отсутствует
// 10. POST /api/profile/password — 200 успешная смена пароля (мок supabase.auth.updateUser)
```

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict, никаких `any`
- shadcn/ui компоненты (Card, Input, Button)
- Не трогать файлы других модулей кроме указанных
- RLS уже включён на `profiles` — не менять
- Страница `/profile` доступна всем ролям

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t27.test.ts)
4. Страница `/profile` доступна и отображает данные пользователя
5. Форма обновления имени работает (PATCH `/api/profile`)
6. Форма смены пароля работает (POST `/api/profile/password`)
7. Ссылка «Профиль» присутствует в навигации всех трёх кабинетов
8. Записать в `progress.md`: `DONE: T27 + что создано/изменено`
