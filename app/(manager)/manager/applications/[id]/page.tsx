import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { ApplicationNotes } from '@/components/manager/application-notes';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { AdminApplicationItem, ApplicationNote } from '@/types';
import ApplicationStatusUpdater from './application-status-updater';

type ProjectJoin = { id: string; name: string | null } | { id: string; name: string | null }[] | null;
type UserJoin =
  | { email: string | null; full_name: string | null }
  | { email: string | null; full_name: string | null }[]
  | null;
type ManagerApplication = {
  id: string;
  project_id: string;
  investor_id: string;
  amount: number | null;
  instrument: string | null;
  status: AdminApplicationItem['status'];
  message: string | null;
  created_at: string;
  projects: ProjectJoin;
  users: UserJoin;
};
type UserProfile = {
  role: string;
};
type ApplicationNoteRaw = Omit<ApplicationNote, 'author_email'>;

interface PageProps {
  params: Promise<{ id: string }>;
}

function getProject(projects: ProjectJoin) {
  return (Array.isArray(projects) ? projects[0] : projects) ?? null;
}

function getInvestor(users: UserJoin) {
  return (Array.isArray(users) ? users[0] : users) ?? null;
}

function formatAmount(amount: number | null) {
  if (amount === null) return '-';
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

export default async function ManagerApplicationDetailPage({ params }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { id } = await params;
  const adminSupabase = createAdminClient();

  const { data } = await adminSupabase
    .from('applications')
    .select(
      'id, project_id, investor_id, amount, instrument, status, message, created_at, projects(id, name), users(email, full_name)'
    )
    .eq('id', id)
    .single();

  if (!data) notFound();

  const application = data as ManagerApplication;
  const project = getProject(application.projects);
  const investor = getInvestor(application.users);
  const { data: profileRaw } = await adminSupabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  const profile = profileRaw as UserProfile | null;

  const { data: notesRaw } = await adminSupabase
    .from('application_notes')
    .select('id, application_id, author_id, content, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: true });
  const noteRows = (notesRaw ?? []) as ApplicationNoteRaw[];
  const authorIds = [...new Set(noteRows.map((note) => note.author_id))];
  const emailMap: Record<string, string> = {};

  if (authorIds.length > 0) {
    const { data: authors } = await adminSupabase
      .from('users')
      .select('id, email')
      .in('id', authorIds);

    for (const author of (authors ?? []) as Array<{ id: string | null; email: string | null }>) {
      if (author.id && author.email) emailMap[author.id] = author.email;
    }
  }

  const notes: ApplicationNote[] = noteRows.map((note) => ({
    ...note,
    author_email: emailMap[note.author_id] ?? null,
  }));

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/manager/applications" className="text-sm text-blue-600 hover:underline">
        Назад к заявкам
      </Link>

      <h1 className="text-xl font-semibold">Заявка #{application.id}</h1>

      <div className="space-y-3 rounded-md border bg-white p-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <span className="text-gray-500">Проект</span>
          <span>{project?.name ?? application.project_id}</span>

          <span className="text-gray-500">Инвестор</span>
          <span>{investor?.email ?? application.investor_id}</span>

          <span className="text-gray-500">Сумма</span>
          <span>{formatAmount(application.amount)}</span>

          <span className="text-gray-500">Инструмент</span>
          <span>{application.instrument ?? '-'}</span>

          <span className="text-gray-500">Комментарий</span>
          <span>{application.message ?? '-'}</span>

          <span className="text-gray-500">Статус</span>
          <span>{application.status}</span>

          <span className="text-gray-500">Дата подачи</span>
          <span>{new Date(application.created_at).toLocaleDateString('ru-RU')}</span>
        </div>
      </div>

      {application.status === 'pending' && (
        <ApplicationStatusUpdater applicationId={application.id} />
      )}

      <ApplicationNotes
        applicationId={id}
        initialNotes={notes}
        currentUserId={user.id}
        currentUserRole={profile?.role ?? ''}
      />
    </div>
  );
}
