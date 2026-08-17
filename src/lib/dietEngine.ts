import { Cycle, GainComposition } from "./types";

export const E_SCENARIOS: { key: GainComposition; label: string; min: number; max: number }[] = [
  { key: "musculo", label: "Ganho quase todo músculo", min: 1800, max: 1800 },
  { key: "misto", label: "Ganho misto (favorável)", min: 5000, max: 5500 },
  { key: "gordura", label: "Ganho quase todo gordura", min: 7700, max: 7700 },
];

export function sortByDate(cycles: Cycle[]): Cycle[] {
  return [...cycles].sort((a, b) => a.date.localeCompare(b.date));
}

export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(b - a) / (1000 * 60 * 60 * 24);
}

/** Passo 1 — taxa de variação de peso, kg/semana */
export function weeklyRate(currentWeightKg: number, currentDate: string, prev: Cycle): number {
  const days = daysBetween(prev.date, currentDate);
  if (days <= 0) return 0;
  return (currentWeightKg - prev.weightKg) / (days / 7);
}

/** Passo 2 — TDEE empírico retrocalculado a partir da taxa e de E */
export function tdeeFromRate(prevIntakeKcal: number, rateKgWeek: number, E: number): number {
  return prevIntakeKcal - (rateKgWeek * E) / 7;
}

/** Passo 3 — superávit relativo sobre a manutenção estimada */
export function surplusPercent(kcal: number, tdee: number): number {
  if (tdee <= 0) return 0;
  return kcal / tdee - 1;
}

export interface ExtractedRules {
  fatPerKg: number;
  proteinPerKg: number;
  proteinStepSuspected: boolean;
  kcalPerKgSeries: { date: string; value: number }[];
  kcalPerKgLast: number;
  kcalPerKgAvgStep: number;
  kcalPerKgExtrapolated: number;
}

/** Passo 4 — extrai as regras de macro a partir do histórico ordenado por data */
export function extractRules(cyclesInput: Cycle[]): ExtractedRules {
  const cycles = sortByDate(cyclesInput);
  const last = cycles[cycles.length - 1];

  const kcalPerKgSeries = cycles.map((c) => ({ date: c.date, value: c.kcal / c.weightKg }));
  const steps: number[] = [];
  for (let i = 1; i < kcalPerKgSeries.length; i++) {
    steps.push(kcalPerKgSeries[i].value - kcalPerKgSeries[i - 1].value);
  }
  const avgStep = steps.length ? steps.reduce((a, b) => a + b, 0) / steps.length : 0;
  const kcalPerKgLast = kcalPerKgSeries.length ? kcalPerKgSeries[kcalPerKgSeries.length - 1].value : 0;

  const proteinSeries = cycles.map((c) => c.proteinG / c.weightKg);
  const proteinSteps: number[] = [];
  for (let i = 1; i < proteinSeries.length; i++) {
    proteinSteps.push(proteinSeries[i] - proteinSeries[i - 1]);
  }
  const lastProteinStep = proteinSteps.length ? proteinSteps[proteinSteps.length - 1] : 0;

  return {
    fatPerKg: last ? last.fatG / last.weightKg : 0.6,
    proteinPerKg: proteinSeries.length ? proteinSeries[proteinSeries.length - 1] : 2.1,
    proteinStepSuspected: lastProteinStep > 0.01,
    kcalPerKgSeries,
    kcalPerKgLast,
    kcalPerKgAvgStep: avgStep,
    kcalPerKgExtrapolated: kcalPerKgLast + avgStep,
  };
}

export interface PredictionRange {
  min: number;
  max: number;
}

export interface PredictionInput {
  history: Cycle[];
  currentWeightKg: number;
  currentDate: string;
  weeksToNextConsult: number;
  gainComposition: GainComposition;
  /** modo estabilidade: peso ficou parado por 2-3 semanas na ingestão atual */
  stabilityMode: boolean;
  /** intake atualmente seguido; default = kcal do último ciclo */
  currentIntakeOverride?: number;
  /** aplica degrau de +0.1 g/kg na proteína prevista */
  applyProteinStep?: boolean;
}

