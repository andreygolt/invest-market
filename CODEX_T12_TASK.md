# ТЗ T12 — Калькулятор доходности (3 сценария)

**Дата:** 2026-06-28
**Зависимости:** T11 выполнен (Deal Room работает, FavoritePanel встроен в `/deals/[id]/page.tsx`)
**Тестовых файлов сейчас:** t1 … t11 (11 файлов)
**Размер:** M

---

## Зачем это нужно

Инвесторы хотят быстро понять «а что если я вложу X?». Калькулятор с тремя сценариями
(пессимистичный / базовый / оптимистичный) — чисто образовательный инструмент,
помогает инвестору смоделировать доходность при разных исходах. Платформа не принимает
деньги и не гарантирует доходность — это отображается в обязательном дисклеймере.

Реализация полностью фронтендная: нет новых API-routes, нет новых таблиц/миграций.
Компонент встраивается в Deal Room и получает контекст проекта через props.

---

## Что НЕ делаем в этом этапе

- Не делать портфель инвестора — это T13
- Не делать дашборд инвестора — это T14
- Не трогать `app/(admin)/*`, `app/(project)/*`, `app/(auth)/*`
- Не трогать `__tests__/t1.test.ts` … `__tests__/t11.test.ts`
- Не трогать `lib/supabase/*`, `middleware.ts`, `lib/ai/*`
- Не трогать `app/(investor)/catalog/*`
- Не трогать `app/(investor)/applications/*`
- Не трогать `app/(investor)/favorites/*`
- Не трогать `app/(investor)/deals/[id]/apply/*`
- Не трогать `app/(investor)/deals/[id]/favorite-panel.tsx`
- Не трогать `app/api/*`
- NO новых npm-зависимостей
- NO новых миграций

---

## Контекст

**Deal Room (`app/(investor)/deals/[id]/page.tsx`)** уже существует и рендерит все данные
проекта из `DealRoomProject`. Нам нужно:
1. Создать клиентский компонент `YieldCalculator`
2. Добавить его импорт в `page.tsx`
3. Вставить `<YieldCalculator investmentAsk={deal.investment_ask} />` после карточки
   «Условия инвестирования» (перед карточкой «Стратегия выхода»)

**Метод расчёта — CAGR (Compound Annual Growth Rate):**
```
totalReturn = amount × (1 + cagr/100) ^ horizonYears
profit = totalReturn − amount
returnMultiple = totalReturn / amount
returnPct = profit / amount × 100
```

**3 сценария по умолчанию** (пользователь может менять CAGR):
| Сценарий      | CAGR по умолчанию | Смысл                                  |
|---------------|-------------------|----------------------------------------|
| Пессимистичный | −30% / год       | Компания теряет стоимость, частичный возврат |
| Базовый        | +50% / год       | Умеренный рост компании               |
| Оптимистичный  | +150% / год      | Успешный exit, высокая доходность      |

---

## Шаг 1 — TypeScript типы

Добавить в конец `types/index.ts`:

```typescript
export interface CalcScenario {
  label: string;
  cagr: number; // % в год (может быть отрицательным)
  total_return: number; // итоговая сумма, руб.
  profit: number; // прибыль (< 0 = убыток)
  return_multiple: number; // множитель (e.g. 1.5 = x1.5)
  return_pct: number; // % прибыли/убытка на весь горизонт
}

export interface CalcResult {
  amount: number; // инвестируемая сумма
  horizon_years: number; // горизонт в годах
  pessimistic: CalcScenario;
  base: CalcScenario;
  optimistic: CalcScenario;
}
```

---

## Шаг 2 — Утилита расчёта

Создать `lib/calc/yield.ts`:

```typescript
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
```

---

## Шаг 3 — Клиентский компонент калькулятора

Создать `app/(investor)/deals/[id]/yield-calculator.tsx`:

