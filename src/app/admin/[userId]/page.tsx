"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { loadCyclesForUser, loadPhotosForUser, loadDietsForUser } from "@/lib/admin";
import { loadCommentsForUser, addComment, deleteComment, AdminComment } from "@/lib/comments";
import { deleteDiet } from "@/lib/dietStorage";
import { createClient } from "@/lib/supabase/client";
import { Cycle } from "@/lib/types";
import { ProgressPhoto } from "@/lib/photos";
import { Diet } from "@/lib/dietBuilder";
import { extractRules, sortByDate } from "@/lib/dietEngine";
import { fmt, fmtDate } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { IconDrumstick, IconDroplet, IconFlame, IconClipboard } from "@/components/icons";
import Link from "next/link";

export default function AdminUserDetailPage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const { ready, profile } = useAuth();

  const [name, setName] = useState<string | null>(null);
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [diets, setDiets] = useState<Diet[] | null>(null);
  const [comments, setComments] = useState<AdminComment[] | null>(null);
  const [newComment, setNewComment] = useState("");
  const [postingComment, setPostingComment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profile?.isAdmin || !userId) return;
    const supabase = createClient();

    Promise.all([
      supabase.from("profiles").select("name").eq("id", userId).single(),
      loadCyclesForUser(userId).then((c) => sortByDate(c)),
      loadPhotosForUser(userId),
      loadDietsForUser(userId),
      loadCommentsForUser(userId),
    ])
      .then(([profileRes, cyclesRes, photosRes, dietsRes, commentsRes]) => {
        setName(profileRes.data?.name ?? "Usuário");
        setCycles(cyclesRes);
        setPhotos(photosRes);
        setDiets(dietsRes);
        setComments(commentsRes);
      })
      .catch((e) => setError(e.message));
  }, [ready, profile, userId]);

  async function handleDeleteDiet(id: string) {
    if (!window.confirm("Excluir esta dieta do usuário?")) return;
    await deleteDiet(id);
    setDiets((prev) => (prev ? prev.filter((d) => d.id !== id) : prev));
  }

  async function handlePostComment() {
    if (!newComment.trim()) return;
    setPostingComment(true);
    try {
      await addComment(userId, newComment.trim());
      setComments(await loadCommentsForUser(userId));
      setNewComment("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao adicionar comentário.");
    } finally {
      setPostingComment(false);
    }
  }

  async function handleDeleteComment(id: string) {
    await deleteComment(id);
    setComments((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  if (!ready) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-muted">Carregando…</div>;
  }

  if (!profile?.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-muted">Acesso restrito a administradores.</p>
      </div>
    );
  }

  const rules = cycles && cycles.length > 0 ? extractRules(cycles) : null;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <div>
        <Link href="/admin" className="text-sm text-accent hover:underline">
          ← Todos os usuários
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{name ?? "…"}</h1>
        <p className="text-sm text-muted mt-1">
          Histórico e fotos são somente leitura. Dietas e comentários você pode editar como admin.
        </p>
      </div>

      {error && <div className="card border-warn/30 bg-warn/5 p-4 text-sm text-warn">{error}</div>}

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Comentários</h2>
        <div className="card p-5 space-y-4">
          <div className="flex gap-2">
            <input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Escreva um recado para este usuário…"
              className="input flex-1"
              onKeyDown={(e) => e.key === "Enter" && handlePostComment()}
            />
            <button type="button" onClick={handlePostComment} disabled={postingComment || !newComment.trim()} className="btn-primary">
              {postingComment ? "Enviando…" : "Enviar"}
            </button>
          </div>
          {!comments ? (
            <div className="skeleton h-16 w-full" />
          ) : comments.length === 0 ? (
            <p className="text-sm text-muted">Nenhum comentário ainda.</p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="rounded-md border border-border bg-surface-raised/40 p-3">
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>
                      {c.authorName ?? "Administrador"} · {fmtDate(c.createdAt.slice(0, 10))}
                    </span>
                    <button type="button" onClick={() => handleDeleteComment(c.id)} className="hover:text-danger transition-colors">
                      excluir
                    </button>
                  </div>
                  <p className="text-sm">{c.body}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Dietas</h2>
        {!diets ? (
          <div className="skeleton h-24 w-full" />
        ) : diets.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma dieta salva ainda.</p>
        ) : (
          <div className="space-y-3">
            {diets.map((d) => (
              <div key={d.id} className="card p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent/15 text-accent shrink-0">
                    <IconClipboard className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-medium">{d.name}</div>
                    <div className="text-xs text-muted">
                      {fmt(d.targetKcal, 0)}kcal · {d.meals.length} refeições
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <a href={`/admin/${userId}/dieta/${d.id}`} className="text-xs text-accent hover:underline">
                    editar
                  </a>
                  <button type="button" onClick={() => handleDeleteDiet(d.id)} className="text-xs text-muted hover:text-danger transition-colors">
                    excluir
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Histórico de ciclos</h2>
        {!cycles ? (
          <div className="skeleton h-40 w-full" />
        ) : cycles.length === 0 ? (
          <p className="text-sm text-muted">Nenhum ciclo registrado ainda.</p>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted">
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Peso</th>
                    <th className="px-4 py-3 font-medium">%BF</th>
                    <th className="px-4 py-3 font-medium">Kcal</th>
                    <th className="px-4 py-3 font-medium">Proteína</th>
                    <th className="px-4 py-3 font-medium">Gordura</th>
                    <th className="px-4 py-3 font-medium">Carbo</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.id} className="border-b border-border last:border-0 hover:bg-surface-raised/60 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {fmtDate(c.date)}
                        {c.isPrediction && <span className="ml-2 badge bg-warn/15 text-warn">previsão</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium">{fmt(c.weightKg)} kg</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">
                        {c.bodyFatPercent != null ? `${fmt(c.bodyFatPercent)}%` : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(c.kcal, 0)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(c.proteinG, 1)}g</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(c.fatG, 1)}g</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmt(c.carbG, 1)}g</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {rules && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-4">Regras extraídas</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconDroplet className="h-4 w-4" /> Gordura
              </div>
              <div className="mt-2 text-xl font-semibold">{fmt(rules.fatPerKg, 2)} g/kg</div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconDrumstick className="h-4 w-4" /> Proteína
              </div>
              <div className="mt-2 text-xl font-semibold">{fmt(rules.proteinPerKg, 2)} g/kg</div>
            </div>
            <div className="card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconFlame className="h-4 w-4" /> Kcal/kg
              </div>
              <div className="mt-2 text-xl font-semibold">{fmt(rules.kcalPerKgLast, 1)}</div>
              <div className="mt-3">
                <Sparkline values={rules.kcalPerKgSeries.map((s) => s.value)} projectedNext={rules.kcalPerKgExtrapolated} />
              </div>
            </div>
          </div>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Fotos de progresso</h2>
        {!photos ? (
          <div className="skeleton h-40 w-full" />
        ) : photos.length === 0 ? (
          <p className="text-sm text-muted">Nenhuma foto registrada ainda.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {photos.map((photo) => (
              <div key={photo.id} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.photoUrl} alt={`Foto de ${fmtDate(photo.date)}`} className="h-48 w-full object-cover" />
                <div className="p-3 space-y-1">
                  <div className="text-xs font-medium">{fmtDate(photo.date)}</div>
                  {photo.estimatedBfPercent != null && (
                    <div className="text-xs text-accent">%BF estimado: {fmt(photo.estimatedBfPercent, 1)}%</div>
                  )}
                  {photo.notes && <p className="text-xs text-muted">{photo.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
