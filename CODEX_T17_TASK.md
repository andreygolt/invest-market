# CODEX TASK T17 — Кабинет партнёрской программы

## Цель

Создать кабинет партнёра — страницы для просмотра реферального кода, статистики рефералов
по уровням, списка приглашённых пользователей и истории вознаграждений. Также создать
страницу администратора для управления реферальными вознаграждениями.

## Контекст

T16 создал БД (referral_codes, referral_links, referral_rewards), API
(`/api/referral/code`, `/api/referral/stats`, `/api/referral/list`,
`/api/admin/referral-rewards`) и логику 3-уровневой реферальной сети.

T17 строит UI поверх этих API. Все данные берутся только из готовых endpoints T16.

## Что создать

### 1. Layout для раздела инвестора уже существует

Кабинет партнёра размещается внутри `app/(investor)/` — используй существующий layout.

### 2. Страница кабинета партнёра

**Файл:** `app/(investor)/referral/page.tsx`

Серверный компонент. Получает данные через `fetch` с заголовком cookie (или
`createServerClient`). Рендерит клиентский компонент `ReferralDashboard`.

**Файл:** `app/(investor)/referral/referral-dashboard.tsx`

Клиентский компонент (`'use client'`). Разделы:

#### 2.1 Блок «Мой реферальный код»

- Показывает реферальный код (например `ABCD-1234`)
- Кнопка «Копировать код» — копирует в буфер обмена через `navigator.clipboard`
- Реферальная ссылка: `{NEXT_PUBLIC_APP_URL}/invite/{code}` — тоже копируется
- Дисклеймер: «Вознаграждения начисляются согласно условиям партнёрской программы.
  Фактические выплаты осуществляются вне платформы.»

Данные: `GET /api/referral/code`

#### 2.2 Блок «Статистика рефералов»

Карточки (shadcn Card):

| Метрика | Значение |
|---|---|
| Рефералы 1-го уровня | `level1_count` |
| Рефералы 2-го уровня | `level2_count` |
| Рефералы 3-го уровня | `level3_count` |
| Всего рефералов | `total_referrals` |
| Ожидает подтверждения | `rewards_pending` ₽ |
| Подтверждено | `rewards_approved` ₽ |
| Выплачено | `rewards_paid` ₽ |

Данные: `GET /api/referral/stats`

#### 2.3 Таблица рефералов

Фильтр по уровню: `All / 1 / 2 / 3` (кнопки или select).

Колонки таблицы:
- Email (замаскированный, как возвращает API)
- Уровень (1 / 2 / 3)
- Дата регистрации (локальный формат даты)

Пагинация: кнопки «Назад» / «Вперёд», показывает по 20 записей.

Данные: `GET /api/referral/list?level={level}&limit=20&offset={offset}`

#### 2.4 Дисклеймер

Жирным внизу страницы:
> «Информация о вознаграждениях носит справочный характер. Платформа не осуществляет
> денежные переводы. Все выплаты производятся согласно отдельному договору вне платформы.»

### 3. Страница администратора: управление вознаграждениями

**Файл:** `app/(admin)/referral-rewards/page.tsx`

Серверный компонент. Защита: проверяй роль (admin / superadmin) через
`createServerClient`. Если роль не подходит — redirect на `/login`.

Рендерит клиентский компонент `ReferralRewardsAdmin`.

**Файл:** `app/(admin)/referral-rewards/referral-rewards-admin.tsx`

Клиентский компонент:

- Фильтр по статусу: `All / pending / approved / paid` (кнопки)
- Таблица вознаграждений (shadcn Table):

| Колонка | Описание |
|---|---|
| Реферер | `referrer_email` |
| Реферал | `referee_email` |
| Уровень | `level` |
| Сумма | `amount` ₽ |
| Статус | Badge: pending (жёлтый) / approved (синий) / paid (зелёный) |
| Действие | Кнопки изменения статуса |

Кнопки действий:
- Если статус `pending` → кнопка «Подтвердить» (→ `approved`)
- Если статус `approved` → кнопка «Отметить выплаченным» (→ `paid`)
- Если статус `paid` → нет кнопок

При нажатии — `PATCH /api/admin/referral-rewards/{id}` с `{ status: '...' }`.
После успеха — перезагружает список.

Данные: `GET /api/admin/referral-rewards?status={status}`

### 4. Навигация

**Файл:** `app/(investor)/layout.tsx` — добавь ссылку «Партнёрская программа» → `/referral`

**Файл:** `app/(admin)/layout.tsx` или существующий admin nav — добавь ссылку
«Реферальные вознаграждения» → `/admin/referral-rewards`

Изучи существующие layout файлы перед редактированием.

### 5. Тесты

**Файл:** `__tests__/t17.test.ts`

Тесты (мок Supabase как в предыдущих тестах):

1. `GET /api/referral/code` — 401 без авторизации (перепроверка из T16, уже должен проходить)
2. `GET /api/referral/stats` — 200 возвращает все поля `ReferralStats`
3. `GET /api/referral/list` — 200 с пустым массивом если рефералов нет
4. `GET /api/referral/list?level=1` — фильтрует по уровню (mock возвращает только level=1)
5. `GET /api/admin/referral-rewards` — 403 для роли `investor`
6. `GET /api/admin/referral-rewards` — 200 для роли `admin` (mock: пустой список)
7. `PATCH /api/admin/referral-rewards/[id]` — 403 для роли `investor`
8. `PATCH /api/admin/referral-rewards/[id]` — 200 обновляет статус для `admin`
9. Тип `ReferralStats` имеет поля `rewards_pending`, `rewards_approved`, `rewards_paid`

Паттерн мока: `jest.mock('@/lib/supabase/server', ...)` как в t15.test.ts, t16.test.ts.

## Что НЕ делать

- Не создавать новые API routes — все endpoints уже есть из T16
- Не добавлять новые npm-зависимости
- Не трогать логику T16 (referral_codes, referral_links, referral_rewards таблицы)
- Не реализовывать выплаты — только отображение статусов

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t17.test.ts)
4. `/referral` — инвестор видит свой код, статистику и список рефералов
5. `/admin/referral-rewards` — администратор видит и может менять статусы вознаграждений
6. Навигация обновлена (investor layout + admin layout)
7. Дисклеймеры присутствуют на обеих страницах
8. Запись в `progress.md`: `DONE: T17 + список созданных/изменённых файлов`
