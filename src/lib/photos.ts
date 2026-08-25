import { createClient } from "./supabase/client";
import { Sex } from "./bodyComposition";

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

const BUCKET = "progress-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, renovada a cada carregamento da página

export interface ProgressPhoto {
  id: string;
  date: string;
  photoPath: string;
  photoUrl: string;
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
  sex: Sex | null;
  estimatedBfPercent: number | null;
  notes: string;
  cycleId: string | null;
}

interface ProgressPhotoRow {
  id: string;
  date: string;
  photo_path: string;
  waist_cm: number | null;
  neck_cm: number | null;
  hip_cm: number | null;
  sex: Sex | null;
  estimated_bf_percent: number | null;
  notes: string;
  cycle_id: string | null;
}

export interface NewProgressPhoto {
  date: string;
  file: File;
  waistCm: number | null;
  neckCm: number | null;
  hipCm: number | null;
  sex: Sex | null;
  estimatedBfPercent: number | null;
  notes: string;
  cycleId: string | null;
}

export async function addProgressPhoto(entry: NewProgressPhoto): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const ext = entry.file.name.split(".").pop() || "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, entry.file, {
    contentType: entry.file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const { error: insertError } = await supabase.from("progress_photos").insert({
    user_id: user.id,
    date: entry.date,
    photo_path: path,
    waist_cm: entry.waistCm,
    neck_cm: entry.neckCm,
    hip_cm: entry.hipCm,
    sex: entry.sex,
    estimated_bf_percent: entry.estimatedBfPercent,
    notes: entry.notes,
    cycle_id: entry.cycleId,
  });
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw insertError;
  }
}

export async function loadProgressPhotos(): Promise<ProgressPhoto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", await idDoUsuarioLogado(supabase))
    .order("date", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as ProgressPhotoRow[];
  const withUrls = await Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
      return {
        id: row.id,
        date: row.date,
        photoPath: row.photo_path,
        photoUrl: signed?.signedUrl ?? "",
        waistCm: row.waist_cm != null ? Number(row.waist_cm) : null,
        neckCm: row.neck_cm != null ? Number(row.neck_cm) : null,
        hipCm: row.hip_cm != null ? Number(row.hip_cm) : null,
        sex: row.sex,
        estimatedBfPercent: row.estimated_bf_percent != null ? Number(row.estimated_bf_percent) : null,
        notes: row.notes,
        cycleId: row.cycle_id,
      } satisfies ProgressPhoto;
    })
  );
  return withUrls;
}

export async function deleteProgressPhoto(photo: ProgressPhoto): Promise<void> {
  const supabase = createClient();
  const { error: dbError } = await supabase.from("progress_photos").delete().eq("id", photo.id);
  if (dbError) throw dbError;
  await supabase.storage.from(BUCKET).remove([photo.photoPath]);
}
