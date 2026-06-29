'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function PendingPage() {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0a] px-6 text-white">
      <section className="max-w-lg text-center">
        <div className="mb-6 flex justify-center" aria-hidden="true">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-slate-500">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
        </div>
        <h1 className="text-3xl font-semibold">Заявка на рассмотрении</h1>
        <p className="mt-4 text-base leading-7 text-slate-400">
          Администратор проверит вашу заявку и откроет доступ к платформе в ближайшее время.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-8 rounded-lg bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-slate-100"
        >
          Выйти
        </button>
      </section>
    </main>
  );
}
