# T82 — Инвайт-система: регистрация только по ссылке

## Контекст

Платформа закрытая — инвестор может зарегистрироваться ТОЛЬКО по специальной invite-ссылке.
Таблица `invites` уже существует в БД (code, role, email, used_by, expires_at).

Флоу:
1. Админ создаёт инвайт-код в панели → получает ссылку `/invite/КОД`
2. Инвестор переходит по ссылке → видит форму регистрации (email + password)
3. После регистрации код помечается как использованный (used_by, used_at)
4. Инвестор попадает на страницу ожидания (T83 сделает это)

## Что нужно создать

### 1. `app/invite/[code]/page.tsx`

Страница регистрации по инвайту. Тёмный стиль как на лендинге.

- При загрузке: проверить код через GET /api/invite/[code]
- Если код невалиден/истёк/использован → показать ошибку "Ссылка недействительна"
- Если валиден → показать форму: email (prefill если invite.email задан), password, кнопка "Создать аккаунт"
- После успешной регистрации → редирект на `/pending` (T83)

```tsx
"use client"
// Использовать createClient из @/lib/supabase/client
// supabase.auth.signUp({ email, password })
// После signUp: вызвать POST /api/invite/[code]/use чтобы пометить код использованным
// Редирект на /pending
```

### 2. `app/api/invite/[code]/route.ts`

GET — проверить код:
```typescript
// GET /api/invite/[code]
// Найти invite по code в public.invites
// Вернуть { valid: true, role, email } или { valid: false, reason: string }
// Невалидный если: used_by IS NOT NULL, expires_at < now(), не найден
```

Использовать `createAdminClient` (обходит RLS).

### 3. `app/api/invite/[code]/use/route.ts`

POST — пометить код использованным:
```typescript
// POST /api/invite/[code]/use
// Body: { userId: string }
// Update invites SET used_by = userId, used_at = now() WHERE code = code AND used_by IS NULL
// Вернуть { ok: true } или ошибку
```

Использовать `createAdminClient`.

### 4. Обновить `app/api/auth/callback/route.ts` (если существует)

Прочитать файл. Если нет — создать минимальный handler для Supabase auth callback.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict, никаких any
- Читать файлы перед изменением

## Definition of Done

1. npm run build — без ошибок
2. GET /api/invite/НЕСУЩЕСТВУЮЩИЙ_КОД возвращает { valid: false }
3. Страница /invite/[code] рендерится без ошибок
4. Записать в progress.md: DONE: T82 + что создано/изменено
