import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SearchClient from './search-client';

const ALLOWED_ROLES = ['admin', 'superadmin'];

export default async function SearchPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role as string)) {
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Поиск</h1>
      <SearchClient />
    </div>
  );
}