```typescript
'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { calcYield } from '@/lib/calc/yield';
import type { CalcScenario } from '@/types';

interface YieldCalculatorProps {
  investmentAsk: string | null; // строка из анкеты, используем только для подсказки
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
  const profitColor = isPositive ? 'text-green-600' : 'text-red-600';

  return (
    <div className="grid grid-cols-4 gap-2 py-3 border-b last:border-0 text-sm">
      <div className="font-medium">{scenario.label}</div>
      <div className="text-right">{fmt(scenario.total_return)} ₽</div>
      <div className={`text-right font-medium ${profitColor}`}>
        {isPositive ? '+' : ''}{fmt(scenario.profit)} ₽
      </div>
      <div className={`text-right ${profitColor}`}>
        ×{scenario.return_multiple.toFixed(2)}
        <span className="text-xs text-muted-foreground ml-1">
          ({isPositive ? '+' : ''}{scenario.return_pct.toFixed(0)}%)
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
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(parsed);
    }
  }

  function handleHorizonChange(value: string) {
    const n = parseInt(value, 10);
    if (!isNaN(n) && n >= 1 && n <= 20) setHorizon(n);
  }

  function handleCagrChange(
    value: string,
    setter: (v: number) => void
  ) {
    const n = parseFloat(value.replace(',', '.'));
    if (!isNaN(n)) setter(n);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Калькулятор сценариев доходности</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Обязательный дисклеймер */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <strong>Дисклеймер:</strong> Расчёт носит исключительно образовательный и иллюстративный
          характер. Не является инвестиционной рекомендацией или прогнозом. Платформа не гарантирует
          доходность и не несёт ответственности за инвестиционные решения. Прошлые результаты
          не гарантируют будущих. Инвестирование в стартапы сопряжено с риском полной потери
          вложенных средств. Сделки заключаются вне платформы.
        </div>

        {/* Входные параметры */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label htmlFor="calc-amount">Сумма инвестиции (₽)</Label>
            <Input
              id="calc-amount"
              type="text"
              inputMode="numeric"
              value={amountInput}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="1 000 000"
            />
            {investmentAsk && (
              <p className="text-xs text-muted-foreground">
                Проект запрашивает: {investmentAsk}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="calc-horizon">Горизонт инвестирования (лет)</Label>
            <Input
              id="calc-horizon"
              type="number"
              min={1}
              max={20}
              value={horizon}
              onChange={(e) => handleHorizonChange(e.target.value)}
            />
          </div>
        </div>

        {/* CAGR по сценариям */}
        <div>
          <p className="text-sm font-medium mb-2">CAGR по сценариям (% в год)</p>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="cagr-pess" className="text-xs text-muted-foreground">Пессимистичный</Label>
              <Input
                id="cagr-pess"
                type="number"
                value={pessimisticCagr}
                onChange={(e) => handleCagrChange(e.target.value, setPessimisticCagr)}
                step={5}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cagr-base" className="text-xs text-muted-foreground">Базовый</Label>
              <Input
                id="cagr-base"
                type="number"
                value={baseCagr}
                onChange={(e) => handleCagrChange(e.target.value, setBaseCagr)}
                step={5}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cagr-opt" className="text-xs text-muted-foreground">Оптимистичный</Label>
              <Input
                id="cagr-opt"
                type="number"
                value={optimisticCagr}
                onChange={(e) => handleCagrChange(e.target.value, setOptimisticCagr)}
                step={5}
              />
            </div>
          </div>
        </div>

        {/* Результаты */}
        <div>
          <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground pb-2 border-b">
            <div>Сценарий</div>
            <div className="text-right">Итого</div>
            <div className="text-right">Прибыль/Убыток</div>
            <div className="text-right">Множитель</div>
          </div>
          <ScenarioRow scenario={result.pessimistic} />
          <ScenarioRow scenario={result.base} />
          <ScenarioRow scenario={result.optimistic} />
          <p className="text-xs text-muted-foreground pt-2">
            Инвестировано: {fmt(result.amount)} ₽ · Горизонт: {result.horizon_years} лет
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Шаг 4 — Интеграция в Deal Room

Изменить `app/(investor)/deals/[id]/page.tsx`:

**1. Добавить импорт** в блок существующих импортов (после `import { FavoritePanel } from './favorite-panel';`):
```typescript
import { YieldCalculator } from './yield-calculator';
```

**2. Вставить компонент** в JSX — после карточки «Условия инвестирования» (блок
`{(deal.investment_ask || deal.valuation_pre_money || ...}`) и перед карточкой
«Стратегия выхода» (`{deal.exit_strategy && (`).

Найти в файле строку:
```tsx
      {/* Стратегия выхода */}
```

Вставить **перед ней**:
```tsx
      {/* Калькулятор доходности */}
      <YieldCalculator investmentAsk={deal.investment_ask} />

```

---

## Шаг 5 — Тесты

Создать `__tests__/t12.test.ts`:

```typescript
import { calcYield } from '@/lib/calc/yield';
import type { CalcResult, CalcScenario } from '@/types';

// --- helpers ---

function makeResult(overrides: Partial<CalcResult> = {}): CalcResult {
  return calcYield(
    overrides.amount ?? 1_000_000,
    overrides.horizon_years ?? 3,
    -30,
    50,
    150
  );
}

// --- tests ---

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
    const result = calcYield(1_000_000, 3, -30, 50, 150);
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
```

---

## Команды проверки

```bash
cd "/Users/andrey/Downloads/ИИ АНДРЕЙ/invest_market"
/usr/local/bin/npm run build
/usr/local/bin/npm run lint
/usr/local/bin/npm test
```

---

## Критерии готовности

1. `types/index.ts` — добавлены `CalcScenario`, `CalcResult`
2. `lib/calc/yield.ts` — функция `calcYield` с корректной CAGR-математикой
3. `app/(investor)/deals/[id]/yield-calculator.tsx` — клиентский компонент с 3 сценариями,
   настраиваемым CAGR, горизонтом, суммой и обязательным дисклеймером
4. `app/(investor)/deals/[id]/page.tsx` — добавлен импорт `YieldCalculator` и вставлен
   `<YieldCalculator investmentAsk={deal.investment_ask} />` после блока «Условия инвестирования»
5. `__tests__/t12.test.ts` — все тесты проходят
6. `npm run build` — без ошибок TypeScript
7. `npm run lint` — без ошибок ESLint
8. `npm test` — все тесты проходят (t1 … t12)

---

## Что НЕ трогать

- `lib/supabase/*` — не изменять
- `middleware.ts` — не изменять
- `app/(auth)/*` — не изменять
- `app/(project)/*` — не изменять
- `app/(admin)/*` — не изменять
- `app/api/*` — не изменять
- `app/(investor)/catalog/*` — не изменять
- `app/(investor)/applications/*` — не изменять
- `app/(investor)/favorites/*` — не изменять
- `app/(investor)/deals/[id]/apply/*` — не изменять
- `app/(investor)/deals/[id]/favorite-panel.tsx` — не изменять
- `supabase/migrations/*` — не изменять
- `__tests__/t1.test.ts` … `__tests__/t11.test.ts` — не изменять

---

## Формат отчёта

Добавь в `invest_market/progress.md` после строки `REVIEWED: T11`:

```
DONE: T12
```

И в раздел "Выполненные задачи":

```
### T12 — Калькулятор доходности (3 сценария)
Создано/изменено:
- types/index.ts — добавлены CalcScenario, CalcResult
- lib/calc/yield.ts — функция calcYield (CAGR-калькулятор 3 сценариев)
- app/(investor)/deals/[id]/yield-calculator.tsx — клиентский компонент калькулятора
- app/(investor)/deals/[id]/page.tsx — добавлен YieldCalculator после блока «Условия инвестирования»
- __tests__/t12.test.ts — тесты
```
