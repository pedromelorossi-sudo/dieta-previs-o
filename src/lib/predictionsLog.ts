import { createClient } from "./supabase/client";

export interface LoggedPrediction {
  createdAt: string;
  targetDate: string;
  kcal: { min: number; max: number };
  proteinG: { min: number; max: number };
  fatG: { min: number; max: number };
  carbG: { min: number; max: number };
  weightKg: { min: number; max: number };
}

interface PredictionRow {
  created_at: string;
  target_date: string;
  kcal_min: number;
  kcal_max: number;
  protein_min: number;
  protein_max: number;
  fat_min: number;
  fat_max: number;
  carb_min: number;
  carb_max: number;
  weight_min: number;
  weight_max: number;
}

function rowToPrediction(row: PredictionRow): LoggedPrediction {
  return {
    createdAt: row.created_at,
    targetDate: row.target_date,
    kcal: { min: Number(row.kcal_min), max: Number(row.kcal_max) },
    proteinG: { min: Number(row.protein_min), max: Number(row.protein_max) },
    fatG: { min: Number(row.fat_min), max: Number(row.fat_max) },
    carbG: { min: Number(row.carb_min), max: Number(row.carb_max) },
    weightKg: { min: Number(row.weight_min), max: Number(row.weight_max) },
  };
}

export async function saveLastPrediction(p: LoggedPrediction): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("predictions").upsert({
    user_id: user.id,
    created_at: p.createdAt,
    target_date: p.targetDate,
    kcal_min: p.kcal.min,
    kcal_max: p.kcal.max,
    protein_min: p.proteinG.min,
    protein_max: p.proteinG.max,
    fat_min: p.fatG.min,
    fat_max: p.fatG.max,
    carb_min: p.carbG.min,
    carb_max: p.carbG.max,
    weight_min: p.weightKg.min,
    weight_max: p.weightKg.max,
  });
  if (error) throw error;
}

export async function loadLastPrediction(): Promise<LoggedPrediction | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.from("predictions").select("*").eq("user_id", user.id).maybeSingle();
  if (error) throw error;
  return data ? rowToPrediction(data) : null;
}

export async function clearLastPrediction(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase.from("predictions").delete().eq("user_id", user.id);
  if (error) throw error;
}
