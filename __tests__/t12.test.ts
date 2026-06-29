import { calcYield } from '@/lib/calc/yield';
import type { CalcResult, CalcScenario } from '@/types';

function makeResult(overrides: Partial<CalcResult> = {}): CalcResult {
  return calcYield(
    overrides.amount ?? 1_000_000,
    overrides.horizon_years ?? 3,
    -30,
    50,
    150
  );
}

describe('T12 calcYield basic structure', () => {
  it('returns a CalcResult with all 3 scenarios', () => {
    const result = calcYield(1_000_000, 3, -30, 50, 150);
    expect(result.pessimistic).toBeDefined();
    expect(result.base).toBeDefined();
    expect(result.optimistic).toBeDefined();
  });

  it('preserves input amount and horizon', () => {
    const result = calcYield(500_000, 5, -30, 50, 150);
    expect(result.amount).toBe(500_000);
    expect(result.horizon_years).toBe(5);
  });
});

describe('T12 scenario labels', () => {
  it('pessimistic label is set', () => {
    const result = calcYield(1_000_000, 3, -30, 50, 150);
    expect(typeof result.pessimistic.label).toBe('string');
    expect(result.pessimistic.label.length).toBeGreaterThan(0);
  });

  it('base label is set', () => {
    const result = calcYield(1_000_000, 3, -30, 50, 150);
    expect(typeof result.base.label).toBe('string');
  });

  it('optimistic label is set', () => {
    const result = calcYield(1_000_000, 3, -30, 50, 150);
    expect(typeof result.optimistic.label).toBe('string');
  });
});

describe('T12 CAGR math — pessimistic (-30%, 3 years)', () => {
  const result = calcYield(1_000_000, 3, -30, 50, 150);
  const s = result.pessimistic;

  it('cagr is set correctly', () => {
    expect(s.cagr).toBe(-30);
  });

  it('total_return = amount × (1 + cagr/100)^years', () => {
    const expected = 1_000_000 * Math.pow(0.7, 3);
    expect(s.total_return).toBeCloseTo(expected, 2);
  });

  it('profit = total_return - amount (negative for loss)', () => {
    expect(s.profit).toBeCloseTo(s.total_return - 1_000_000, 2);
    expect(s.profit).toBeLessThan(0);
  });

  it('return_multiple < 1 for loss scenario', () => {
    expect(s.return_multiple).toBeLessThan(1);
    expect(s.return_multiple).toBeGreaterThan(0);
  });

  it('return_pct is negative', () => {
    expect(s.return_pct).toBeLessThan(0);
  });
});

describe('T12 CAGR math — base (50%, 3 years)', () => {
  const result = calcYield(1_000_000, 3, -30, 50, 150);
  const s = result.base;

  it('cagr is set correctly', () => {
    expect(s.cagr).toBe(50);
  });

  it('total_return = amount × (1.5)^3', () => {
    const expected = 1_000_000 * Math.pow(1.5, 3);
    expect(s.total_return).toBeCloseTo(expected, 2);
  });

  it('profit is positive', () => {
    expect(s.profit).toBeGreaterThan(0);
  });

  it('return_multiple > 1', () => {
    expect(s.return_multiple).toBeGreaterThan(1);
  });

  it('return_pct > 0', () => {
    expect(s.return_pct).toBeGreaterThan(0);
  });
});

describe('T12 CAGR math — optimistic (150%, 3 years)', () => {
  const result = calcYield(1_000_000, 3, -30, 50, 150);
  const s = result.optimistic;

  it('cagr is set correctly', () => {
    expect(s.cagr).toBe(150);
  });

  it('total_return = amount × (2.5)^3', () => {
    const expected = 1_000_000 * Math.pow(2.5, 3);
    expect(s.total_return).toBeCloseTo(expected, 2);
  });

  it('return_multiple is much greater than 1', () => {
    expect(s.return_multiple).toBeGreaterThan(5);
  });
});

describe('T12 ordering: pessimistic < base < optimistic', () => {
  const result = calcYield(1_000_000, 3, -30, 50, 150);

  it('pessimistic total_return < base total_return', () => {
    expect(result.pessimistic.total_return).toBeLessThan(result.base.total_return);
  });

  it('base total_return < optimistic total_return', () => {
    expect(result.base.total_return).toBeLessThan(result.optimistic.total_return);
  });

  it('pessimistic profit < base profit', () => {
    expect(result.pessimistic.profit).toBeLessThan(result.base.profit);
  });
});

describe('T12 different horizon years', () => {
  it('longer horizon amplifies optimistic more than pessimistic', () => {
    const r5 = calcYield(1_000_000, 5, -30, 50, 150);
    const r1 = calcYield(1_000_000, 1, -30, 50, 150);
    const optimisticDiff = r5.optimistic.total_return - r1.optimistic.total_return;
    const pessimisticDiff = r5.pessimistic.total_return - r1.pessimistic.total_return;
    expect(optimisticDiff).toBeGreaterThan(Math.abs(pessimisticDiff));
  });

  it('1 year horizon matches simple formula', () => {
    const result = calcYield(100_000, 1, -30, 50, 150);
    expect(result.pessimistic.total_return).toBeCloseTo(70_000, 2);
    expect(result.base.total_return).toBeCloseTo(150_000, 2);
    expect(result.optimistic.total_return).toBeCloseTo(250_000, 2);
  });
});

describe('T12 different amounts', () => {
  it('doubling amount doubles all returns', () => {
    const r1 = calcYield(500_000, 3, -30, 50, 150);
    const r2 = calcYield(1_000_000, 3, -30, 50, 150);
    expect(r2.base.total_return).toBeCloseTo(r1.base.total_return * 2, 2);
    expect(r2.pessimistic.profit).toBeCloseTo(r1.pessimistic.profit * 2, 2);
  });
});

describe('T12 CalcScenario type fields', () => {
  it('all numeric fields are numbers', () => {
    const result = makeResult();
    const s: CalcScenario = result.base;
    expect(typeof s.cagr).toBe('number');
    expect(typeof s.total_return).toBe('number');
    expect(typeof s.profit).toBe('number');
    expect(typeof s.return_multiple).toBe('number');
    expect(typeof s.return_pct).toBe('number');
  });
});

describe('T12 return_pct consistency', () => {
  it('return_pct = profit / amount * 100', () => {
    const result = calcYield(2_000_000, 4, -30, 50, 150);
    for (const s of [result.pessimistic, result.base, result.optimistic]) {
      const expected = (s.profit / 2_000_000) * 100;
      expect(s.return_pct).toBeCloseTo(expected, 5);
    }
  });
});

describe('T12 return_multiple consistency', () => {
  it('return_multiple = total_return / amount', () => {
    const result = calcYield(1_000_000, 3, -30, 50, 150);
    for (const s of [result.pessimistic, result.base, result.optimistic]) {
      expect(s.return_multiple).toBeCloseTo(s.total_return / 1_000_000, 5);
    }
  });
});
