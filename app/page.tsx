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
            Каждый проект проходит двойную проверку — AI-андеррайтинг и экспертный анализ опытных аналитиков. Только залоговые сделки: ваши вложения защищены реальными активами.
          </p>

          {/* Три тезиса */}
          <div className="mx-auto mt-8 flex max-w-lg flex-col gap-3 text-left sm:flex-row sm:gap-4">
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-sm font-medium text-white">🔒 Залоговая защита</div>
              <div className="mt-1 text-xs text-slate-500">Каждая сделка обеспечена залогом</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-sm font-medium text-white">🤖 AI + аналитики</div>
              <div className="mt-1 text-xs text-slate-500">Двойная проверка каждого проекта</div>
            </div>
            <div className="flex-1 rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3">
              <div className="text-sm font-medium text-white">🎯 Закрытый доступ</div>
              <div className="mt-1 text-xs text-slate-500">Только проверенные инвесторы</div>
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
