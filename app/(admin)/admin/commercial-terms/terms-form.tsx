'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CommercialTermsRow } from '@/types';

interface TermsFormProps {
  projectId: string;
  terms: CommercialTermsRow | null;
  defaultSuccessFee: number;
}

export function TermsForm({ projectId, terms, defaultSuccessFee }: TermsFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successFeePct, setSuccessFeePct] = useState(
    String(terms?.success_fee_pct ?? defaultSuccessFee)
  );
  const [fixedFee, setFixedFee] = useState(String(terms?.fixed_fee ?? 0));
  const [notes, setNotes] = useState(terms?.notes ?? '');

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    const response = await fetch('/api/admin/commercial-terms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: projectId,
        success_fee_pct: Number(successFeePct),
        fixed_fee: Number(fixedFee),
        notes: notes.trim() ? notes.trim() : null,
      }),
    });

    setIsSaving(false);

    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? 'Не удалось сохранить условия');
      return;
    }

    setIsOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <Button type="button" size="sm" variant="outline" onClick={() => setIsOpen((value) => !value)}>
        Редактировать
      </Button>
      {isOpen ? (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="grid gap-3">
              <Input
                aria-label="Success fee, %"
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={successFeePct}
                onChange={(event) => setSuccessFeePct(event.target.value)}
              />
              <Input
                aria-label="Фиксированная часть, ₽"
                type="number"
                min={0}
                value={fixedFee}
                onChange={(event) => setFixedFee(event.target.value)}
              />
              <Textarea
                aria-label="Заметки"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button type="submit" size="sm" disabled={isSaving}>
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
