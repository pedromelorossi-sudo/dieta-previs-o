import { createClient } from "./supabase/client";
import { Cycle, CycleMuscleAssessment } from "./types";

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

interface CycleRow {
  id: string;
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  bf_medido_percent: number | null;
  bf_medido_metodo: string | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  is_prediction: boolean;
  actual_kcal: number | null;
  muscle_assessment: CycleMuscleAssessment[] | null;
  path: string | null;
  origin: "ia" | "consultoria" | "estimativa" | null;
}

function rowToCycle(row: CycleRow): Cycle {
  return {
    id: row.id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    bfMedidoPercent: row.bf_medido_percent != null ? Number(row.bf_medido_percent) : null,
    bfMedidoMetodo: row.bf_medido_metodo ?? null,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbG: Number(row.carb_g),
    isPrediction: row.is_prediction,
    actualKcal: row.actual_kcal != null ? Number(row.actual_kcal) : null,
    muscleAssessment: row.muscle_assessment ?? null,
    path: (row.path as Cycle["path"]) ?? null,
    origin: row.origin ?? null,
  };
}

export async function loadCycles(): Promise<Cycle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", await idDoUsuarioLogado(supabase))
    .order("date", { ascending: true });
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
    bf_medido_percent: cycle.bfMedidoPercent ?? null,
    bf_medido_metodo: cycle.bfMedidoMetodo ?? null,
    kcal: cycle.kcal,
    protein_g: cycle.proteinG,
    fat_g: cycle.fatG,
    carb_g: cycle.carbG,
    is_prediction: cycle.isPrediction ?? false,
    actual_kcal: cycle.actualKcal ?? null,
    muscle_assessment: cycle.muscleAssessment ?? null,
    path: cycle.path ?? null,
    origin: cycle.origin ?? null,
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