export interface PredictionResult {
  rateKgWeek: number;
  tdeeRange: PredictionRange;
  surplusPercentRange: PredictionRange;
  projectedWeightRange: PredictionRange;
  rules: ExtractedRules;
  kcalRange: PredictionRange;
  proteinPerKgUsed: number;
  proteinRange: PredictionRange;
  fatPerKgUsed: number;
  fatRange: PredictionRange;
  carbRange: PredictionRange;
  usedStabilityMode: boolean;
}

/** Passos 1, 2, 3, 5 e 6 combinados */
export function predictNextCycle(input: PredictionInput): PredictionResult | null {
  const history = sortByDate(input.history);
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  const currentIntake = input.currentIntakeOverride ?? last.kcal;

  const rate = weeklyRate(input.currentWeightKg, input.currentDate, last);

  let tdeeMin: number;
  let tdeeMax: number;
  let usedStabilityMode = false;

  if (input.stabilityMode) {
    tdeeMin = currentIntake;
    tdeeMax = currentIntake;
    usedStabilityMode = true;
  } else {
    const scenario = E_SCENARIOS.find((s) => s.key === input.gainComposition)!;
    const tdeeAtMinE = tdeeFromRate(last.kcal, rate, scenario.min);
    const tdeeAtMaxE = tdeeFromRate(last.kcal, rate, scenario.max);
    tdeeMin = Math.min(tdeeAtMinE, tdeeAtMaxE);
    tdeeMax = Math.max(tdeeAtMinE, tdeeAtMaxE);
  }

  const surplusMin = surplusPercent(currentIntake, tdeeMax);
  const surplusMax = surplusPercent(currentIntake, tdeeMin);

  // Passo 5 — projeção de peso (assume manutenção do ritmo atual de superávit)
  const projMin = input.currentWeightKg + rate * input.weeksToNextConsult;
  const projMax = projMin; // taxa observada é o ponto central; ver nota de incerteza no rodapé da página
  // pequena banda de incerteza (±10% da variação projetada) para refletir que é extrapolação
  const delta = Math.abs(rate * input.weeksToNextConsult) * 0.15;
  const projectedWeightRange: PredictionRange = { min: projMin - delta, max: projMax + delta };

  const rules = extractRules(history);
  const proteinPerKg = rules.proteinPerKg + (input.applyProteinStep ? 0.1 : 0);
  const fatPerKg = rules.fatPerKg;
  const kcalPerKg = rules.kcalPerKgExtrapolated;

  const kcalRange: PredictionRange = {
    min: projectedWeightRange.min * kcalPerKg,
    max: projectedWeightRange.max * kcalPerKg,
  };
  const proteinRange: PredictionRange = {
    min: projectedWeightRange.min * proteinPerKg,
    max: projectedWeightRange.max * proteinPerKg,
  };
  const fatRange: PredictionRange = {
    min: projectedWeightRange.min * fatPerKg,
    max: projectedWeightRange.max * fatPerKg,
  };
  const carbRange: PredictionRange = {
    min: (kcalRange.min - proteinRange.max * 4 - fatRange.max * 9) / 4,
    max: (kcalRange.max - proteinRange.min * 4 - fatRange.min * 9) / 4,
  };

  return {
    rateKgWeek: rate,
    tdeeRange: { min: tdeeMin, max: tdeeMax },
    surplusPercentRange: { min: surplusMin, max: surplusMax },
    projectedWeightRange,
    rules,
    kcalRange,
    proteinPerKgUsed: proteinPerKg,
    proteinRange,
    fatPerKgUsed: fatPerKg,
    fatRange,
    carbRange,
    usedStabilityMode,
  };
}
