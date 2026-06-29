import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-screen flex flex-col justify-between overflow-hidden bg-[#0a0a0a] px-6 py-5 text-white">
      <nav className="relative z-10 flex items-center justify-between">
        <div className="font-semibold text-white">Invest Market</div>
        <Link
          href="/login"
          className="rounded-lg border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:border-slate-400 hover:text-white"
        >
          Войти
        </Link>
      </nav>

      <section className="relative z-10 mx-auto flex max-w-4xl flex-1 items-center justify-center text-center">
        <div className="absolute inset-0 -z-10 flex items-center justify-center">
          <div className="h-[400px] w-[600px] rounded-full bg-white/5 blur-3xl" />
        </div>
        <div>
          <div className="mb-6 text-xs uppercase tracking-widest text-slate-500">
            Закрытая платформа · Только по приглашению
          </div>
          <h1 className="text-4xl font-bold text-white md:text-6xl">
            Инвестиции в проверенные проекты
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
            Каждый проект проходит двойную проверку — AI-андеррайтинг и экспертный анализ опытных аналитиков. Только залоговые сделки с доходностью <span className="text-white font-semibold">24–50% годовых</span>: ваши вложения защищены реальными активами.
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs text-slate-600">
            Доходность указана по историческим данным и не является гарантией будущих результатов.
          </p>

          {/* Три тезиса */}
          <div className="mx-auto mt-8 flex max-w-lg flex-col gap-3 text-left sm:flex-row sm:gap-4">
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 shrink-0">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <div className="text-sm font-medium text-white">Залоговая защита</div>
              </div>
              <div className="mt-1 text-xs text-slate-500 pl-6">Каждая сделка обеспечена залогом</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 shrink-0">
                  <circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
                </svg>
                <div className="text-sm font-medium text-white">AI + аналитики</div>
              </div>
              <div className="mt-1 text-xs text-slate-500 pl-6">Двойная проверка каждого проекта</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400 shrink-0">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <div className="text-sm font-medium text-white">Закрытый доступ</div>
              </div>
              <div className="mt-1 text-xs text-slate-500 pl-6">Только проверенные инвесторы</div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex rounded-lg bg-white px-6 py-2.5 font-medium text-black transition hover:bg-slate-100"
            >
              Войти
            </Link>
            <a
              href="mailto:goltyandrey@gmail.com?subject=Запрос приглашения на Invest Market"
              className="inline-flex rounded-lg border border-slate-700 px-6 py-2.5 font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Получить приглашение
            </a>
            <Link
              href="/apply"
              className="border border-white/30 text-white hover:bg-white/10 px-6 py-3 rounded-lg text-sm font-medium"
            >
              Предложить проект
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-600">Нет приглашения? Оставьте запрос — мы рассмотрим вашу кандидатуру</p>
        </div>
      </section>

      <footer className="relative z-10 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <div>© 2025 Invest Market</div>
        <div>Платформа работает по приглашениям</div>
      </footer>
    </main>
  );
}
