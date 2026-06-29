'use client';

import { useState } from 'react';

interface Props {
  initialEmailEnabled: boolean;
}

export function NotificationPrefsSection({ initialEmailEnabled }: Props) {
  const [emailEnabled, setEmailEnabled] = useState(initialEmailEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleToggle() {
    const next = !emailEnabled;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/profile/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_enabled: next }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error ?? 'Ошибка сохранения');
        return;
      }
      setEmailEnabled(next);
      setSuccess(true);
    } catch {
      setError('Ошибка сети');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="mb-4 text-lg font-semibold text-white">Уведомления по email</h2>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-300">Email-уведомления</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Получать письма при изменении статусов и важных событиях
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={saving}
          role="switch"
          aria-checked={emailEnabled}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none disabled:opacity-50 ${
            emailEnabled ? 'bg-white' : 'bg-slate-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 rounded-full shadow transition-transform ${
              emailEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-slate-400'
            }`}
          />
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
      {success && (
        <p className="mt-3 text-xs text-emerald-400">
          {emailEnabled ? 'Email-уведомления включены' : 'Email-уведомления отключены'}
        </p>
      )}
    </div>
  );
}
