import { ActivityLevel, ExerciseFreq, DailyRoutine, SessionDuration } from "./questionnaire";

export type Sex = "masculino" | "feminino";
export type DietPath = "cutting" | "normocalorico" | "bulking";

export interface BodyCompositionInput {
  weightKg: number;
  heightCm: number;
  bodyFatPercent: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  /** quando informados, o TDEE é calculado por componentes (NEAT da rotina + EAT do treino + TEF)
   * em vez do multiplicador único de ACTIVITY_MULTIPLIER — mais preciso porque separa treino intenso
   * de rotina sedentária, que um multiplicador único não distingue */
  exerciseFreq?: ExerciseFreq;
  dailyRoutine?: DailyRoutine;
  sessionDuration?: SessionDuration;
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

// NEAT como fração do BMR, só pela rotina fora do treino — um multiplicador único de atividade mistura
// isso com o treino em si, escondendo o caso "treina pesado mas fica sentado o resto do dia"
const NEAT_FACTOR: Record<DailyRoutine, number> = {
  sedentaria: 0.15,
  ativa: 0.3,
  pesada: 0.5,
};

// EAT: sessões por semana × duração real relatada × custo por minuto de musculação (~5kcal/min,
// consistente com a faixa de 200-400kcal/sessão de ~60min já documentada), não um valor fixo por sessão
const SESSIONS_PER_WEEK: Record<ExerciseFreq, number> = {
  "0": 0,
  "1-2": 1.5,
  "3-4": 3.5,
  "5+": 5.5,
};
const SESSION_MINUTES: Record<SessionDuration, number> = {
  "<30": 20,
  "30-60": 45,
  "60-90": 75,
  "90+": 105,
};
const EAT_KCAL_PER_MINUTE = 5;
const DEFAULT_SESSION_MINUTES = 45;
const TEF_FACTOR = 0.1;

function estimateTdeeFromComponents(
  bmr: number,
  exerciseFreq: ExerciseFreq,
  dailyRoutine: DailyRoutine,
  sessionDuration?: SessionDuration
) {
  const minutesPerSession = sessionDuration ? SESSION_MINUTES[sessionDuration] : DEFAULT_SESSION_MINUTES;
  const neat = bmr * NEAT_FACTOR[dailyRoutine];
  const eat = (SESSIONS_PER_WEEK[exerciseFreq] * minutesPerSession * EAT_KCAL_PER_MINUTE) / 7;
  const subtotal = bmr + neat + eat;
  const tef = subtotal * TEF_FACTOR;
  return { neat, eat, tef, tdee: subtotal + tef };
}

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

export interface PathClassification {
  path: DietPath;
  pathReason: string;
  surplusPercent: number;
}

/** Decide a estratégia (cutting/normocalórico/bulking) a partir do %BF atual — usada tanto no primeiro
 * ciclo quanto nos seguintes, já que a estratégia deve refletir a composição corporal de agora, não
 * só a tendência histórica de peso (essa tendência já define os macros específicos separadamente). */
export function classifyPathFromBf(bodyFatPercent: number, sex: Sex): PathClassification {
  const { bulkBelow, cutAbove } = BF_THRESHOLDS[sex];

  if (bodyFatPercent >= cutAbove) {
    return {
      path: "cutting",
      pathReason: `%BF (${bodyFatPercent}%) está acima de ${cutAbove}% — priorizar déficit calórico para reduzir gordura antes de buscar mais superávit.`,
      surplusPercent: -0.2,
    };
  }
  if (bodyFatPercent < bulkBelow) {
    return {
      path: "bulking",
      pathReason: `%BF (${bodyFatPercent}%) está abaixo de ${bulkBelow}% — há margem para superávit calórico com foco em ganho de massa magra.`,
      surplusPercent: 0.12,
    };
  }
  return {
    path: "normocalorico",
    pathReason: `%BF (${bodyFatPercent}%) está na faixa intermediária (${bulkBelow}–${cutAbove}%) — manutenção é o ponto de partida mais seguro até definir prioridade.`,
    surplusPercent: 0,
  };
}

export function estimateBodyComposition(input: BodyCompositionInput): BodyCompositionResult {
  const { weightKg, heightCm, bodyFatPercent, age, sex, activityLevel, exerciseFreq, dailyRoutine, sessionDuration } = input;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  const fatMassKg = weightKg - leanMassKg;

  // Katch-McArdle — usa massa magra a partir do %BF, mais preciso pra quem é magro/musculoso
  const bmrKatch = 370 + 21.6 * leanMassKg;
  // Mifflin-St Jeor — cruza com idade e sexo, mais preciso pra população geral / %BF mais alto
  const bmrMifflin = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "masculino" ? 5 : -161);
  // peso adaptativo entre as duas conforme o %BF lido na foto: Katch-McArdle performa melhor em
  // quem é mais magro (usa a composição real, não só peso total), Mifflin fica melhor conforme o
  // %BF sobe — em vez de sempre fazer 50/50 média cega
  const katchWeight = bodyFatPercent < 15 ? 0.8 : bodyFatPercent < 25 ? 0.6 : 0.4;
  const bmr = bmrKatch * katchWeight + bmrMifflin * (1 - katchWeight);

  // TDEE por componentes (NEAT da rotina + EAT do treino real, com duração) quando informados —
  // mais preciso que multiplicador único, que não distingue treino intenso de rotina sedentária
  const tdee =
    exerciseFreq && dailyRoutine
      ? estimateTdeeFromComponents(bmr, exerciseFreq, dailyRoutine, sessionDuration).tdee
      : bmr * ACTIVITY_MULTIPLIER[activityLevel];

  const { path, pathReason, surplusPercent } = classifyPathFromBf(bodyFatPercent, sex);

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
