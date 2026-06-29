# T84 — Страница управления инвайтами /admin/invites

## Контекст

Администратор должен иметь UI для создания invite-ссылок и отслеживания их статуса.
Таблица `invites` уже существует (code, role, email, created_by, used_by, used_at, expires_at).

## Что нужно создать

### 1. `app/(admin)/admin/invites/page.tsx`

Server component. Показывает список всех инвайтов и форму создания нового.

Структура страницы:
- Заголовок "Инвайт-ссылки"
- Форма создания (InviteCreateForm — client component)
- Таблица существующих инвайтов

Данные для таблицы получать через `createAdminClient`:
```typescript
const { data: invites } = await admin
  .from('invites')
  .select('id, code, role, email, used_by, used_at, expires_at, created_at')
  .order('created_at', { ascending: false })
  .limit(50)
```

Колонки таблицы: Роль | Email | Ссылка (копировать) | Статус | Создан | Истекает

Статус:
- `used_by IS NOT NULL` → "Использован" (зелёный badge)
- `expires_at < now()` → "Истёк" (красный badge)
- иначе → "Активен" (серый badge)

Ссылка: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/invite/${code}`

### 2. `app/(admin)/admin/invites/invite-create-form.tsx`

Client component с формой:

Поля:
- Role (select): investor | project | moderator | manager
- Email (input, optional): если указан — инвайт только для этого email
- Expires in (select): 7 дней | 30 дней | Без срока

Кнопка "Создать инвайт" → POST /api/admin/invites

После успеха: показать созданную ссылку в модалке/алерте с кнопкой "Скопировать".
После копирования: router.refresh() для обновления таблицы.

### 3. `app/api/admin/invites/route.ts`

POST — создать инвайт:
```typescript
// Проверить роль текущего пользователя (только superadmin/admin)
// Body: { role: string, email?: string, expiresInDays?: number }
// Сгенерировать code: crypto.randomUUID().replace(/-/g, '').slice(0, 16)
// INSERT INTO public.invites (code, role, email, created_by, expires_at)
// Вернуть { code, url }
```

GET — список инвайтов (для refresh):
```typescript
// Только superadmin/admin
// Вернуть последние 50 инвайтов
```

Использовать `createAdminClient` для вставки.
Использовать `createClient` для проверки роли текущего пользователя.

### 4. Добавить ссылку в навигацию админки

Найти файл с навигацией администратора (скорее всего `app/(admin)/admin/layout.tsx` или sidebar компонент).
Прочитать файл. Добавить пункт "Инвайты" → `/admin/invites`.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict
- Только superadmin и admin могут создавать инвайты
- Читать все файлы перед изменением

## Definition of Done

1. npm run build — без ошибок
2. npm run lint — без ошибок
3. /admin/invites загружается и показывает таблицу
4. Форма создаёт инвайт и показывает ссылку
5. Записать в progress.md: DONE: T84 + что создано/изменено
