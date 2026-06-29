# T85 — Красивые карточки проектов в каталоге

## Контекст

Инвестор заходит в `/catalog` и видит список проектов. Сейчас карточки базовые.
Нужен профессиональный дизайн карточек: тёмная тема, информативно, визуально сильно.

## Что нужно изменить

### Найти и прочитать файлы каталога

Найти: `app/(investor)/catalog/` или `app/catalog/` — страница каталога инвестора.
Прочитать все файлы в этой папке перед изменением.

### Новый дизайн карточки проекта

Каждая карточка проекта должна содержать:

```
┌─────────────────────────────────────────┐
│  [Бейдж отрасли]              [AI Score]│
│                                          │
│  Название проекта                        │
│  Короткое описание (2 строки max)        │
│                                          │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│  💰 120 млн ₽    📈 Series A   👥 24    │
│                                          │
│  [Открыть deal room →]                  │
└─────────────────────────────────────────┘
```

**Стиль карточки:**
- Фон: `bg-slate-900` или `bg-zinc-900`
- Граница: `border border-slate-800 hover:border-slate-600`
- Тень при hover: `hover:shadow-lg hover:shadow-black/20`
- Переход: `transition-all duration-200`
- Скругление: `rounded-xl`
- Паддинг: `p-6`

**AI Score бейдж** (верхний правый угол):
- score >= 80: `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20`
- score >= 60: `bg-yellow-500/10 text-yellow-400 border border-yellow-500/20`
- score < 60 или нет score: не показывать
- Текст: "AI 82" (число из ai_reports.report.score)

**Бейдж отрасли** (верхний левый):
- `bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded-md`

**Сумма инвестиций:**
- Форматировать: если >= 1_000_000 → "120 млн ₽", если >= 1_000 → "120 тыс ₽"

**Кнопка:**
- `variant="ghost"` с классом `text-slate-400 hover:text-white p-0 h-auto`
- Текст: "Открыть deal room →"

### Данные для карточки

Запрос к БД должен включать:
```typescript
supabase
  .from('projects')
  .select(`
    id, name, status,
    project_questionnaire!inner(answers),
    ai_reports(report, status)
  `)
  .eq('status', 'approved')
```

Из `project_questionnaire.answers` брать:
- `industry` — отрасль
- `investment_stage` — стадия
- `short_description` — описание
- `investment_amount` — сумма
- `team_size` — размер команды

Из `ai_reports.report` брать: `score`

### Пустое состояние каталога

Если проектов нет:
```tsx
<div className="text-center py-20">
  <p className="text-slate-500 text-lg">Проектов пока нет</p>
  <p className="text-slate-600 text-sm mt-2">Проекты появятся после прохождения модерации</p>
</div>
```

### Шапка каталога

```tsx
<div className="mb-8">
  <h1 className="text-3xl font-bold text-white">Каталог проектов</h1>
  <p className="text-slate-400 mt-2">Проверенные инвестиционные возможности</p>
</div>
```

Фон страницы каталога: `bg-[#0a0a0a] min-h-screen`
Сетка карточек: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4`

## Ограничения

- NO новых npm-зависимостей
- TypeScript strict
- Читать все файлы каталога перед изменением
- Не ломать существующую логику данных — только UI

## Definition of Done

1. npm run build — без ошибок
2. npm run lint — без ошибок
3. /catalog показывает красивые тёмные карточки
4. AI Score отображается там где есть данные
5. Записать в progress.md: DONE: T85 + что создано/изменено
