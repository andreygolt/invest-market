import { createAdminClient } from '@/lib/supabase/admin';
import type { PlatformSettingKey, PlatformSettings } from '@/types';

export const DEFAULT_SETTINGS: PlatformSettings = {
  platform_name: 'Invest Market',
  contact_email: 'support@invest-market.ru',
  success_fee_default: '5',
  min_investment_amount: '1000000',
  max_investment_amount: '500000000',
  catalog_page_size: '12',
};

/**
 * Возвращает все настройки платформы.
 * При ошибке БД или пустой таблице возвращает DEFAULT_SETTINGS.
 */
export async function getSettings(): Promise<PlatformSettings> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from('platform_settings').select('key, value');

    if (error || !data || data.length === 0) {
      return { ...DEFAULT_SETTINGS };
    }

    const settings: PlatformSettings = { ...DEFAULT_SETTINGS };
    for (const row of data) {
      settings[row.key as PlatformSettingKey] = row.value;
    }
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Возвращает одну настройку как число. При ошибке — дефолт. */
export function settingAsNumber(
  settings: PlatformSettings,
  key: PlatformSettingKey,
  fallback: number
): number {
  const num = Number(settings[key]);
  return Number.isNaN(num) || num <= 0 ? fallback : num;
}
