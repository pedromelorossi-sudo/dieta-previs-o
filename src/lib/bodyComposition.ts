import { ActivityLevel } from "./questionnaire";

export type Sex = "masculino" | "feminino";
export type DietPath = "cutting" | "normocalorico" | "bulking";

export interface BodyCompositionInput {
  weightKg: number;
  heightCm: number;
  bodyFatPercent: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
}

export interface BodyCompositionResult {
  bmi: number;
  leanMassKg: number;
  fatMassKg: number;
  bmrKatch: number;
  bmrMifflin: number;
  bmr: number;
  tdee: number;
  path: DietPath;
  pathReason: string;
  surplusPercent: number;
  targetKcal: number;
  proteinPerKg: number;
  fatPerKg: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};

/** limites de %BF usados para decidir o caminho — faixas de referência aproximadas, não clínicas */
const BF_THRESHOLDS: Record<Sex, { bulkBelow: number; cutAbove: number }> = {
  masculino: { bulkBelow: 10, cutAbove: 17 },
  feminino: { bulkBelow: 18, cutAbove: 25 },
};

export const PATH_LABEL: Record<DietPath, string> = {
  cutting: "Cutting (déficit)",
  normocalorico: "Normocalórico (manutenção)",
  bulking: "Bulking (superávit)",
};

export interface NavyMethodInput {
  sex: Sex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  /** obrigatório para mulheres */
  hipCm?: number;
}

/** Método da Marinha dos EUA — estima %BF a partir de circunferências, não da imagem em si */
export function estimateBfPercentNavy(input: NavyMethodInput): number | null {
  const { sex, heightCm, waistCm, neckCm, hipCm } = input;
  const log10 = Math.log10;

  if (sex === "masculino") {
    if (waistCm <= neckCm) return null;
    const bf = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
    return bf > 0 && bf < 60 ? bf : null;
  }

  if (!hipCm) return null;
  const combined = waistCm + hipCm - neckCm;
  if (combined <= 0) return null;
  const bf = 495 / (1.29579 - 0.35004 * log10(combined) + 0.221 * log10(heightCm)) - 450;
  return bf > 0 && bf < 60 ? bf : null;
}

export function estimateBodyComposition(input: BodyCompositionInput): BodyCompositionResult {
  const { weightKg, heightCm, bodyFatPercent, age, sex, activityLevel } = input;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  const fatMassKg = weightKg - leanMassKg;

  // Katch-McArdle — usa massa magra a partir do %BF, mais preciso quando a composição é conhecida
  const bmrKatch = 370 + 21.6 * leanMassKg;
  // Mifflin-St Jeor — cruza com idade e sexo, útil como checagem independente da estimativa de %BF
  const bmrMifflin = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "masculino" ? 5 : -161);
  // média das duas — reduz o peso de um erro isolado em qualquer uma das estimativas
  const bmr = (bmrKatch + bmrMifflin) / 2;
  const tdee = bmr * ACTIVITY_MULTIPLIER[activityLevel];

  const { bulkBelow, cutAbove } = BF_THRESHOLDS[sex];
  let path: DietPath;
  let pathReason: string;
  let surplusPercent: number;

  if (bodyFatPercent >= cutAbove) {
    path = "cutting";
    pathReason = `%BF (${bodyFatPercent}%) está acima de ${cutAbove}% — priorizar déficit calórico para reduzir gordura antes de buscar mais superávit.`;
    surplusPercent = -0.2;
  } else if (bodyFatPercent < bulkBelow) {
    path = "bulking";
    pathReason = `%BF (${bodyFatPercent}%) está abaixo de ${bulkBelow}% — há margem para superávit calórico com foco em ganho de massa magra.`;
    surplusPercent = 0.12;
  } else {
    path = "normocalorico";
    pathReason = `%BF (${bodyFatPercent}%) está na faixa intermediária (${bulkBelow}–${cutAbove}%) — manutenção é o ponto de partida mais seguro até definir prioridade.`;
    surplusPercent = 0;
  }

  const targetKcal = tdee * (1 + surplusPercent);
  const proteinPerKg = path === "cutting" ? 2.2 : path === "bulking" ? 1.9 : 2.0;
  const fatPerKg = 0.7;
  const targetProteinG = weightKg * proteinPerKg;
  const targetFatG = weightKg * fatPerKg;
  const targetCarbG = Math.max(0, (targetKcal - targetProteinG * 4 - targetFatG * 9) / 4);

  return {
    bmi,
    leanMassKg,
    fatMassKg,
    bmrKatch,
    bmrMifflin,
    bmr,
    tdee,
    path,
    pathReason,
    surplusPercent,
    targetKcal,
    proteinPerKg,
    fatPerKg,
    targetProteinG,
    targetFatG,
    targetCarbG,
  };
}
