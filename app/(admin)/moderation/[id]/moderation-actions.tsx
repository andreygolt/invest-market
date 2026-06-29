'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface ModerationActionsProps {
  projectId: string;
  projectName: string;
}

const PLACEHOLDER_MODERATOR_ID = '00000000-0000-0000-0000-000000000000';

export function ModerationActions({ projectId, projectName }: ModerationActionsProps) {
  const router = useRouter();
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (!confirm(`Одобрить проект "${projectName}"?`)) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/projects/${projectId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ moderator_id: PLACEHOLDER_MODERATOR_ID }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Ошибка одобрения');
      return;
    }

    router.push('/moderation');
    router.refresh();
  }

  async function handleReject() {
    if (rejectionReason.trim().length < 10) {
      setError('Укажите причину отклонения (минимум 10 символов)');
      return;
    }
    if (!confirm(`Отклонить проект "${projectName}"?`)) return;

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/admin/projects/${projectId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        moderator_id: PLACEHOLDER_MODERATOR_ID,
        rejection_reason: rejectionReason.trim(),
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? 'Ошибка отклонения');
      return;
    }

    router.push('/moderation');
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Решение по проекту</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <Button
            onClick={handleApprove}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700"
          >
            Одобрить проект
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setShowRejectForm(!showRejectForm);
              setError(null);
            }}
            disabled={loading}
          >
            Отклонить проект
          </Button>
        </div>

        {showRejectForm && (
          <div className="space-y-3 pt-2 border-t">
            <div>
              <Label htmlFor="rejection-reason">
                Причина отклонения <span className="text-red-600">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Укажите причину отклонения проекта (минимум 10 символов)..."
                className="mt-1"
                rows={4}
              />
              <p className="text-xs text-slate-500 mt-1">Причина будет видна владельцу проекта</p>
            </div>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={loading || rejectionReason.trim().length < 10}
            >
              Подтвердить отклонение
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
