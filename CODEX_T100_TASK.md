# T100 — Светлая тема: админ-панель и кабинет проекта

## Контекст

Светлая тема уже применена к каталогу, dashboard, deal room (T92-T99).
Остались тёмными: админ-панель и кабинет проекта.

## Что нужно изменить

### 1. Найти и прочитать все файлы в `app/(admin)/`

Заменить везде тёмные классы на светлые:
- `bg-[#0a0a0a]`, `bg-slate-900`, `bg-slate-950`, `bg-zinc-900` → `bg-slate-50` или `bg-white`
- `text-white` → `text-slate-900`
- `text-slate-400` → `text-slate-600`
- `border-slate-700`, `border-slate-800` → `border-slate-200`
- `bg-slate-800` (карточки) → `bg-white border border-slate-200`
- Кнопки: убрать `bg-slate-800 text-white` → `bg-slate-900 text-white` (primary) или `border border-slate-300 text-slate-700` (secondary)

### 2. Найти и прочитать все файлы в `app/(project)/`

Те же замены что выше.

### 3. Navbar `app/(investor)/layout.tsx` и `app/(admin)/layout.tsx`

- Фон navbar: `bg-white border-b border-slate-200`
- Логотип: `text-slate-900 font-semibold`
- Ссылки: `text-slate-600 hover:text-slate-900`

## Ограничения

- НЕ трогать `app/page.tsx` (лендинг — тёмный)
- НЕ трогать `app/pending/page.tsx`
- НЕ трогать `app/(auth)/invite/`
- Читать файлы перед изменением
- NO новых зависимостей

## Definition of Done

1. npm run build — без ошибок
2. /admin/* — светлый фон
3. /project/* — светлый фон
4. Записать в progress.md: DONE: T100
