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
export type DailyRoutine = "sedentaria" | "ativa" | "pesada";
export type SessionDuration = "<30" | "30-60" | "60-90" | "90+";

export const EXERCISE_FREQ_LABEL: Record<ExerciseFreq, string> = {
  "0": "Não treino atualmente",
  "1-2": "1-2x por semana",
  "3-4": "3-4x por semana",
  "5+": "5x ou mais por semana",
};

export const DAILY_ROUTINE_LABEL: Record<DailyRoutine, string> = {
  sedentaria: "Sentado(a) a maior parte do dia (escritório, home office)",
  ativa: "Em pé/caminhando bastante (vendas, professor, etc.)",
  pesada: "Trabalho fisicamente pesado (construção, carga, etc.)",
};

export const SESSION_DURATION_LABEL: Record<SessionDuration, string> = {
  "<30": "Menos de 30 minutos",
  "30-60": "30 a 60 minutos",
  "60-90": "60 a 90 minutos",
  "90+": "Mais de 90 minutos",
};

const EXERCISE_INDEX: Record<ExerciseFreq, number> = { "0": 0, "1-2": 1, "3-4": 2, "5+": 3 };
const ROUTINE_INDEX: Record<DailyRoutine, number> = { sedentaria: 0, ativa: 1, pesada: 3 };
const LEVELS: ActivityLevel[] = ["sedentario", "leve", "moderado", "intenso"];

/** Deriva o nível de atividade (usado no multiplicador de TDEE) a partir de frequência de treino
 * + rotina diária, em vez do usuário escolher um rótulo genérico "moderado" às cegas. */
export function calculateActivityLevel(exercise: ExerciseFreq, routine: DailyRoutine): ActivityLevel {
  const exerciseIdx = EXERCISE_INDEX[exercise];
  const routineIdx = ROUTINE_INDEX[routine];
  let idx = Math.max(exerciseIdx, routineIdx);
  if (exerciseIdx >= 2 && routineIdx >= 1) idx = Math.min(3, idx + 1);
  return LEVELS[idx];
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
