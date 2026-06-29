'use client';

import { useState } from 'react';
import type { PlatformSettings } from '@/types';

const SETTING_META: {
  key: keyof PlatformSettings;
  label: string;
  hint: string;
  type: 'text' | 'email' | 'number';
}[] = [
  {
    key: 'platform_name',
    label: 'Название платформы',
    hint: 'Отображается в заголовках и уведомлениях',
    type: 'text',
  },
  {
    key: 'contact_email',
    label: 'Email поддержки',
    hint: 'Показывается инвесторам и проектам как контакт платформы',
    type: 'email',
  },
  {
    key: 'success_fee_default',
    label: 'Success fee по умолчанию (%)',
    hint: 'Процент успешной комиссии при создании коммерческих условий',
    type: 'number',
  },
  {
    key: 'min_investment_amount',
    label: 'Минимальная сумма заявки (₽)',
    hint: 'Нижняя граница суммы в форме заявки инвестора',
    type: 'number',
  },
  {
    key: 'max_investment_amount',
    label: 'Максимальная сумма заявки (₽)',
    hint: 'Верхняя граница суммы в форме заявки инвестора',
    type: 'number',
  },
  {
    key: 'catalog_page_size',
    label: 'Проектов на страницу в каталоге',
    hint: 'Количество карточек проектов на одной странице каталога',
    type: 'number',
  },
];

interface Props {
  initialSettings: PlatformSettings;
}

export default function SettingsClient({ initialSettings }: Props) {
  const [values, setValues] = useState<PlatformSettings>({ ...initialSettings });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleChange(key: keyof PlatformSettings, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSuccess(false);
    setError(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Ошибка сохранения');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-6">
        <div className="space-y-5">
          {SETTING_META.map(({ key, label, hint, type }) => (
            <div key={key}>
              <label htmlFor={key} className="block text-sm font-medium text-slate-700">
                {label}
              </label>
              <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
              <input
                id={key}
                type={type}
                value={values[key]}
                onChange={(event) => handleChange(key, event.target.value)}
                className="mt-1.5 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
                min={type === 'number' ? 0 : undefined}
              />
            </div>
          ))}
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {success && (
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
          Настройки сохранены
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-slate-900 px-5 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {saving ? 'Сохранение...' : 'Сохранить настройки'}
        </button>
      </div>
    </div>
  );
}
