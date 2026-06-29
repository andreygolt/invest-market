import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import SettingsClient from './settings-client';
import type { PlatformSettingKey, PlatformSettings } from '@/types';

const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: 'Invest Market',
  contact_email: 'support@invest-market.ru',
  success_fee_default: '5',
  min_investment_amount: '1000000',
  max_investment_amount: '500000000',
  catalog_page_size: '12',
};

type SettingRow = {
  key: string;
  value: string;
};

export default async function SettingsPage() {
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

  if (!profile || profile.role !== 'superadmin') {
    redirect('/');
  }

  const admin = createAdminClient();
  const { data } = await admin.from('platform_settings').select('key, value');

  const settings: PlatformSettings = { ...DEFAULT_SETTINGS };
  for (const row of (data ?? []) as SettingRow[]) {
    settings[row.key as PlatformSettingKey] = row.value;
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold">Настройки платформы</h1>
      <SettingsClient initialSettings={settings} />
    </div>
  );
}
