'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ApplyFormProps {
  projectId: string;
  projectName: string;
  investmentAsk: string | null;
  minAmount: number;
  maxAmount: number;
}

export function ApplyForm({ projectId, projectName, investmentAsk, minAmount, maxAmount }: ApplyFormProps) {
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim()) {
      setError('Сообщение обязательно');
      return;
    }

    if (amount) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed < minAmount) {
        setError(`Минимальная сумма заявки — ${minAmount.toLocaleString('ru-RU')} ₽`);
        return;
      }
      if (parsed > maxAmount) {
        setError(`Максимальная сумма заявки — ${maxAmount.toLocaleString('ru-RU')} ₽`);
        return;
      }
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Необходима авторизация');
        return;
      }

      const res = await fetch('/api/investor/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_id: user.id,
          project_id: projectId,
          amount: amount ? parseFloat(amount) : null,
          message: message.trim(),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Ошибка при отправке заявки');
        return;
      }

      router.push('/applications');
    } catch {
      setError('Ошибка сети. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <p className="mb-4 text-sm text-slate-400">
          Проект: <span className="font-medium text-white">{projectName}</span>
          {investmentAsk && (
            <>
              {' '}
              · Запрашивает: <span className="font-medium text-white">{investmentAsk}</span>
            </>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="amount" className="text-sm text-slate-400">
          Сумма инвестиции (опционально, в рублях)
        </Label>
        <Input
          id="amount"
          type="number"
          min={minAmount}
          max={maxAmount}
          step="1000"
          placeholder="Например: 1000000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
          className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        />
        <p className="text-xs text-slate-600">
          Укажите, если хотите обозначить ориентировочную сумму.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="message" className="text-sm text-slate-400">
          Сообщение проекту *
        </Label>
        <Textarea
          id="message"
          placeholder="Расскажите о себе, своём опыте и интересе к проекту..."
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={loading}
          required
          className="border-slate-700 bg-slate-800 text-white placeholder:text-slate-600 focus:border-slate-500"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
        <strong className="font-semibold">Важно:</strong> Заявка носит ознакомительный характер.
        Платформа не является посредником в сделке. Сделки заключаются напрямую между инвестором и
        проектом вне платформы. Доходность не гарантируется. Инвестирование сопряжено с риском
        потери вложенных средств.
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="submit"
          disabled={loading || !message.trim()}
          className="bg-white text-black hover:bg-slate-200"
        >
          {loading ? 'Отправка...' : 'Отправить заявку'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="text-slate-400 hover:text-white"
          onClick={() => router.back()}
          disabled={loading}
        >
          Отмена
        </Button>
      </div>
    </form>
  );
}
