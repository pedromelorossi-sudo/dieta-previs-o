import {
  ActivityLevel,
  ExerciseFreq,
  SessionDuration,
  OccupationActivity,
  CommuteActivity,
  HouseholdActivity,
  LeisureActivity,
  StairsUse,
} from "./questionnaire";

export type Sex = "masculino" | "feminino";
export type DietPath = "cutting" | "normocalorico" | "bulking";

export interface BodyCompositionInput {
  weightKg: number;
  heightCm: number;
  bodyFatPercent: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  /** quando informados, o TDEE é calculado por componentes (NEAT + EAT do treino + TEF) em vez do
   * multiplicador único de ACTIVITY_MULTIPLIER — mais preciso porque separa treino intenso de rotina
   * fora do treino, que um multiplicador único não distingue */
  exerciseFreq?: ExerciseFreq;
  sessionDuration?: SessionDuration;
  /** NEAT — quando `dailyStepsAvg` vem preenchido é o sinal primário (mais direto e objetivo que
   * qualquer questionário); senão usa a combinação das 5 dimensões abaixo. Precisão importa muito aqui:
   * bulking magro/cutting natural trabalham com margens de 12-20% sobre o TDEE (ver classifyPathFromBf),
   * então um NEAT mal estimado pode inverter a estratégia sem o usuário perceber. */
  dailyStepsAvg?: number;
  occupationActivity?: OccupationActivity;
  commuteActivity?: CommuteActivity;
  householdActivity?: HouseholdActivity;
  leisureActivity?: LeisureActivity;
  stairsUse?: StairsUse;
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

// custo energético líquido de caminhada em ritmo casual: ~0,5kcal/kg por km (fisiologia do exercício)
// ÷ ~1100 passos/km (passada média ~0,9m) — quando o usuário sabe a própria média de passos/dia, esse é
// o sinal mais direto e objetivo de NEAT que existe, mais confiável que qualquer questionário
const KCAL_PER_STEP_PER_KG = 0.5 / 1100;

function neatFromSteps(dailyStepsAvg: number, weightKg: number): number {
  return dailyStepsAvg * KCAL_PER_STEP_PER_KG * weightKg;
}

// quando o usuário não sabe a contagem de passos, decompõe NEAT em 5 dimensões independentes em vez de
// 1 balde único "rotina sedentária/ativa/pesada" — Levine et al. 2005 (Science, DOI 10.1126/science.1106561)
// mediu que só a diferença de POSTURA/movimento no dia a dia (sem nenhum exercício formal envolvido) já
// explica até ~350kcal/dia entre pessoas magras e obesas de peso comparável, e que isso não muda quando
// a pessoa emagrece ou engorda — ou seja, é uma característica estável do estilo de vida, não do peso,
// o que justifica perguntar diretamente em vez de inferir de "rotina" genérica
const OCCUPATION_NEAT_FACTOR: Record<OccupationActivity, number> = {
  sentado: 0.06,
  alternado: 0.14,
  em_pe_parado: 0.11,
  em_pe_caminhando: 0.24,
  trabalho_pesado: 0.4,
};
const COMMUTE_NEAT_FACTOR: Record<CommuteActivity, number> = {
  sentado: 0,
  caminhada_curta: 0.02,
  caminhada_moderada: 0.05,
  caminhada_longa: 0.09,
};
const HOUSEHOLD_NEAT_FACTOR: Record<HouseholdActivity, number> = {
  baixo: 0,
  medio: 0.03,
  alto: 0.06,
};
const LEISURE_NEAT_FACTOR: Record<LeisureActivity, number> = {
  baixa: 0,
  leve: 0.02,
  moderada: 0.05,
  alta: 0.09,
};
const STAIRS_NEAT_FACTOR: Record<StairsUse, number> = {
  nunca: 0,
  as_vezes: 0.01,
  sempre: 0.03,
};

function neatFromQuestionnaire(
  bmr: number,
  occupationActivity: OccupationActivity,
  commuteActivity: CommuteActivity,
  householdActivity: HouseholdActivity,
  leisureActivity: LeisureActivity,
  stairsUse: StairsUse
): number {
  const factor =
    OCCUPATION_NEAT_FACTOR[occupationActivity] +
    COMMUTE_NEAT_FACTOR[commuteActivity] +
    HOUSEHOLD_NEAT_FACTOR[householdActivity] +
    LEISURE_NEAT_FACTOR[leisureActivity] +
    STAIRS_NEAT_FACTOR[stairsUse];
  return bmr * factor;
}

interface NeatInput {
  dailyStepsAvg?: number;
  occupationActivity?: OccupationActivity;
  commuteActivity?: CommuteActivity;
  householdActivity?: HouseholdActivity;
  leisureActivity?: LeisureActivity;
  stairsUse?: StairsUse;
}

function estimateNeat(bmr: number, weightKg: number, input: NeatInput): number {
  if (input.dailyStepsAvg && input.dailyStepsAvg > 0) {
    return neatFromSteps(input.dailyStepsAvg, weightKg);
  }
  if (input.occupationActivity) {
    return neatFromQuestionnaire(
      bmr,
      input.occupationActivity,
      input.commuteActivity ?? "sentado",
      input.householdActivity ?? "baixo",
      input.leisureActivity ?? "baixa",
      input.stairsUse ?? "nunca"
    );
  }
  // sem passos nem questionário — fallback conservador equivalente à antiga rotina "sedentária"
  return bmr * 0.15;
}

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
  weightKg: number,
  exerciseFreq: ExerciseFreq,
  sessionDuration: SessionDuration | undefined,
  neatInput: NeatInput
) {
  const minutesPerSession = sessionDuration ? SESSION_MINUTES[sessionDuration] : DEFAULT_SESSION_MINUTES;
  const neat = estimateNeat(bmr, weightKg, neatInput);
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
  const {
    weightKg,
    heightCm,
    bodyFatPercent,
    age,
    sex,
    activityLevel,
    exerciseFreq,
    sessionDuration,
    dailyStepsAvg,
    occupationActivity,
    commuteActivity,
    householdActivity,
    leisureActivity,
    stairsUse,
  } = input;
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

  // TDEE por componentes (NEAT detalhado + EAT do treino real, com duração) quando informados — mais
  // preciso que multiplicador único, que não distingue treino intenso de rotina fora do treino
  const tdee = exerciseFreq
    ? estimateTdeeFromComponents(bmr, weightKg, exerciseFreq, sessionDuration, {
        dailyStepsAvg,
        occupationActivity,
        commuteActivity,
        householdActivity,
        leisureActivity,
        stairsUse,
      }).tdee
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
