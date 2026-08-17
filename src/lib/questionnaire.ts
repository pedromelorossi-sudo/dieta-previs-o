export type DietGoal = "emagrecimento" | "hipertrofia" | "manutencao";
export type ActivityLevel = "sedentario" | "leve" | "moderado" | "intenso";
export type CookingTime = "pouco" | "medio" | "gosta";
export type Restriction = "vegetariano" | "vegano" | "sem_lactose" | "sem_gluten";

export interface UserPreferences {
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
