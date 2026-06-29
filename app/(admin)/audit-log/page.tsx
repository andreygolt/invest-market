import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AuditLogClient from './audit-log-client';

export default async function AdminAuditLogPage() {
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

  if (!profile || !['admin', 'superadmin'].includes(profile.role as string)) {
    redirect('/');
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Журнал действий</h1>
      <AuditLogClient />
    </div>
  );
}
