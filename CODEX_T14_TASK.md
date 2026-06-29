# CODEX TASK T14 — Dashboard инвестора

## Цель

Создать главную страницу кабинета инвестора (`/dashboard`) с агрегированной сводкой:
активные заявки, портфель, избранное, последние сделки.

## Контекст

После T13 у инвестора есть:
- Портфель (`/api/investor/portfolio`) — записи с суммами, статусами
- Заявки (`/api/investor/applications`) — список поданных заявок
- Избранное (`/api/investor/favorites`) — избранные проекты
- Каталог (`/api/investor/catalog`) — одобренные проекты

Dashboard агрегирует данные из этих источников в одном экране.

## Что создать

### 1. API route: `/api/investor/dashboard`

**Файл:** `app/api/investor/dashboard/route.ts`

**GET** — возвращает агрегат для текущего инвестора:

```typescript
{
  portfolio: {
    total_invested: number,       // сумма всех confirmed/exited записей
    active_count: number,         // статус confirmed
    exited_count: number,         // статус exited
    defaulted_count: number,      // статус defaulted
  },
  applications: {
    total: number,
    pending: number,              // статус submitted/reviewing
    approved: number,
    rejected: number,
  },
  favorites_count: number,
  recent_deals: RecentDeal[],     // последние 5 одобренных проектов из каталога
}
```

**RecentDeal** — берётся из существующего view `v_investor_catalog`:
```typescript
{
  id: string,
  name: string,
  industry: string | null,
  investment_stage: string | null,
  min_investment: number | null,
}
```

Аутентификация через `createServerClient` (как в других routes).
Ошибка 401 если пользователь не авторизован.

### 2. TypeScript типы

**Файл:** `types/index.ts` — добавить в конец файла:

```typescript
export interface DashboardPortfolioStats {
  total_invested: number;
  active_count: number;
  exited_count: number;
  defaulted_count: number;
}

export interface DashboardApplicationStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export interface RecentDeal {
  id: string;
  name: string;
  industry: string | null;
  investment_stage: string | null;
  min_investment: number | null;
}

export interface InvestorDashboard {
  portfolio: DashboardPortfolioStats;
  applications: DashboardApplicationStats;
  favorites_count: number;
  recent_deals: RecentDeal[];
}
```

### 3. Dashboard страница

**Файл:** `app/(investor)/dashboard/page.tsx`

Серверный компонент. Вызывает `/api/investor/dashboard` через `fetch` с серверными куками (как другие страницы в (investor)).

Отображает:
- **Секция «Мой портфель»**: 3 карточки-цифры: сумма вложений (форматированная, в ₽), активные позиции, завершённые выходы. Если `total_invested === 0` — заглушка «Портфель пуст».
- **Секция «Заявки»**: 3 цифры: всего / на рассмотрении / одобрено. Если `total === 0` — заглушка «Заявок нет».
- **Секция «Последние сделки»**: список до 5 проектов с кнопкой-ссылкой «Подробнее» → `/deals/{id}`. Если пусто — заглушка «Нет доступных проектов».
- Ссылки-кнопки: «Смотреть каталог» → `/catalog`, «Мой портфель» → `/portfolio`, «Мои заявки» → `/applications`, «Избранное» → `/favorites`.
- Дисклеймер внизу страницы (стандартный для платформы): «Платформа не является финансовым советником. Все инвестиционные решения принимаются самостоятельно. Прошлые результаты не гарантируют будущей доходности.»

Используй shadcn/ui компоненты: `Card`, `CardContent`, `CardHeader`, `CardTitle`.

### 4. Тесты

**Файл:** `__tests__/t14.test.ts`

Тесты для:
1. `GET /api/investor/dashboard` — 401 без авторизации
2. `GET /api/investor/dashboard` — 200 с корректной структурой (mock Supabase)
3. Тип `InvestorDashboard` — проверка что все поля присутствуют

Тестовые моки аналогичны `__tests__/t13.test.ts`.

## Что НЕ делать

- Не трогать существующие API routes или страницы других модулей
- Не добавлять новые npm-зависимости
- Не создавать новые таблицы или миграции (данные берутся из существующих таблиц)
- Не добавлять графики/чарты (нет charting-библиотеки в проекте)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t14.test.ts)
4. Dashboard отображает сводку по портфелю, заявкам, последним сделкам
5. Дисклеймер присутствует на странице
6. Запись в `progress.md`: `DONE: T14 + список созданных файлов`
