import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import ExportPageClient from '@/app/(admin)/export/export-page-client';

export default async function AdminExportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Экспорт данных</h1>
      <ExportPageClient />
    </div>
  );
}
