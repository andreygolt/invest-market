import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserProfile } from '@/types';
import { ProfileClient } from './profile-client';
import { NotificationPrefsSection } from './notification-prefs-section';

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (!profile) {
    redirect('/login');
  }

  const admin = createAdminClient();
  const { data: prefs } = await admin
    .from('notification_preferences')
    .select('email_enabled')
    .eq('user_id', user.id)
    .single();

  const emailEnabled = prefs?.email_enabled ?? true;

  return (
    <>
      <ProfileClient profile={profile as UserProfile} email={user.email ?? ''} />
      <div className="container mx-auto max-w-3xl px-4 pb-8">
        <NotificationPrefsSection initialEmailEnabled={emailEnabled} />
      </div>
    </>
  );
}
