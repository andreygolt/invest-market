# T83 — Страница ожидания и логика доступа

## Контекст

После регистрации по инвайту инвестор НЕ должен сразу попасть в кабинет.
Нужна страница ожидания + middleware который блокирует доступ к /dashboard пока admin не активирует пользователя.

Активация = запись в public.users с нужной ролью. Пока записи нет — пользователь не активирован.

## Что нужно создать

### 1. `app/pending/page.tsx`

Тёмная страница ожидания. Центр экрана.

```
[Иконка часов или песочных часов — emoji или SVG]
"Заявка на рассмотрении"
"Администратор проверит вашу заявку и откроет доступ к платформе. Обычно это занимает 1-2 рабочих дня."
[Кнопка "Выйти" — вызывает supabase.auth.signOut() и редирект на /]
```

Тёмный стиль как на лендинге (bg #0a0a0a, text-white/slate).

### 2. Обновить `middleware.ts`

Прочитать файл целиком перед изменением.

Логика:
- Публичные маршруты (пропускать без проверки): `/`, `/login`, `/invite/*`, `/pending`, `/api/invite/*`, `/api/auth/*`
- Для всех остальных (`/dashboard`, `/admin`, `/investor`, `/moderation`, `/project`, `/deals`):
  1. Проверить сессию через `supabase.auth.getUser()`
  2. Если нет сессии → редирект на `/login`
  3. Если сессия есть → проверить существование записи в `public.users` через `supabase.from('users').select('role').eq('id', user.id).maybeSingle()`
  4. Если записи нет → редирект на `/pending`
  5. Если запись есть → пропустить

Использовать `createServerClient` из `@supabase/ssr` с cookies из middleware.

### 3. `app/api/admin/activate-user/route.ts`

POST — активировать пользователя (создать запись в public.users):
```typescript
// Только для superadmin/admin
// Body: { userId: string, email: string, fullName: string, role: user_role }
// INSERT INTO public.users (id, email, full_name, role) VALUES (...)
// Вернуть { ok: true }
```

Использовать `createAdminClient`. Проверить роль текущего пользователя перед вставкой.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict
- Читать middleware.ts перед изменением
- Не ломать существующие маршруты

## Definition of Done

1. npm run build — без ошибок
2. npm run lint — без ошибок
3. /pending рендерится без ошибок
4. Незарегистрированный пользователь при заходе на /dashboard → редирект на /login
5. Зарегистрированный но не активированный → редирект на /pending
6. Записать в progress.md: DONE: T83 + что создано/изменено
