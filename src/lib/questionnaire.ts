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

// NEAT (gasto fora do treino formal) — em vez de rótulos subjetivos ("rotina ativa", "atividade
// moderada"), pergunta fatos contáveis (horas, minutos, contagens reais) e deixa o algoritmo concluir o
// nível. Quando o usuário sabe a própria contagem média de passos, essa é a pergunta que decide sozinha
// (sinal mais direto que existe); o orçamento de tempo abaixo só entra quando ele não sabe.
export type StepsKnown = "sim" | "nao";

// Esporte/atividade física regular fora da academia principal — capturado à parte, com frequência e
// duração reais em vez de "quanto de lazer você faz". Catálogo com valores de MET do Compendium of
// Physical Activities (Ainsworth et al. 2011) — ver bodyComposition.ts para os valores e a citação.
export type HasOtherSport = "sim" | "nao";
export type OtherSportActivity =
  | "corrida"
  | "caminhada_rapida"
  | "natacao"
  | "ciclismo"
  | "futebol"
  | "basquete_ou_volei"
  | "tenis_ou_padel"
  | "luta_ou_artes_marciais"
  | "danca"
  | "yoga_ou_pilates"
  | "hiit_ou_crossfit"
  | "outro";

// Intensidade pelo talk test (Reed & Pipe 2014) em vez de autoavaliação ("achei leve/intenso") — o
// usuário relata um fato observável (consegue ou não conversar durante o esforço), não uma opinião.
export type TalkTestIntensity = "consegue_conversar" | "frases_curtas" | "nao_consegue_conversar";

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

export const HAS_OTHER_SPORT_LABEL: Record<HasOtherSport, string> = {
  sim: "Sim",
  nao: "Não",
};

export const OTHER_SPORT_ACTIVITY_LABEL: Record<OtherSportActivity, string> = {
  corrida: "Corrida",
  caminhada_rapida: "Caminhada rápida/recreativa",
  natacao: "Natação",
  ciclismo: "Ciclismo",
  futebol: "Futebol",
  basquete_ou_volei: "Basquete ou vôlei",
  tenis_ou_padel: "Tênis ou padel",
  luta_ou_artes_marciais: "Luta ou artes marciais",
  danca: "Dança",
  yoga_ou_pilates: "Yoga ou pilates",
  hiit_ou_crossfit: "HIIT ou crossfit (fora da academia principal)",
  outro: "Outro",
};

export const TALK_TEST_LABEL: Record<TalkTestIntensity, string> = {
  consegue_conversar: "Consigo conversar normalmente enquanto faço",
  frases_curtas: "Consigo falar só frases curtas, fico ofegante",
  nao_consegue_conversar: "Não consigo conversar, só palavras soltas",
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
