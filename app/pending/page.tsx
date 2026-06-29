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
        <div className="mb-6 text-5xl" aria-hidden="true">
          ⏳
        </div>
        <h1 className="text-3xl font-semibold">Заявка на рассмотрении</h1>
        <p className="mt-4 text-base leading-7 text-slate-400">
          Администратор проверит вашу заявку и откроет доступ к платформе. Обычно это занимает 1-2
          рабочих дня.
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
