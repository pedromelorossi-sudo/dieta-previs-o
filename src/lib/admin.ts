import { createClient } from "./supabase/client";
import { Cycle } from "./types";
import { ProgressPhoto } from "./photos";

const PHOTOS_BUCKET = "progress-photos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface AdminUserSummary {
  id: string;
  name: string;
  createdAt: string;
  cycleCount: number;
  lastWeightKg: number | null;
  lastDate: string | null;
}

/** Só retorna dados se o usuário logado for admin — a RLS do banco também garante isso. */
export async function loadAllUsersSummary(): Promise<AdminUserSummary[]> {
  const supabase = createClient();

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,name,created_at")
    .order("created_at", { ascending: true });
  if (profilesError) throw profilesError;
  if (!profiles) return [];

  const { data: cycles, error: cyclesError } = await supabase
    .from("cycles")
    .select("user_id,date,weight_kg")
    .order("date", { ascending: true });
  if (cyclesError) throw cyclesError;

  const byUser = new Map<string, { count: number; lastWeight: number | null; lastDate: string | null }>();
  for (const c of cycles ?? []) {
    const entry = byUser.get(c.user_id) ?? { count: 0, lastWeight: null, lastDate: null };
    entry.count += 1;
    entry.lastWeight = Number(c.weight_kg);
    entry.lastDate = c.date;
    byUser.set(c.user_id, entry);
  }

  return profiles.map((p) => {
    const stats = byUser.get(p.id);
    return {
      id: p.id,
      name: p.name,
      createdAt: p.created_at,
      cycleCount: stats?.count ?? 0,
      lastWeightKg: stats?.lastWeight ?? null,
      lastDate: stats?.lastDate ?? null,
    };
  });
}

export async function loadCyclesForUser(userId: string): Promise<Cycle[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("cycles")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbG: Number(row.carb_g),
    isPrediction: row.is_prediction,
  }));
}

export async function loadPhotosForUser(userId: string): Promise<ProgressPhoto[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("progress_photos")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  return Promise.all(
    rows.map(async (row) => {
      const { data: signed } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .createSignedUrl(row.photo_path, SIGNED_URL_TTL_SECONDS);
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
      };
    })
  );
}
