import { createClient } from "./supabase/client";
import { Cycle } from "./types";

interface CycleRow {
  id: string;
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  is_prediction: boolean;
  actual_kcal: number | null;
}

function rowToCycle(row: CycleRow): Cycle {
  return {
    id: row.id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbG: Number(row.carb_g),
    isPrediction: row.is_prediction,
    actualKcal: row.actual_kcal != null ? Number(row.actual_kcal) : null,
  };
}

export async function loadCycles(): Promise<Cycle[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("cycles").select("*").order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToCycle);
}

export async function addCycle(cycle: Cycle): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("cycles").insert({
    id: cycle.id,
    user_id: user.id,
    date: cycle.date,
    weight_kg: cycle.weightKg,
    body_fat_percent: cycle.bodyFatPercent,
    kcal: cycle.kcal,
    protein_g: cycle.proteinG,
    fat_g: cycle.fatG,
    carb_g: cycle.carbG,
    is_prediction: cycle.isPrediction ?? false,
    actual_kcal: cycle.actualKcal ?? null,
  });
  if (error) throw error;
}

export async function deleteCycle(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cycles").delete().eq("id", id);
  if (error) throw error;
}

/** Registra quanto foi realmente comido num ciclo já existente, quando difere do prescrito —
 * usado quando o usuário informa adesão imperfeita ao ciclo anterior, pra não calcular TDEE a
 * partir de calorias que ele não comeu de verdade. */
export async function updateCycleActualKcal(id: string, actualKcal: number): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("cycles").update({ actual_kcal: actualKcal }).eq("id", id);
  if (error) throw error;
}
