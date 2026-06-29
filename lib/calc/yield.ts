import type { CalcResult, CalcScenario } from '@/types';

function calcScenario(
  label: string,
  amount: number,
  cagr: number,
  horizonYears: number
): CalcScenario {
  const multiplier = Math.pow(1 + cagr / 100, horizonYears);
  const total_return = amount * multiplier;
  const profit = total_return - amount;
  return {
    label,
    cagr,
    total_return,
    profit,
    return_multiple: multiplier,
    return_pct: (profit / amount) * 100,
  };
}

export function calcYield(
  amount: number,
  horizonYears: number,
  pessimisticCagr: number,
  baseCagr: number,
  optimisticCagr: number
): CalcResult {
  return {
    amount,
    horizon_years: horizonYears,
    pessimistic: calcScenario('Пессимистичный', amount, pessimisticCagr, horizonYears),
    base: calcScenario('Базовый', amount, baseCagr, horizonYears),
    optimistic: calcScenario('Оптимистичный', amount, optimisticCagr, horizonYears),
  };
}
