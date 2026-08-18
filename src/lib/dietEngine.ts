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

function clampRate(rate: number, maxAbs: number): number {
  return Math.max(-maxAbs, Math.min(maxAbs, rate));
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

/** Passo 2, versão agregada — em vez de retrocalcular o TDEE só do último par de ciclos, usa TODOS
 * os pares consecutivos do histórico (mais o par final até a pesagem de hoje), com peso maior pros
 * mais recentes (TDEE sobe com massa magra ganha, então dado antigo deve pesar menos, não igual).
 * Usa a ingestão REAL relatada (actualKcal) quando difere da prescrita — senão o retrocálculo assume
 * adesão perfeita que pode não ter existido. Pares com menos de 5 dias são ignorados (ruído demais
 * pra taxa semanal fazer sentido). */
export function estimateEmpiricalTdeeSeries(
  historyInput: Cycle[],
  currentWeightKg: number,
  currentDate: string,
  gainComposition: GainComposition
): PredictionRange & { pairsUsed: number } {
  const history = sortByDate(historyInput);
  const scenario = E_SCENARIOS.find((s) => s.key === gainComposition)!;

  const points: { date: string; weightKg: number; intakeKcal: number }[] = history.map((c) => ({
    date: c.date,
    weightKg: c.weightKg,
    intakeKcal: c.actualKcal ?? c.kcal,
  }));
  const lastHistoryCycle = history[history.length - 1];
  if (lastHistoryCycle) {
    points.push({
      date: currentDate,
      weightKg: currentWeightKg,
      intakeKcal: lastHistoryCycle.actualKcal ?? lastHistoryCycle.kcal,
    });
  }

  let weightedMinSum = 0;
  let weightedMaxSum = 0;
  let weightSum = 0;
  let pairsUsed = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const days = daysBetween(prev.date, curr.date);
    if (days < 5) continue;

    const rate = (curr.weightKg - prev.weightKg) / (days / 7);
    const tdeeAtMinE = tdeeFromRate(prev.intakeKcal, rate, scenario.min);
    const tdeeAtMaxE = tdeeFromRate(prev.intakeKcal, rate, scenario.max);

    const weight = i; // mais recente = índice maior = mais peso
    weightedMinSum += Math.min(tdeeAtMinE, tdeeAtMaxE) * weight;
    weightedMaxSum += Math.max(tdeeAtMinE, tdeeAtMaxE) * weight;
    weightSum += weight;
    pairsUsed += 1;
  }

  if (weightSum === 0) {
    // sem pares utilizáveis (ex: só 1 ciclo e o novo peso é no mesmo dia) — cai pro cálculo do último ciclo isolado
    const fallbackIntake = lastHistoryCycle ? lastHistoryCycle.actualKcal ?? lastHistoryCycle.kcal : 0;
    return { min: fallbackIntake, max: fallbackIntake, pairsUsed: 0 };
  }

  return { min: weightedMinSum / weightSum, max: weightedMaxSum / weightSum, pairsUsed };
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
  // taxa observada acima disso não é fisiologicamente plausível como tendência sustentada (é ruído de
  // pesagem/retenção ou intervalo curto demais entre ciclos) — reportamos a taxa real em rateKgWeek pro
  // usuário perceber o problema, mas a projeção de peso/kcal/proteína usa a versão limitada, senão o
  // ruído se multiplica e vira um kcal/proteína absurdo lá na frente
  const MAX_PLAUSIBLE_RATE_KG_WEEK = 2.5;
  const rateForProjection = clampRate(rate, MAX_PLAUSIBLE_RATE_KG_WEEK);

  let tdeeMin: number;
  let tdeeMax: number;
  let usedStabilityMode = false;

  if (input.stabilityMode) {
    tdeeMin = currentIntake;
    tdeeMax = currentIntake;
    usedStabilityMode = true;
  } else {
    const empirical = estimateEmpiricalTdeeSeries(history, input.currentWeightKg, input.currentDate, input.gainComposition);
    tdeeMin = empirical.min;
    tdeeMax = empirical.max;
  }

  const surplusMin = surplusPercent(currentIntake, tdeeMax);
  const surplusMax = surplusPercent(currentIntake, tdeeMin);

  // Passo 5 — projeção de peso (assume manutenção do ritmo atual de superávit)
  const projMin = input.currentWeightKg + rateForProjection * input.weeksToNextConsult;
  const projMax = projMin; // taxa observada é o ponto central; ver nota de incerteza no rodapé da página
  // pequena banda de incerteza (±10% da variação projetada) para refletir que é extrapolação
  const delta = Math.abs(rateForProjection * input.weeksToNextConsult) * 0.15;
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
