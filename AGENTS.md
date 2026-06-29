# AGENTS.md — Invest Market

## Проект

**invest_market** — закрытый инвестиционный маркет с AI-андеррайтингом.

Проекты проходят AI-анкету → загружают документы → получают AI-анализ →
модератор утверждает → инвесторы видят deal room → оставляют заявки →
сделки оформляются вне платформы.

## Стек

- **Frontend:** Next.js 14 + TypeScript + App Router (УЖЕ СОЗДАН)
- **UI:** shadcn/ui + Tailwind CSS
- **БД + Auth + Storage:** Supabase (PostgreSQL + Row Level Security)
- **AI:** OpenAI GPT-4o structured outputs
- **Деплой:** Vercel

## Структура проекта (уже создана)

```
invest_market/
  app/                      — Next.js App Router (существует)
  components/               — shared UI компоненты
  lib/
    supabase/               — client.ts, server.ts, admin.ts
    ai/                     — AI промпты, pipeline
  supabase/
    migrations/             — SQL миграции
  types/                    — TypeScript типы
  __tests__/                — Jest тесты
  package.json              — уже создан, не трогать зависимости без ТЗ
```

## Команды (из папки invest_market/)

```bash
npm run dev          # запустить dev-сервер
npm run build        # проверка сборки (ОБЯЗАТЕЛЬНО после каждой задачи)
npm run lint         # линтер
npm test             # тесты (если Jest настроен)
```

ВАЖНО: Node находится в /usr/local/bin/node, npm в /usr/local/bin/npm.
Если команды не найдены — используй полный путь /usr/local/bin/npm.

## Роли пользователей

- `superadmin` — полный доступ
- `admin` — управление платформой
- `moderator` — проверка проектов
- `manager` — обработка заявок
- `investor` — просмотр каталога, заявки
- `project` — кабинет проекта

## Правила для Codex

- **NO** новых npm-зависимостей без явного указания в ТЗ
- **Миграции только аддитивные** — не изменять существующие таблицы
- **RLS обязателен** — каждая таблица Supabase должна иметь Row Level Security
- **TypeScript strict** — никаких `any` без обоснования
- **shadcn/ui компоненты** — использовать готовые
- **Не трогать** файлы других модулей если не указано в ТЗ
- **Дисклеймеры** обязательны везде где упоминается доходность

## Definition of Done (любая задача)

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. Основной сценарий реализован
4. Написан отчёт в progress.md: DONE: T{N} + что создано/изменено
