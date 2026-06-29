# T81 — Красивый лендинг (главная страница)

## Контекст

Сейчас `app/page.tsx` либо редиректит на логин либо показывает пустую страницу.
Нужна красивая главная страница — 1 экран, без скролла, тёмная тема, минималистичный премиум-дизайн.

## Что нужно создать

### Перезаписать `app/page.tsx`

Публичная страница (не требует авторизации). Если пользователь уже залогинен — редирект на `/dashboard`.

Дизайн:
- Фон: тёмный (#0a0a0a)
- Полный экран (min-h-screen flex flex-col justify-between)

Структура сверху вниз:

[Навбар]
- Логотип слева: "Invest Market" (белый, font-semibold)
- Кнопка справа: "Войти" (border border-slate-600 text-slate-300, маленькая, ведёт на /login)

[Hero — центр экрана, text-center]
- Бейдж: маленький текст "Закрытая платформа · Только по приглашению" (text-xs uppercase tracking-widest text-slate-500, mb-6)
- Заголовок: "Инвестиции в проверенные проекты" (text-4xl md:text-6xl font-bold text-white)
- Подзаголовок: "Закрытый маркет с AI-андеррайтингом. Каждый проект проходит глубокую проверку перед допуском к инвесторам." (text-slate-400 text-lg max-w-xl mx-auto mt-4)
- Декоративный blur за hero: div.absolute.inset-0 с div w-[600px] h-[400px] bg-white/5 rounded-full blur-3xl mx-auto
- Кнопка "Войти" (bg-white text-black hover:bg-slate-100 px-6 py-2.5 rounded-lg font-medium, ведёт на /login)

[Футер — низ]
- "© 2025 Invest Market" слева
- "Платформа работает по приглашениям" справа
- text-xs text-slate-500

### Проверить app/login/page.tsx

Прочитать файл. Если существует — не трогать. Если нет — создать страницу с формой email+password, тёмный стиль.

## Ограничения

- NO новых npm-зависимостей
- Только Tailwind CSS
- TypeScript strict
- Читать app/page.tsx перед изменением

## Definition of Done

1. npm run build — без ошибок
2. npm run lint — без ошибок
3. http://localhost:3000 показывает красивый тёмный лендинг
4. Кнопка "Войти" ведёт на /login
5. Записать в progress.md: DONE: T81 + что создано/изменено
