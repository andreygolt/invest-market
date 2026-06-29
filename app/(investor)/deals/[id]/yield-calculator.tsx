'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcYield } from '@/lib/calc/yield';
import type { CalcScenario } from '@/types';

interface YieldCalculatorProps {
  investmentAsk: string | null;
}

const DEFAULT_AMOUNT = 1_000_000;
const DEFAULT_HORIZON = 3;
const DEFAULT_PESSIMISTIC_CAGR = -30;
const DEFAULT_BASE_CAGR = 50;
const DEFAULT_OPTIMISTIC_CAGR = 150;

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

function ScenarioRow({ scenario }: { scenario: CalcScenario }) {
  const isPositive = scenario.profit >= 0;
  const profitColor = isPositive ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="grid grid-cols-4 gap-2 py-3 border-b border-slate-800 last:border-0 text-sm text-slate-300">
      <div className="font-medium text-white">{scenario.label}</div>
      <div className="text-right">{fmt(scenario.total_return)} ₽</div>
      <div className={`text-right font-medium ${profitColor}`}>
        {isPositive ? '+' : ''}
        {fmt(scenario.profit)} ₽
      </div>
      <div className={`text-right ${profitColor}`}>
        ×{scenario.return_multiple.toFixed(2)}
        <span className="text-xs text-slate-500 ml-1">
          ({isPositive ? '+' : ''}
          {scenario.return_pct.toFixed(0)}%)
        </span>
      </div>
    </div>
  );
}

export function YieldCalculator({ investmentAsk }: YieldCalculatorProps) {
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [amountInput, setAmountInput] = useState(String(DEFAULT_AMOUNT));
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [pessimisticCagr, setPessimisticCagr] = useState(DEFAULT_PESSIMISTIC_CAGR);
  const [baseCagr, setBaseCagr] = useState(DEFAULT_BASE_CAGR);
  const [optimisticCagr, setOptimisticCagr] = useState(DEFAULT_OPTIMISTIC_CAGR);

  const result = useMemo(
    () => calcYield(amount, horizon, pessimisticCagr, baseCagr, optimisticCagr),
    [amount, horizon, pessimisticCagr, baseCagr, optimisticCagr]
  );

  function handleAmountChange(value: string) {
    setAmountInput(value);
    const parsed = parseFloat(value.replace(/\s/g, '').replace(',', '.'));
    if (!Number.isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  }

  function handleHorizonChange(value: string) {
    const n = parseInt(value, 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 20) setHorizon(n);
  }

  function handleCagrChange(value: string, setter: (v: number) => void) {
    const n = parseFloat(value.replace(',', '.'));
    if (!Number.isNaN(n)) setter(n);
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Калькулятор сценариев доходности</h2>
      <div className="space-y-5">
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <strong>Дисклеймер:</strong> Расчёт носит исключительно образовательный и иллюстративный
          характер. Не является инвестиционной рекомендацией или прогнозом. Платформа не гарантирует
          доходность и не несёт ответственности за инвестиционные решения. Прошлые результаты не
          гарантируют будущих. Инвестирование в стартапы сопряжено с риском полной потери вложенных
          средств. Сделки заключаются вне платформы.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="calc-amount" className="text-slate-400">
              Сумма инвестиции (₽)
            </Label>
            <Input
              id="calc-amount"
              type="text"
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="1 000 000"
              className="border-slate-700 bg-slate-950 text-slate-200 placeholder:text-slate-600 focus:ring-slate-600"
            />
            {investmentAsk && (
              <p className="text-xs text-slate-500">Проект запрашивает: {investmentAsk}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="calc-horizon" className="text-slate-400">
              Горизонт инвестирования (лет)
            </Label>
            <Input
              id="calc-horizon"
              type="number"
              min={1}
              max={20}
              value={horizon}
              onChange={(e) => handleHorizonChange(e.target.value)}
              className="border-slate-700 bg-slate-950 text-slate-200 focus:ring-slate-600"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-400 mb-2">CAGR по сценариям (% в год)</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cagr-pess" className="text-xs text-slate-500">
                Пессимистичный
              </Label>
              <Input
                id="cagr-pess"
                type="number"
                value={pessimisticCagr}
                onChange={(e) => handleCagrChange(e.target.value, setPessimisticCagr)}
                step={5}
                className="border-slate-700 bg-slate-950 text-slate-200 focus:ring-slate-600"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cagr-base" className="text-xs text-slate-500">
                Базовый
              </Label>
              <Input
                id="cagr-base"
                type="number"
                value={baseCagr}
                onChange={(e) => handleCagrChange(e.target.value, setBaseCagr)}
                step={5}
                className="border-slate-700 bg-slate-950 text-slate-200 focus:ring-slate-600"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cagr-opt" className="text-xs text-slate-500">
                Оптимистичный
              </Label>
              <Input
                id="cagr-opt"
                type="number"
                value={optimisticCagr}
                onChange={(e) => handleCagrChange(e.target.value, setOptimisticCagr)}
                step={5}
                className="border-slate-700 bg-slate-950 text-slate-200 focus:ring-slate-600"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium text-slate-500 pb-2 border-b border-slate-800">
            <div>Сценарий</div>
            <div className="text-right">Итого</div>
            <div className="text-right">Прибыль/Убыток</div>
            <div className="text-right">Множитель</div>
          </div>
          <ScenarioRow scenario={result.pessimistic} />
          <ScenarioRow scenario={result.base} />
          <ScenarioRow scenario={result.optimistic} />
          <p className="text-xs text-slate-500 pt-2">
            Инвестировано: {fmt(result.amount)} ₽ · Горизонт: {result.horizon_years} лет
          </p>
        </div>
      </div>
    </section>
  );
}
