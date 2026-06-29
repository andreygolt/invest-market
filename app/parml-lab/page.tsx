type ProjectStage = 'Seed' | 'Pre-Series A' | 'Series A';
type Decision = 'enter' | 'lead' | 'watch' | 'no-trade';

interface DemoProject {
  id: string;
  name: string;
  industry: string;
  stage: ProjectStage;
  ask: number;
  score: number;
  teamSize: number;
  foundedYear: number;
  description: string;
  strengths: string[];
  redFlags: string[];
  status: 'approved' | 'under_review';
}

interface DecisionResult {
  decision: Decision;
  decisionLabel: string;
  recommendedCheck: number;
  expectedEdge: number;
  falsePositiveRisk: number;
  regimeFit: number;
  noTradeReason: string;
}

const projects: DemoProject[] = [
  {
    id: 'aaaaaaaa-0001-0001-0001-000000000001',
    name: 'GreenFlow Energy',
    industry: 'Энергетика',
    stage: 'Series A',
    ask: 120_000_000,
    score: 82,
    teamSize: 24,
    foundedYear: 2021,
    description:
      'Платформа для управления распределенными солнечными станциями с AI-оптимизацией генерации и продажи энергии в сеть.',
    strengths: ['Патентованная технология', 'Контракты с 3 регионами РФ', 'ARR $2.1M, рост 180% г/г'],
    redFlags: ['34% выручки от одного клиента'],
    status: 'approved',
  },
  {
    id: 'aaaaaaaa-0002-0002-0002-000000000002',
    name: 'MedTech Pro',
    industry: 'Медтех',
    stage: 'Seed',
    ask: 45_000_000,
    score: 76,
    teamSize: 12,
    foundedYear: 2022,
    description:
      'AI-система ранней диагностики онкологических заболеваний по анализу крови. Точность 94%, результат за 2 часа.',
    strengths: ['3 патента', 'Пилот в 5 федеральных клиниках', 'Сильная научная команда'],
    redFlags: ['Цикл продаж 6-12 месяцев', 'Регуляторные риски'],
    status: 'approved',
  },
  {
    id: 'aaaaaaaa-0003-0003-0003-000000000003',
    name: 'UrbanFarm AI',
    industry: 'АгроТех',
    stage: 'Pre-Series A',
    ask: 80_000_000,
    score: 71,
    teamSize: 18,
    foundedYear: 2020,
    description:
      'Вертикальные фермы нового поколения с AI-управлением микроклиматом. Урожайность в 40 раз выше традиционного земледелия.',
    strengths: ['Собственный климат-контроль', 'Контракты с X5 и Магнит', 'Окупаемость 3.5 года'],
    redFlags: ['Высокие капзатраты', 'Растущая конкуренция'],
    status: 'approved',
  },
  {
    id: 'aaaaaaaa-0004-0004-0004-000000000004',
    name: 'LogiChain',
    industry: 'Логистика',
    stage: 'Series A',
    ask: 200_000_000,
    score: 88,
    teamSize: 35,
    foundedYear: 2019,
    description:
      'Блокчейн-платформа для прозрачного отслеживания цепочек поставок. Интеграция с 200+ перевозчиками.',
    strengths: ['Выручка $8.4M', 'EBITDA положительная', 'Команда из Яндекс/Mail.ru'],
    redFlags: ['Зависимость от крупных перевозчиков'],
    status: 'approved',
  },
  {
    id: 'aaaaaaaa-0005-0005-0005-000000000005',
    name: 'EduSpace',
    industry: 'EdTech',
    stage: 'Seed',
    ask: 30_000_000,
    score: 64,
    teamSize: 9,
    foundedYear: 2023,
    description:
      'Персонализированная образовательная платформа с AI-тьютором. Адаптирует программу под каждого студента в реальном времени.',
    strengths: ['B2C + B2B подписка', 'Быстрый запуск', 'Понятный продукт'],
    redFlags: ['Еще на проверке', 'Маленькая команда', 'Нет подтвержденного AI-отчета'],
    status: 'under_review',
  },
];

const marketRegimes = [
  { label: 'Капитал', value: '120 млн ₽', detail: 'пилотный лимит портфеля' },
  { label: 'Цель', value: '8-12 сделок', detail: 'портфель, не одна ставка' },
  { label: 'Политика', value: 'No-trade first', detail: 'отказ тоже результат' },
  { label: 'Контроль', value: '30% cap', detail: 'макс. концентрация' },
];

