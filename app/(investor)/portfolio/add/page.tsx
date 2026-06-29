'use client';

import { useState, Suspense } from 'react';
import type { FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PortfolioInstrument, PortfolioDealStatus } from '@/types';

const MOCK_INVESTOR_ID = 'demo-investor-id';

function AddPortfolioForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectIdFromQuery = searchParams.get('project_id') ?? '';

  const [projectId, setProjectId] = useState(projectIdFromQuery);
  const [amountInvested, setAmountInvested] = useState('');
  const [dateInvested, setDateInvested] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [instrument, setInstrument] = useState<PortfolioInstrument>('equity');
  const [dealStatus, setDealStatus] = useState<PortfolioDealStatus>('active');
  const [notes, setNotes] = useState('');
  const [exitAmount, setExitAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseFloat(amountInvested.replace(/\s/g, '').replace(',', '.'));
    if (!projectId.trim() || isNaN(amount) || amount <= 0) {
      setError('Введите корректный ID проекта и сумму инвестиции (> 0)');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        investor_id: MOCK_INVESTOR_ID,
        project_id: projectId.trim(),
        amount_invested: amount,
        date_invested: dateInvested,
        instrument,
        deal_status: dealStatus,
        notes: notes.trim() || null,
        exit_amount:
          dealStatus === 'exited' && exitAmount
            ? parseFloat(exitAmount.replace(/\s/g, '').replace(',', '.'))
            : null,
      };
      const res = await fetch('/api/investor/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Ошибка при сохранении');
      }
      router.push('/portfolio');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Неизвестная ошибка');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Зафиксировать инвестицию</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Дисклеймер */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <strong>Дисклеймер:</strong> Фиксация инвестиции носит информационный характер.
            Платформа не участвует в сделке, не принимает денежные средства и не несёт
            ответственности за инвестиционные решения. Инвестирование в стартапы сопряжено
            с риском полной потери вложений. Сделки заключаются вне платформы.
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="project-id">ID проекта</Label>
              <Input
                id="project-id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID проекта"
                readOnly={!!projectIdFromQuery}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount">Сумма инвестиции (₽)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                value={amountInvested}
                onChange={(e) => setAmountInvested(e.target.value)}
                placeholder="1 000 000"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="date">Дата инвестиции</Label>
              <Input
                id="date"
                type="date"
                value={dateInvested}
                onChange={(e) => setDateInvested(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="instrument">Инструмент</Label>
              <select
                id="instrument"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value as PortfolioInstrument)}
              >
                <option value="equity">Акции (Equity)</option>
                <option value="convertible_note">Конвертируемый займ</option>
                <option value="safe">SAFE</option>
                <option value="debt">Долг</option>
                <option value="other">Другое</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="deal-status">Статус сделки</Label>
              <select
                id="deal-status"
                className="w-full border rounded px-3 py-2 text-sm bg-background"
                value={dealStatus}
                onChange={(e) => setDealStatus(e.target.value as PortfolioDealStatus)}
              >
                <option value="active">Активная</option>
                <option value="exited">Выход</option>
                <option value="written_off">Списана</option>
              </select>
            </div>

            {dealStatus === 'exited' && (
              <div className="space-y-1">
                <Label htmlFor="exit-amount">Сумма при выходе (₽)</Label>
                <Input
                  id="exit-amount"
                  type="text"
                  inputMode="numeric"
                  value={exitAmount}
                  onChange={(e) => setExitAmount(e.target.value)}
                  placeholder="2 000 000"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="notes">Заметки (необязательно)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Условия, контактные данные, детали сделки..."
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1">
                {submitting ? 'Сохранение...' : 'Зафиксировать инвестицию'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/portfolio')}
              >
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AddPortfolioPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground">Загрузка...</div>}>
      <AddPortfolioForm />
    </Suspense>
  );
}
