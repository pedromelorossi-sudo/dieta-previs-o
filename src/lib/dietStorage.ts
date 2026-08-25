import { createClient } from "./supabase/client";
import { Diet } from "./dietBuilder";

/* FILTRO EXPLÍCITO POR DONO — a RLS é rede de segurança, não filtro de negócio.
 *
 * A política é `auth.uid() = user_id OR is_admin()`. Para usuário comum ela
 * isola corretamente (verificado com JWT real). Para ADMIN ela não isola nada —
 * e essas funções são chamadas nas telas normais, não só no painel. Efeito
 * medido: o administrador abre /previsao-ia, `loadCycles()` traz os ciclos dos
 * alunos, `isFirstCycle` vira false, e o formulário passa a perguntar sobre
 * adesão a um ciclo de OUTRA pessoa. Os gráficos plotam peso alheio como se
 * fosse dele.
 *
 * As variantes `admin*(userId)` logo abaixo existem justamente para o acesso
 * cruzado ser explícito. Aqui o dono é sempre quem está logado. */
async function idDoUsuarioLogado(supabase: ReturnType<typeof createClient>): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");
  return user.id;
}

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
  const { data, error } = await supabase
    .from("diets")
    .select("*")
    .eq("user_id", await idDoUsuarioLogado(supabase))
    .order("created_at", { ascending: false });
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

export async function loadDietById(id: string): Promise<Diet | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("diets").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? rowToDiet(data) : null;
}

/** Atualiza uma dieta pelo id sem tocar em user_id — usada pelo admin editando a dieta de outro
 * usuário (upsertDiet reatribuiria a dieta ao admin, já que sempre grava user_id = usuário logado). */
export async function adminUpdateDiet(diet: Diet): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("diets")
    .update({
      name: diet.name,
      target_kcal: diet.targetKcal,
      target_protein_g: diet.targetProteinG,
      target_fat_g: diet.targetFatG,
      target_carb_g: diet.targetCarbG,
      meals: diet.meals,
      updated_at: new Date().toISOString(),
    })
    .eq("id", diet.id);
  if (error) throw error;
}
