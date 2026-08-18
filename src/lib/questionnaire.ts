export type DietGoal = "emagrecimento" | "hipertrofia" | "manutencao";
export type ActivityLevel = "sedentario" | "leve" | "moderado" | "intenso";
export type CookingTime = "pouco" | "medio" | "gosta";
export type Restriction = "vegetariano" | "vegano" | "sem_lactose" | "sem_gluten";
export type Sex = "masculino" | "feminino";

export interface UserPreferences {
  sex: Sex | null;
  heightCm: number | null;
  age: number | null;
  dietGoal: DietGoal;
  activityLevel: ActivityLevel;
  mealsPerDay: number;
  cookingTime: CookingTime;
  restrictions: Restriction[];
  dislikedFoodIds: string[];
  favoriteFoodIds: string[];
  notes: string;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  sex: null,
  heightCm: null,
  age: null,
  dietGoal: "manutencao",
  activityLevel: "moderado",
  mealsPerDay: 4,
  cookingTime: "medio",
  restrictions: [],
  dislikedFoodIds: [],
  favoriteFoodIds: [],
  notes: "",
};

export const GOAL_LABEL: Record<DietGoal, string> = {
  emagrecimento: "Emagrecimento",
  hipertrofia: "Hipertrofia / ganho de massa",
  manutencao: "Manutenção",
};

export const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  sedentario: "Sedentário",
  leve: "Leve (1-2x/semana)",
  moderado: "Moderado (3-4x/semana)",
  intenso: "Intenso (5x+/semana)",
};

export type ExerciseFreq = "0" | "1-2" | "3-4" | "5+";
export type SessionDuration = "<30" | "30-60" | "60-90" | "90+";

// NEAT (gasto fora do treino formal) — em vez de 1 pergunta genérica de "rotina diária", decompõe em
// dimensões independentes. Quando o usuário sabe a própria contagem média de passos, essa é a pergunta
// que decide sozinha (sinal mais direto que existe); as outras só entram quando ele não sabe.
export type StepsKnown = "sim" | "nao";
export type OccupationActivity = "sentado" | "alternado" | "em_pe_parado" | "em_pe_caminhando" | "trabalho_pesado";
export type CommuteActivity = "sentado" | "caminhada_curta" | "caminhada_moderada" | "caminhada_longa";
export type HouseholdActivity = "baixo" | "medio" | "alto";
export type LeisureActivity = "baixa" | "leve" | "moderada" | "alta";
export type StairsUse = "nunca" | "as_vezes" | "sempre";

export const EXERCISE_FREQ_LABEL: Record<ExerciseFreq, string> = {
  "0": "Não treino atualmente",
  "1-2": "1-2x por semana",
  "3-4": "3-4x por semana",
  "5+": "5x ou mais por semana",
};

export const SESSION_DURATION_LABEL: Record<SessionDuration, string> = {
  "<30": "Menos de 30 minutos",
  "30-60": "30 a 60 minutos",
  "60-90": "60 a 90 minutos",
  "90+": "Mais de 90 minutos",
};

export const STEPS_KNOWN_LABEL: Record<StepsKnown, string> = {
  sim: "Sim, acompanho (celular/smartwatch)",
  nao: "Não acompanho",
};

export const OCCUPATION_ACTIVITY_LABEL: Record<OccupationActivity, string> = {
  sentado: "Sentado(a) quase o dia todo (escritório, home office, aula)",
  alternado: "Alterno entre sentado e em pé ao longo do dia",
  em_pe_parado: "Em pé a maior parte do tempo, mas parado(a) no mesmo lugar",
  em_pe_caminhando: "Em pé e caminhando bastante (vendas, professor, plantão)",
  trabalho_pesado: "Trabalho fisicamente pesado (construção, carga, mudança)",
};

export const COMMUTE_ACTIVITY_LABEL: Record<CommuteActivity, string> = {
  sentado: "Carro/moto/ônibus sentado o trajeto todo",
  caminhada_curta: "Transporte com até 10min de caminhada no total",
  caminhada_moderada: "Caminho ou pedalo de 10 a 30min por dia",
  caminhada_longa: "Caminho ou pedalo mais de 30min por dia",
};

export const HOUSEHOLD_ACTIVITY_LABEL: Record<HouseholdActivity, string> = {
  baixo: "Pouco (moro com quem faz, ou terceirizo/simplifico bastante)",
  medio: "Médio (limpo, cozinho, faço compras com alguma frequência)",
  alto: "Alto (faço a maior parte das tarefas de casa sozinho(a))",
};

