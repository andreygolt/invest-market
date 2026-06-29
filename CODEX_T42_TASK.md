# T42 — Уведомление владельца проекта при новой заявке инвестора

## Контекст

В T35 реализована система in-app уведомлений.
В T38 добавлены уведомления инвесторам при публикации обновлений проекта.

Однако когда инвестор подаёт заявку на проект (`POST /api/investor/applications`),
владелец проекта **не получает уведомления**. Он узнаёт о новой заявке только если
зайдёт в дашборд и увидит изменившуюся статистику (T41).

T42 закрывает этот пробел: после создания заявки инвестора владелец проекта
получает in-app уведомление с типом `new_application`.

## Что нужно создать / изменить

### 1. Обновить `types/index.ts`

Добавить `'new_application'` в `NotificationType`:

```typescript
export type NotificationType =
  | 'project_approved'
  | 'project_rejected'
  | 'application_approved'
  | 'application_rejected'
  | 'project_update'
  | 'new_application';  // добавить
```

Не трогать остальные типы.

### 2. Обновить `app/api/investor/applications/route.ts`

В обработчике `POST`, после успешного создания заявки (после `insert`),
добавить fire-and-forget уведомление владельцу проекта:

```typescript
// Найти owner_id проекта
const { data: projectOwner } = await supabase
  .from('projects')
  .select('owner_id')
  .eq('id', project_id)
  .maybeSingle();

if (projectOwner?.owner_id) {
  await supabase.from('notifications').insert({
    user_id: projectOwner.owner_id,
    type: 'new_application',
    title: 'Новая заявка от инвестора',
    body: `По проекту «${project.name}» поступила новая заявка на рассмотрение.`,
    link: '/project',
  });
}
```

> Важно: уже есть `const { data: project } = await supabase.from('projects').select('id, name, status')...`
> выше в функции — значит `project.name` доступен.
> Поле `owner_id` нужно получить отдельным запросом или расширить первый `select`.

**Рекомендованный способ** — расширить существующий первый запрос:

```typescript
// Было:
const { data: project } = await supabase
  .from('projects')
  .select('id, name, status')
  .eq('id', project_id)
  .eq('status', 'approved')
  .maybeSingle();

// Стало:
const { data: project } = await supabase
  .from('projects')
  .select('id, name, status, owner_id')
  .eq('id', project_id)
  .eq('status', 'approved')
  .maybeSingle();
```

Затем после успешного `insert` заявки:

```typescript
if (project.owner_id) {
  // fire-and-forget: ошибка не должна ломать ответ
  void supabase.from('notifications').insert({
    user_id: project.owner_id,
    type: 'new_application',
    title: 'Новая заявка от инвестора',
    body: `По проекту «${project.name}» поступила новая заявка на рассмотрение.`,
    link: '/project',
  });
}
```

Ошибка при вставке уведомления **не должна** изменять HTTP-ответ (201 Created).

### 3. Обновить тип `ProjectRow` / расширенный select

В текущем коде `projects` выбирается с полями `id, name, status`.
Если `owner_id` уже есть в типе `ProjectRow` в `types/index.ts` — просто добавить
его в select. Если нет — добавить в `types/index.ts`:

```typescript
// В интерфейсе ProjectRow добавить owner_id если его нет:
owner_id: string
```

Проверить перед добавлением — не дублировать существующее поле.

### 4. Тесты — `__tests__/t42.test.ts`

```typescript
// 1. POST /api/investor/applications — 201 создаёт заявку (базовый сценарий)
// 2. POST /api/investor/applications — при успехе вызывает insert в 'notifications'
// 3. POST /api/investor/applications — уведомление type === 'new_application'
// 4. POST /api/investor/applications — уведомление user_id === project.owner_id
// 5. POST /api/investor/applications — уведомление title === 'Новая заявка от инвестора'
// 6. POST /api/investor/applications — уведомление link === '/project'
// 7. POST /api/investor/applications — если owner_id отсутствует, уведомление не создаётся
// 8. POST /api/investor/applications — ошибка при вставке уведомления не меняет статус ответа (201)
// 9. POST /api/investor/applications — 400 без обязательных полей (investor_id/project_id/message)
// 10. POST /api/investor/applications — 404 если проект не найден или не approved
// 11. POST /api/investor/applications — 409 если активная заявка уже существует
// 12. NotificationType включает 'new_application'
```

### Структура моков для тестов

```typescript
// В тестах t42.test.ts используй jest.mock для createAdminClient.
// Важно: суперадмин-клиент используется в route.ts для всех операций.

const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const mockSingle = jest.fn().mockResolvedValue({
  data: { id: 'app-1', project_id: 'proj-1', amount: null, status: 'pending',
          message: 'Хочу инвестировать', created_at: '2026-01-01', updated_at: '2026-01-01' },
  error: null,
});
const mockMaybeSingle = jest.fn();

// from('projects') — первый вызов: возвращает проект с owner_id
// from('applications') — второй вызов select: проверка дубля; третий insert: создать заявку
// from('notifications') — последний insert: уведомление

// Используй mockImplementation с счётчиком вызовов или mockReturnValueOnce
// чтобы различать вызовы from('projects') и from('applications').
```

> Подсказка: можно использовать `jest.fn().mockImplementation((table: string) => { ... })`
> с switch/if по `table` чтобы возвращать разные цепочки для разных таблиц.

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict — никаких `any`
- Уведомление создаётся fire-and-forget — ошибка не должна ломать HTTP-ответ
- Не трогать файлы кроме указанных (types/index.ts, app/api/investor/applications/route.ts, __tests__/t42.test.ts)
- Не добавлять новые миграции — таблица `notifications` уже существует (из T35)
- Уведомление отправляется только один раз — сразу при создании заявки
- Если `owner_id` у проекта `null` или пустой — уведомление не создавать (guard)

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t42.test.ts)
4. `POST /api/investor/applications` — после создания заявки в таблицу `notifications` вставляется запись с `type = 'new_application'` и `user_id = project.owner_id`
5. Ошибка при вставке уведомления не влияет на HTTP-ответ (201 Created)
6. `NotificationType` в types/index.ts содержит `'new_application'`
7. Записать в `progress.md`: `DONE: T42 + что создано/изменено`
