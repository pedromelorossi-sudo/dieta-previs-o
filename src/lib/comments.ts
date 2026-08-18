import { createClient } from "./supabase/client";

export interface AdminComment {
  id: string;
  userId: string;
  authorId: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

interface CommentRow {
  id: string;
  user_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

async function attachAuthorNames(rows: CommentRow[]): Promise<AdminComment[]> {
  if (rows.length === 0) return [];
  const supabase = createClient();
  const authorIds = [...new Set(rows.map((r) => r.author_id))];
  const { data: authors } = await supabase.from("profiles").select("id,name").in("id", authorIds);
  const nameById = new Map((authors ?? []).map((a) => [a.id, a.name as string]));
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    authorId: row.author_id,
    authorName: nameById.get(row.author_id) ?? null,
    body: row.body,
    createdAt: row.created_at,
  }));
}

/** Recados de admin pro usuário logado — usado no dashboard do próprio usuário. */
export async function loadMyComments(): Promise<AdminComment[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("admin_comments")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachAuthorNames(data ?? []);
}

/** Recados sobre um usuário específico — usado no painel de admin. */
export async function loadCommentsForUser(userId: string): Promise<AdminComment[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("admin_comments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return attachAuthorNames(data ?? []);
}

export async function addComment(targetUserId: string, body: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const { error } = await supabase.from("admin_comments").insert({
    user_id: targetUserId,
    author_id: user.id,
    body,
  });
  if (error) throw error;
}

export async function deleteComment(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("admin_comments").delete().eq("id", id);
  if (error) throw error;
}