export const LEISURE_ACTIVITY_LABEL: Record<LeisureActivity, string> = {
  baixa: "Quase nenhuma (fora do treino, o resto do tempo é parado)",
  leve: "Leve — caminhada ou esporte casual 1-2x/semana",
  moderada: "Moderada — 3-4x/semana (caminhada, esporte casual, cuidar de criança/pet)",
  alta: "Alta — quase todo dia tem alguma atividade fora do treino formal",
};

export const STAIRS_USE_LABEL: Record<StairsUse, string> = {
  nunca: "Praticamente nunca (elevador/escada rolante)",
  as_vezes: "Às vezes, poucos andares",
  sempre: "Regularmente, vários andares por dia",
};

const EXERCISE_INDEX: Record<ExerciseFreq, number> = { "0": 0, "1-2": 1, "3-4": 2, "5+": 3 };
const OCCUPATION_INDEX: Record<OccupationActivity, number> = {
  sentado: 0,
  alternado: 1,
  em_pe_parado: 1,
  em_pe_caminhando: 2,
  trabalho_pesado: 3,
};
const LEVELS: ActivityLevel[] = ["sedentario", "leve", "moderado", "intenso"];

/** Deriva o nível de atividade (usado no multiplicador de TDEE de fallback) a partir de frequência de
 * treino + ocupação principal do dia, em vez do usuário escolher um rótulo genérico "moderado" às cegas. */
export function calculateActivityLevel(exercise: ExerciseFreq, occupation: OccupationActivity): ActivityLevel {
  const exerciseIdx = EXERCISE_INDEX[exercise];
  const occupationIdx = OCCUPATION_INDEX[occupation];
  let idx = Math.max(exerciseIdx, occupationIdx);
  if (exerciseIdx >= 2 && occupationIdx >= 1) idx = Math.min(3, idx + 1);
  return LEVELS[idx];
}

/** Classificação por faixa de passos/dia — ancorada em dados de acelerômetro por categoria ocupacional
 * (Steeves et al. 2018, J Phys Act Health, DOI 10.1123/jpah.2017-0465): ocupações de baixa atividade
 * (ex: serviços comunitários) ficaram em ~5.700 passos/dia, ocupações de alta atividade (ex: manutenção
 * predial) em ~10.500-11.600. Usado só como rótulo de exibição quando o usuário informa a própria média
 * de passos — o cálculo de NEAT em si já vem direto dos passos, não desse rótulo. */
export function activityLevelFromSteps(steps: number): ActivityLevel {
  if (steps < 5000) return "sedentario";
  if (steps < 7500) return "leve";
  if (steps < 10000) return "moderado";
  return "intenso";
}

export const COOKING_LABEL: Record<CookingTime, string> = {
  pouco: "Pouco tempo — prático e rápido",
  medio: "Tempo médio",
  gosta: "Gosto de cozinhar",
};

export const RESTRICTION_LABEL: Record<Restriction, string> = {
  vegetariano: "Vegetariano",
  vegano: "Vegano",
  sem_lactose: "Sem lactose",
  sem_gluten: "Sem glúten",
};

import { createClient } from "./supabase/client";

interface PreferencesRow {
  sex: Sex | null;
  height_cm: number | null;
  age: number | null;
  diet_goal: DietGoal;
  activity_level: ActivityLevel;
  meals_per_day: number;
  cooking_time: CookingTime;
  restrictions: Restriction[];
  disliked_food_ids: string[];
  favorite_food_ids: string[];
  notes: string;
}

function rowToPreferences(row: PreferencesRow): UserPreferences {
  return {
    sex: row.sex ?? null,
    heightCm: row.height_cm != null ? Number(row.height_cm) : null,
    age: row.age ?? null,
    dietGoal: row.diet_goal,
    activityLevel: row.activity_level,
    mealsPerDay: row.meals_per_day,
    cookingTime: row.cooking_time,
    restrictions: row.restrictions ?? [],
    dislikedFoodIds: row.disliked_food_ids ?? [],
    favoriteFoodIds: row.favorite_food_ids ?? [],
    notes: row.notes ?? "",
  };
}

export async function loadPreferences(): Promise<UserPreferences> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return DEFAULT_PREFERENCES;

  const { data, error } = await supabase.from("preferences").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ? rowToPreferences(data) : DEFAULT_PREFERENCES;
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("preferences").upsert({
    user_id: user.id,
    sex: prefs.sex,
    height_cm: prefs.heightCm,
    age: prefs.age,
    diet_goal: prefs.dietGoal,
    activity_level: prefs.activityLevel,
    meals_per_day: prefs.mealsPerDay,
    cooking_time: prefs.cookingTime,
    restrictions: prefs.restrictions,
    disliked_food_ids: prefs.dislikedFoodIds,
    favorite_food_ids: prefs.favoriteFoodIds,
    notes: prefs.notes,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
