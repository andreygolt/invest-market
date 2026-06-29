'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';

interface Props {
  applicationId: string;
}

export default function ApplicationStatusUpdater({ applicationId }: Props) {
  const [loading, setLoading] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const router = useRouter();

  async function updateStatus(status: 'approved' | 'rejected' | 'cancelled', reason?: string) {
    setLoading(true);
    const response = await fetch(`/api/admin/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        ...(reason ? { rejection_reason: reason } : {}),
      }),
    });

    if (response.ok) {
      router.refresh();
    } else {
      const body = (await response.json()) as { error?: string };
      alert(body.error ?? 'Ошибка обновления статуса');
    }

    setLoading(false);
  }

  if (showRejectForm) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Причина отклонения (необязательно):</p>
        <textarea
          value={rejectionReason}
          onChange={(e) => setRejectionReason(e.target.value)}
          placeholder="Укажите причину отклонения заявки..."
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
        />
        <div className="flex gap-2">
          <Button
            onClick={() => void updateStatus('rejected', rejectionReason || undefined)}
            disabled={loading}
            variant="destructive"
            size="sm"
          >
            {loading ? 'Отклоняем...' : 'Подтвердить отклонение'}
          </Button>
          <Button
            onClick={() => {
              setShowRejectForm(false);
              setRejectionReason('');
            }}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            Отмена
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Изменить статус:</p>
      <div className="flex gap-2">
        <Button onClick={() => void updateStatus('approved')} disabled={loading} size="sm">
          Одобрить
        </Button>
        <Button
          onClick={() => setShowRejectForm(true)}
          disabled={loading}
          variant="destructive"
          size="sm"
        >
          Отклонить
        </Button>
        <Button
          onClick={() => void updateStatus('cancelled')}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          Отменить
        </Button>
      </div>
    </div>
  );
}
