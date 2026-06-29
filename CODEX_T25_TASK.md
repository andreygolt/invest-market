# T25 — Кабинет проекта: главная страница (Dashboard)

## Контекст

У пользователя с ролью `project` есть кабинет с разделами: анкета, документы, видео/сабмит,
обновления, коммерческие условия. Однако нет **главной страницы кабинета** — после логина
владелец проекта не видит сводной информации о своём проекте.

T25 создаёт главную страницу кабинета проекта (`/project`) с:
- текущим статусом проекта
- чеклистом выполненных шагов
- быстрыми ссылками на разделы
- навигацией во всех разделах

## Что нужно создать / изменить

### 1. Главная страница — `app/(project)/project/page.tsx`

Серверный компонент:
- Получить проект через Supabase server client (`projects` по `owner_id = auth.uid()`)
- Если проект не создан — показать форму создания (POST `/api/project/my`, потом redirect на `/project`)
- Передать данные в `<ProjectDashboardClient project={project} />`

### 2. Клиентский компонент — `app/(project)/project/project-dashboard-client.tsx`

**Секция 1: Статус проекта** (shadcn/ui `Card`)

Badge со статусом:
- `draft` → серый, «Черновик»
- `submitted` → синий, «На проверке»
- `approved` → зелёный, «Одобрен»
- `rejected` → красный, «Отклонён»

Название проекта крупным заголовком (`<h1>`).

Если статус `rejected` — показать информационный блок:
```
Ваш проект был отклонён. Обратитесь к администратору для получения комментария.
```

Если статус `approved` — показать информационный блок:
```
Ваш проект одобрен и виден инвесторам.
```

**Секция 2: Чеклист шагов** (shadcn/ui `Card`)

Список шагов с иконками ✓ (зелёная) / ○ (серая):

| Шаг | Условие выполнения |
|---|---|
| Анкета (секции 1-4) | `questionnaire_s1` IS NOT NULL в таблице `projects` |
| Анкета (секции 5-8) | `questionnaire_s5` IS NOT NULL |
| Документы загружены | передаётся как проп `docsCount > 0` |
| Видео загружено | `video_path IS NOT NULL` |
| Отправлен на модерацию | `status !== 'draft'` |

Для каждого незавершённого шага — кнопка-ссылка «Заполнить» / «Загрузить» / «Отправить»,
ведущая на соответствующую страницу.

Количество завершённых шагов: «Выполнено N из 5».

> Примечание: `docsCount` нужно получить в серверном компоненте отдельным запросом:
> ```typescript
> const { count } = await supabase
>   .from('project_documents')
>   .select('id', { count: 'exact', head: true })
>   .eq('project_id', project.id)
> ```

**Секция 3: Быстрые действия** (grid 2×N кнопок/карточек)

Кнопки-карточки (shadcn/ui `Card` кликабельный через `<Link>`):

| Действие | Ссылка | Показывать |
|---|---|---|
| Заполнить анкету | `/questionnaire` | всегда |
| Загрузить документы | `/documents` | всегда |
| Загрузить видео и отправить | `/submit` | если `status === 'draft'` |
| Написать обновление | `/updates` | если `status === 'approved'` |
| Коммерческие условия | `/commercial-terms` | если `status === 'approved'` |

### 3. Обновить навигацию кабинета — `app/(project)/layout.tsx`

Добавить в `<nav>` пункты меню (не удалять существующий «Обновления»):

```
Мой проект | Анкета | Документы | Отправить | Обновления | Условия
```

Ссылки:
- Мой проект → `/project`
- Анкета → `/questionnaire`
- Документы → `/documents`
- Отправить → `/submit`
- Обновления → `/updates`
- Условия → `/commercial-terms`

Пункт «Условия» показывать только если проект существует и `status === 'approved'`
(получить статус из Supabase прямо в layout, добавив запрос — он уже есть для проверки роли).

### 4. Типы — `types/index.ts`

Добавить к существующим (не удалять ничего):

```typescript
export interface ProjectDashboardData {
  id: string
  name: string
  status: ProjectStatus
  questionnaire_s1: Record<string, unknown> | null
  questionnaire_s5: Record<string, unknown> | null
  video_path: string | null
  created_at: string
}

export interface ProjectChecklist {
  questionnaire14: boolean
  questionnaire58: boolean
  hasDocuments: boolean
  hasVideo: boolean
  submitted: boolean
}
```

> `ProjectStatus` уже определён в T4 — не дублировать.

### 5. Тесты — `__tests__/t25.test.ts`

```typescript
// 1. GET /api/project/my — 401 без авторизации (уже тестировался, проверить что работает)
// 2. ProjectChecklist: questionnaire14=true если questionnaire_s1 !== null
// 3. ProjectChecklist: questionnaire58=true если questionnaire_s5 !== null
// 4. ProjectChecklist: submitted=true если status !== 'draft'
// 5. ProjectChecklist: все false для нового проекта (все null, status='draft')
// 6. ProjectChecklist: все true для полностью заполненного проекта
// 7. GET /api/project/my — возвращает null project если проект не создан
// 8. GET /api/project/my — возвращает project с полями id, name, status
// 9. POST /api/project/my — 400 если name пустой
// 10. POST /api/project/my — 201 с новым проектом (мок supabase)
```

Тесты 2-6 — unit-тесты чистой функции `buildChecklist(project, docsCount)`,
которую нужно вынести в `lib/project/checklist.ts`.

### 6. Утилита — `lib/project/checklist.ts`

```typescript
import type { ProjectDashboardData, ProjectChecklist } from '@/types'

export function buildChecklist(
  project: ProjectDashboardData,
  docsCount: number
): ProjectChecklist {
  return {
    questionnaire14: project.questionnaire_s1 !== null,
    questionnaire58: project.questionnaire_s5 !== null,
    hasDocuments: docsCount > 0,
    hasVideo: project.video_path !== null,
    submitted: project.status !== 'draft',
  }
}
```

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict, никаких `any`
- Весь UI через shadcn/ui компоненты (Card, Badge, Button)
- Не трогать файлы других модулей кроме указанных
- RLS уже включён на всех таблицах — не менять

## Definition of Done

1. `npm run build` — без ошибок TypeScript
2. `npm run lint` — без ошибок ESLint
3. `npm test` — все тесты проходят (включая новые t25.test.ts)
4. Страница `/project` отображает статус проекта, чеклист и быстрые действия
5. Навигация кабинета проекта содержит все разделы
6. `lib/project/checklist.ts` — чистая функция, покрытая тестами
7. Записать в `progress.md`: `DONE: T25 + что создано/изменено`
