import { createClient } from "./supabase/client";
import { Diet } from "./dietBuilder";

interface DietRow {
  id: string;
  name: string;
  created_at: string;
  target_kcal: number;
  target_protein_g: number;
  target_fat_g: number;
  target_carb_g: number;
  meals: Diet["meals"];
}

function rowToDiet(row: DietRow): Diet {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    targetKcal: Number(row.target_kcal),
    targetProteinG: Number(row.target_protein_g),
    targetFatG: Number(row.target_fat_g),
    targetCarbG: Number(row.target_carb_g),
    meals: row.meals,
  };
}

export async function loadDiets(): Promise<Diet[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("diets").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDiet);
}

export async function upsertDiet(diet: Diet): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("diets").upsert({
    id: diet.id,
    user_id: user.id,
    name: diet.name,
    target_kcal: diet.targetKcal,
    target_protein_g: diet.targetProteinG,
    target_fat_g: diet.targetFatG,
    target_carb_g: diet.targetCarbG,
    meals: diet.meals,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteDiet(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("diets").delete().eq("id", id);
  if (error) throw error;
}
