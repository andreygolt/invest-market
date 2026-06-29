'use client';

import { useState, Suspense } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
    <div className="min-h-screen bg-[#0a0a0a]">
      <div className="container mx-auto max-w-lg px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="mb-6 text-slate-400 hover:text-white">
          <Link href="/portfolio">← Назад к портфелю</Link>
        </Button>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h1 className="text-xl font-semibold text-white mb-5">Зафиксировать инвестицию</h1>
          {/* Дисклеймер */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
            <strong className="font-semibold">Дисклеймер:</strong> Фиксация инвестиции носит информационный характер.
            Платформа не участвует в сделке, не принимает денежные средства и не несёт
            ответственности за инвестиционные решения. Инвестирование в стартапы сопряжено
            с риском полной потери вложений. Сделки заключаются вне платформы.
          </div>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="project-id" className="text-sm text-slate-400">ID проекта</Label>
              <Input
                id="project-id"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder="UUID проекта"
                readOnly={!!projectIdFromQuery}
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount" className="text-sm text-slate-400">Сумма инвестиции (₽)</Label>
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                value={amountInvested}
                onChange={(e) => setAmountInvested(e.target.value)}
                placeholder="1 000 000"
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="date" className="text-sm text-slate-400">Дата инвестиции</Label>
              <Input
                id="date"
                type="date"
                value={dateInvested}
                onChange={(e) => setDateInvested(e.target.value)}
                required
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="instrument" className="text-sm text-slate-400">Инструмент</Label>
              <select
                id="instrument"
                className="w-full border border-slate-700 rounded px-3 py-2 text-sm bg-slate-800 text-slate-300"
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
              <Label htmlFor="deal-status" className="text-sm text-slate-400">Статус сделки</Label>
              <select
                id="deal-status"
                className="w-full border border-slate-700 rounded px-3 py-2 text-sm bg-slate-800 text-slate-300"
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
                <Label htmlFor="exit-amount" className="text-sm text-slate-400">Сумма при выходе (₽)</Label>
                <Input
                  id="exit-amount"
                  type="text"
                  inputMode="numeric"
                  value={exitAmount}
                  onChange={(e) => setExitAmount(e.target.value)}
                  placeholder="2 000 000"
                  className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="notes" className="text-sm text-slate-400">Заметки (необязательно)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Условия, контактные данные, детали сделки..."
                className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" disabled={submitting} className="flex-1 bg-white text-black hover:bg-slate-200">
                {submitting ? 'Сохранение...' : 'Зафиксировать'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => router.push('/portfolio')}
              >
                Отмена
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function AddPortfolioPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center"><p className="text-slate-500">Загрузка...</p></div>}>
      <AddPortfolioForm />
    </Suspense>
  );
}
