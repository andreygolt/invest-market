# T103 — Открытая регистрация для проектов + анкета

## Цель

Сейчас проекты регистрируются только по инвайту. Нужно:
1. Добавить кнопку "Предложить проект" на лендинге (`app/page.tsx`)
2. Создать открытую страницу регистрации для проектов `/apply`
3. После регистрации — AI-анкета (уже существует в `/project/questionnaire`)
4. Проект попадает в админку на модерацию

## Шаг 1 — Лендинг `app/page.tsx`

Найди кнопку "Получить приглашение" на лендинге. Добавь рядом вторую кнопку:
```
"Предложить проект" → /apply
```
Стиль: `border border-white/30 text-white hover:bg-white/10 px-6 py-3 rounded-lg text-sm font-medium`

## Шаг 2 — Страница `/apply` (`app/apply/page.tsx`)

Создать публичную страницу регистрации проекта. Светлая тема, минималистичный дизайн.

Форма:
- Название компании / проекта (text input)
- Email (email input)  
- Пароль (password input, min 8 символов)
- Кнопка "Подать заявку"

После submit:
1. `supabase.auth.signUp({ email, password, options: { data: { full_name: companyName } } })`
2. POST `/api/apply` — создаёт запись в `public.users` с ролью `project`, `is_active: false`
3. Создаёт запись в `public.projects` со статусом `draft`, `name: companyName`
4. Редирект на `/apply/questionnaire?project_id=<id>`

Добавить `/apply` в публичные маршруты middleware.ts (isPublic).

## Шаг 3 — API `/api/apply/route.ts`

```typescript
POST /api/apply
Body: { userId: string, email: string, companyName: string }

1. Используй createAdminClient()
2. Upsert в public.users: { id: userId, email, role: 'project', is_active: false }
3. Insert в public.projects: { owner_id: userId, name: companyName, status: 'draft' }
4. Вернуть { projectId }
```

## Шаг 4 — Анкета `/apply/questionnaire` (`app/apply/questionnaire/page.tsx`)

Создать упрощённую анкету (client component). Поля:
- Отрасль (select: Энергетика, Медтех, АгроТех, Логистика, Финтех, Другое)
- Стадия (select: idea, pre_seed, seed, series_a_plus)
- Описание проекта (textarea, min 100 символов)
- Сколько привлекаете (text input, пример: "5 000 000 ₽")
- На что планируете потратить (textarea)
- Размер команды (number input)
- Сайт или соцсети (text input, optional)

После submit:
- PATCH `/api/projects/<projectId>/questionnaire` с данными анкеты
- Редирект на `/apply/done`

## Шаг 5 — Страница `/apply/done` (`app/apply/done/page.tsx`)

Светлая тема. Текст:
- Заголовок: "Заявка отправлена"
- Подзаголовок: "Мы изучим ваш проект и свяжемся с вами в ближайшее время."
- Кнопка "На главную" → /

## Шаг 6 — Middleware

В `middleware.ts` добавить в isPublic:
```
pathname.startsWith('/apply')
pathname.startsWith('/api/apply')
```

## Шаг 7 — Админка: раздел "Проекты на рассмотрении"

В `app/(admin)/moderation/page.tsx` — убедиться что проекты со статусом `draft` видны модераторам (скорее всего уже есть, просто проверить что статус `draft` включён в выборку).

## Ограничения

- НЕ трогать `app/page.tsx` текст — только добавить кнопку
- НЕ менять существующую систему инвайтов
- Читать файлы перед изменением
- NO новых зависимостей

## Definition of Done

1. `npm run build` — без ошибок
2. Страница `/apply` открывается без логина
3. Форма регистрирует пользователя и создаёт проект
4. Записать в progress.md: DONE: T103
