# T24 — Admin: Панель управления заявками инвесторов

## Контекст

В T10 реализована система заявок инвесторов: инвестор подаёт заявку на участие в сделке,
заявка сохраняется в таблице `investor_applications`. API `/api/admin/applications` уже
существует, но у администратора/менеджера нет **UI-страницы** для просмотра, фильтрации
и обработки заявок. Менеджер не может увидеть список всех заявок, отфильтровать их по
проекту/статусу или принять решение по заявке.

T24 создаёт панель управления заявками: список всех заявок с фильтрами,
просмотр деталей и смена статуса (pending → approved / rejected).

## Что нужно создать

### 1. Страница списка заявок — `app/(admin)/applications/page.tsx`

Серверный компонент:
- Проверить роль: `superadmin`, `admin`, `moderator`, `manager` — иначе redirect на `/login`
- Передаёт данные в `<ApplicationsClient />`

### 2. Клиентский компонент — `app/(admin)/applications/applications-client.tsx`

**Фильтры** (верхняя панель):
- Выбор проекта (select из уникальных проектов в заявках)
- Статус: `all` | `pending` | `approved` | `rejected`
- Поиск по имени/email инвестора (текстовый input)

**Таблица заявок** (`shadcn/ui Table`):

| Колонка | Источник |
|---|---|
| Инвестор | `user_email` или `investor_name` |
| Проект | `project_name` |
| Сумма | `amount` (форматировать через `toLocaleString('ru-RU')` + ₽) |
| Статус | badge: pending=жёлтый, approved=зелёный, rejected=красный |
| Дата | `created_at` → `toLocaleDateString('ru-RU')` |
| Действия | кнопки «Одобрить» / «Отклонить» (только если статус pending) |

Кнопки действий вызывают PATCH `/api/admin/applications/[id]` с `{ status: 'approved' }` или
`{ status: 'rejected' }`, после чего вызывают `router.refresh()`.

**Счётчики итогов** под фильтрами (или над таблицей):
```
Всего: N  |  Ожидают: N  |  Одобрено: N  |  Отклонено: N
```

Счётчики пересчитываются по текущим отфильтрованным данным.

**Пустое состояние**: если заявок нет — показать текст «Нет заявок по выбранным фильтрам».

### 3. Навигация — добавить пункт «Заявки» в admin-nav

Найди файл навигации admin-панели (layout или отдельный nav-компонент в `app/(admin)/`).
Добавь пункт **«Заявки»** → `/applications` между «Пользователи» и «Условия», если его ещё нет.

Не трогай другие пункты меню.

### 4. Типы — `types/index.ts`

Добавить к существующим (не удалять ничего):

```typescript
export interface AdminApplicationItem {
  id: string
  project_id: string
  project_name: string | null
  investor_id: string
  investor_email: string | null
  amount: number | null
  comment: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export type ApplicationFilterStatus = 'all' | 'pending' | 'approved' | 'rejected'
```

### 5. Тесты — `__tests__/t24.test.ts`

```typescript
// 1. GET /api/admin/applications — 401 без авторизации
// 2. GET /api/admin/applications — 403 для role=investor
// 3. GET /api/admin/applications — 403 для role=project
// 4. GET /api/admin/applications — 200 для role=admin (мок supabase)
// 5. GET /api/admin/applications — 200 для role=manager
// 6. GET /api/admin/applications — 200 для role=moderator
// 7. PATCH /api/admin/applications/[id] — 401 без авторизации
// 8. PATCH /api/admin/applications/[id] — 403 для role=investor
// 9. PATCH /api/admin/applications/[id] { status: 'approved' } — 200 для role=manager
// 10. PATCH /api/admin/applications/[id] { status: 'rejected' } — 200 для role=admin
// 11. PATCH /api/admin/applications/[id] — 400 при невалидном статусе
// 12. AdminApplicationItem имеет поля id, project_id, investor_id, amount, status, created_at
```

## Ограничения

- NO новых npm-зависимостей
- Всё UI через shadcn/ui компоненты (Table, Badge, Select, Button, Input)
- TypeScript strict, никаких `any`
- Не трогать файлы других модулей кроме указанных
- RLS уже включён на всех таблицах — не менять
- Платформа НЕ принимает деньги — поле `amount` вводится вручную инвестором как декларация намерений

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t24.test.ts)
4. Страница `/applications` в admin-панели показывает список заявок
5. Фильтры по статусу и проекту работают на клиенте
6. Кнопки «Одобрить» / «Отклонить» обновляют статус через API
7. Пункт «Заявки» присутствует в навигации admin-панели
8. Записать в `progress.md`: `DONE: T24 + что создано/изменено`
