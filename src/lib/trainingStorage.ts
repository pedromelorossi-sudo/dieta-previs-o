import { createClient } from "./supabase/client";
import { TrainingProgram, TrainingSession, TrainingLog, LoggedSetEntry } from "./trainingBuilder";

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

interface TrainingProgramRow {
  id: string;
  name: string;
  sessions: TrainingSession[];
  created_at: string;
}

function rowToProgram(row: TrainingProgramRow): TrainingProgram {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    sessions: row.sessions ?? [],
  };
}

export async function loadTrainingPrograms(): Promise<TrainingProgram[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_programs")
    .select("*")
    .eq("user_id", await idDoUsuarioLogado(supabase))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProgram);
}

/* ── acesso do administrador ──
 *
 * As funções acima operam sempre sobre o usuário logado (`auth.uid()`). O admin
 * precisa ler e escrever o programa de OUTRA pessoa, então recebe o `userId`
 * explicitamente. A RLS continua sendo quem autoriza: se quem chamar não for
 * admin, o Postgres recusa — a checagem não fica só no cliente. */

export async function adminLoadTrainingPrograms(userId: string): Promise<TrainingProgram[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_programs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToProgram);
}

export async function adminUpsertTrainingProgram(userId: string, program: TrainingProgram): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("training_programs").upsert({
    id: program.id,
    user_id: userId,
    name: program.name,
    sessions: program.sessions,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function upsertTrainingProgram(program: TrainingProgram): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("training_programs").upsert({
    id: program.id,
    user_id: user.id,
    name: program.name,
    sessions: program.sessions,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteTrainingProgram(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("training_programs").delete().eq("id", id);
  if (error) throw error;
}

interface TrainingLogRow {
  id: string;
  program_id: string | null;
  date: string;
  session_label: string;
  sets_logged: LoggedSetEntry[];
  injury_note: string | null;
}

function rowToLog(row: TrainingLogRow): TrainingLog {
  return {
    id: row.id,
    programId: row.program_id,
    date: row.date,
    sessionLabel: row.session_label,
    setsLogged: row.sets_logged ?? [],
    injuryNote: row.injury_note,
  };
}

/** Carrega os logs das últimas N semanas (default 8 — dá margem pra trainingPeriodization.ts olhar
 * pra trás 2+ semanas de MRV consecutivo sem trazer o histórico inteiro). */
export async function loadTrainingLogs(weeksBack = 8): Promise<TrainingLog[]> {
  const supabase = createClient();
  const since = new Date();
  since.setDate(since.getDate() - weeksBack * 7);
  const { data, error } = await supabase
    .from("training_logs")
    .select("*")
    .eq("user_id", await idDoUsuarioLogado(supabase))
    .gte("date", since.toISOString().slice(0, 10))
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToLog);
}

export async function addTrainingLog(log: TrainingLog): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("training_logs").insert({
    id: log.id,
    user_id: user.id,
    program_id: log.programId ?? null,
    date: log.date,
    session_label: log.sessionLabel,
    sets_logged: log.setsLogged,
    injury_note: log.injuryNote ?? null,
  });
  if (error) throw error;
}

export async function deleteTrainingLog(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("training_logs").delete().eq("id", id);
  if (error) throw error;
}