function formatRub(value: number) {
  if (value >= 1_000_000) return `${Math.round(value / 1_000_000)} млн ₽`;
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function stageRisk(stage: ProjectStage) {
  if (stage === 'Seed') return 16;
  if (stage === 'Pre-Series A') return 9;
  return 4;
}

function evaluateProject(project: DemoProject): DecisionResult {
  const redFlagPenalty = project.redFlags.length * 8;
  const underReviewPenalty = project.status === 'under_review' ? 18 : 0;
  const teamBonus = Math.min(10, Math.round(project.teamSize / 4));
  const maturityBonus = Math.min(8, Math.max(0, 2026 - project.foundedYear));
  const capitalDrag = project.ask > 150_000_000 ? 8 : project.ask > 90_000_000 ? 4 : 0;

  const expectedEdge = Math.max(
    0,
    Math.min(100, project.score + teamBonus + maturityBonus - redFlagPenalty - underReviewPenalty - capitalDrag),
  );
  const falsePositiveRisk = Math.max(
    5,
    Math.min(95, stageRisk(project.stage) + redFlagPenalty + underReviewPenalty + capitalDrag - teamBonus),
  );
  const regimeFit = Math.max(0, Math.min(100, expectedEdge - falsePositiveRisk + 35));

  let decision: Decision = 'no-trade';
  if (expectedEdge >= 82 && falsePositiveRisk <= 22) decision = 'lead';
  else if (expectedEdge >= 70 && falsePositiveRisk <= 30) decision = 'enter';
  else if (expectedEdge >= 56 && falsePositiveRisk <= 42) decision = 'watch';

  const baseCheck = decision === 'lead' ? 36_000_000 : decision === 'enter' ? 24_000_000 : decision === 'watch' ? 8_000_000 : 0;
  const recommendedCheck = Math.min(baseCheck, Math.round(project.ask * 0.28));

  const reason =
    decision === 'no-trade'
      ? 'Нет достаточного запаса против false-positive риска.'
      : decision === 'watch'
        ? 'Нужны дополнительные данные перед входом.'
        : decision === 'lead'
          ? 'Лучший кандидат на якорный чек.'
          : 'Можно входить ограниченным чеком.';

  return {
    decision,
    decisionLabel: decision === 'lead' ? 'Lead' : decision === 'enter' ? 'Enter' : decision === 'watch' ? 'Watch' : 'No-trade',
    recommendedCheck,
    expectedEdge,
    falsePositiveRisk,
    regimeFit,
    noTradeReason: reason,
  };
}

const evaluated = projects
  .map((project) => ({ project, result: evaluateProject(project) }))
  .sort((a, b) => b.result.regimeFit - a.result.regimeFit);

const portfolioTotal = evaluated.reduce((sum, item) => sum + item.result.recommendedCheck, 0);
const selectedCount = evaluated.filter((item) => item.result.recommendedCheck > 0).length;

function decisionClass(decision: Decision) {
  if (decision === 'lead') return 'border-emerald-300 bg-emerald-50 text-emerald-800';
  if (decision === 'enter') return 'border-sky-300 bg-sky-50 text-sky-800';
  if (decision === 'watch') return 'border-amber-300 bg-amber-50 text-amber-800';
  return 'border-slate-300 bg-slate-100 text-slate-700';
}

function meterColor(value: number, inverse = false) {
  const good = inverse ? value <= 25 : value >= 70;
  const mid = inverse ? value <= 45 : value >= 50;
  if (good) return 'bg-emerald-500';
  if (mid) return 'bg-amber-500';
  return 'bg-rose-500';
}

function Meter({ label, value, inverse = false }: { label: string; value: number; inverse?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${meterColor(value, inverse)}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function ParmlLabPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f2] text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Invest Market / PARML lab</div>
              <h1 className="mt-3 max-w-4xl text-3xl font-semibold leading-tight md:text-5xl">
                Decision layer для инвестпроектов
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                P34-inspired прототип: проекты рассматриваются как меню экономических действий. Модель выбирает вход,
                размер чека или отказ, учитывая неполные данные и риск ложноположительного AI-score.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[560px]">
              {marketRegimes.map((item) => (
                <div key={item.label} className="border border-slate-200 bg-[#f6f7f2] p-4">
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <div className="mt-1 text-lg font-semibold">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-4 px-5 py-5 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div className="border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold">Портфельное решение</div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-slate-500">Рекомендовано</div>
                <div className="text-2xl font-semibold">{formatRub(portfolioTotal)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Сделок</div>
                <div className="text-2xl font-semibold">{selectedCount}</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <Meter label="Средний fit" value={Math.round(evaluated.reduce((s, i) => s + i.result.regimeFit, 0) / evaluated.length)} />
              <Meter
                label="Средний false-positive risk"
                value={Math.round(evaluated.reduce((s, i) => s + i.result.falsePositiveRisk, 0) / evaluated.length)}
                inverse
              />
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-5">
            <div className="text-sm font-semibold">Как это монетизировать</div>
            <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <p>1. SaaS для фондов и клубов: 99-499 тыс ₽/мес за underwriting cockpit.</p>
              <p>2. Success fee: 1-3% от привлеченного капитала через платформу.</p>
              <p>3. White-label scoring: платная проверка проектов для акселераторов и брокеров.</p>
            </div>
          </div>
        </aside>

        <div className="space-y-3">
          {evaluated.map(({ project, result }) => (
            <article key={project.id} className="border border-slate-200 bg-white p-5">
              <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`border px-2.5 py-1 text-xs font-semibold ${decisionClass(result.decision)}`}>
                      {result.decisionLabel}
                    </span>
                    <span className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                      {project.industry}
                    </span>
                    <span className="border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                      {project.stage}
                    </span>
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold">{project.name}</h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{project.description}</p>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">Сигналы</div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {project.strengths.map((item) => (
                          <li key={item}>+ {item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-rose-700">Риски</div>
                      <ul className="mt-2 space-y-1 text-sm text-slate-600">
                        {project.redFlags.map((item) => (
                          <li key={item}>- {item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 bg-[#f6f7f2] p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">AI score</div>
                      <div className="text-xl font-semibold">{project.score}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Ask</div>
                      <div className="text-xl font-semibold">{formatRub(project.ask)}</div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    <Meter label="Expected edge" value={result.expectedEdge} />
                    <Meter label="False-positive risk" value={result.falsePositiveRisk} inverse />
                    <Meter label="Regime fit" value={result.regimeFit} />
                  </div>
                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <div className="text-xs text-slate-500">Рекомендуемый чек</div>
                    <div className="mt-1 text-2xl font-semibold">{formatRub(result.recommendedCheck)}</div>
                    <div className="mt-2 text-xs leading-5 text-slate-500">{result.noTradeReason}</div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
