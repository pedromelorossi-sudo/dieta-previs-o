"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { EXERCISE_LIBRARY, MuscleGroup, MUSCLE_GROUP_LABEL, exerciseById } from "@/lib/exerciseLibrary";
import { LoggedSetEntry, ReserveType, TrainingLog } from "@/lib/trainingBuilder";
import { addTrainingLog, loadTrainingLogs } from "@/lib/trainingStorage";
import { readVolumeStatus, weeklyVolumeByMuscle, VolumeReading } from "@/lib/trainingVolume";
import { recommendNextWeek, WeeklyRecommendation } from "@/lib/trainingPeriodization";
import { buildMuscleEvolution, MuscleEvolution } from "@/lib/muscleEvolution";
import { loadCycles } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { Field } from "@/components/DietMealsEditor";
import { IconDumbbell, IconCheck, IconTrend } from "@/components/icons";

const RESERVE_LABEL: Record<ReserveType, string> = {
  warmup: "Warm up",
  feeder: "Feeder",
  work: "Work",
  topset: "Top set",
};

interface DraftRow {
  id: string;
  exerciseId: string;
  reserveType: ReserveType;
  sets: number;
  repRange: string;
  loadKg: string;
}

function newRow(): DraftRow {
  return {
    id: crypto.randomUUID(),
    exerciseId: EXERCISE_LIBRARY[0].id,
    reserveType: "work",
    sets: 3,
    repRange: "6-8",
    loadKg: "",
  };
}

export default function TreinoPage() {
  const { ready, user } = useAuth();
  const [logs, setLogs] = useState<TrainingLog[] | null>(null);
  // A "hora de agora" precisa ser um estado, não uma leitura durante o render: Date.now() dentro do
  // useMemo é impuro (React 19 sinaliza) — dois renders com as mesmas dependências dariam resultados
  // diferentes. Aqui ela é capturada uma vez, quando os logs chegam.
  const [nowMs, setNowMs] = useState<number | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [muscleEvolution, setMuscleEvolution] = useState<MuscleEvolution[]>([]);

  const [sessionLabel, setSessionLabel] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [injuryNote, setInjuryNote] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function refresh() {
    try {
      const l = await loadTrainingLogs(8);
      setLogs(l);
      setLoadError(null);
    } catch (e) {
      // tabela pode ainda não ter sido migrada — não trava a página, só avisa
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar treinos.");
      setLogs([]);
    }
  }

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      // capturado junto com os logs, depois do await: fora do render e fora da fase síncrona do efeito
      setNowMs(Date.now());
      const cycles = await loadCycles();
      if (!cancelled) setMuscleEvolution(buildMuscleEvolution(cycles));
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const volumeReadings: VolumeReading[] = useMemo(() => {
    if (!logs || nowMs == null) return [];
    const since = nowMs - 7 * 24 * 60 * 60 * 1000;
    const recentSets = logs.filter((l) => new Date(l.date).getTime() >= since).flatMap((l) => l.setsLogged);
    const volume = weeklyVolumeByMuscle(recentSets, (id) => exerciseById(id)?.primaryMuscle);
    return readVolumeStatus(volume);
  }, [logs, nowMs]);

  const recommendation: WeeklyRecommendation | null = useMemo(() => {
    if (!logs) return null;
    return recommendNextWeek({ logs });
  }, [logs]);

  function updateRow(id: string, patch: Partial<DraftRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
    setSaved(false);
  }
  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
    setSaved(false);
  }

  async function handleSave() {
    if (!user || !sessionLabel.trim() || rows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const setsLogged: LoggedSetEntry[] = rows.map((r) => ({
        exerciseId: r.exerciseId,
        sets: r.sets,
        reserveType: r.reserveType,
        repRange: r.repRange,
        loadKg: r.loadKg ? parseFloat(r.loadKg) : null,
      }));
      await addTrainingLog({
        id: crypto.randomUUID(),
        date,
        sessionLabel: sessionLabel.trim(),
        setsLogged,
        injuryNote: injuryNote.trim() || null,
      });
      setSaved(true);
      setSessionLabel("");
      setInjuryNote("");
      setRows([newRow()]);
      await refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar sessão.");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || logs === null) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Treino</h1>
        <p className="text-sm text-muted mt-2">
          Log de sessões, volume semanal por grupo muscular (MEV/MAV/MRV) e recomendação pra próxima semana.
        </p>
      </div>

      {loadError && (
        <div className="card border-warn/30 bg-warn/5 p-4 text-sm text-warn">
          {loadError} — se as tabelas de treino ainda não foram criadas no Supabase, rode a migração antes de usar esta
          página.
        </div>
      )}

      {recommendation?.deloadSuggested && (
        <div className="card border-danger/30 bg-danger/5 p-4 text-sm text-danger">
          {recommendation.deloadReason}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-1">Volume da semana por grupo</h2>
        <p className="text-sm text-muted mb-4">Últimos 7 dias, contando só séries Work e Top set.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {volumeReadings.map((r) => {
            const rec = recommendation?.muscles.find((m) => m.muscle === r.muscle);
            const tone =
              r.status === "abaixo_mev"
                ? "bg-warn/15 text-warn"
                : r.status === "acima_mrv"
                  ? "bg-danger/15 text-danger"
                  : "bg-accent/15 text-accent";
            return (
              <div key={r.muscle} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.muscleLabel}</span>
                  <span className={`badge ${tone} shrink-0`}>{r.effectiveSets} séries</span>
                </div>
                <p className="text-xs text-muted mt-2 leading-relaxed">{r.note}</p>
                {rec && rec.adjustment !== "manter" && (
                  <p className="text-xs mt-2 text-accent leading-relaxed">
                    Próxima semana: {rec.adjustment === "subir" ? "subir volume" : "reduzir volume"}
                    {rec.suggestedExerciseSwap &&
                      ` — experimentar "${exerciseById(rec.suggestedExerciseSwap.toExerciseId)?.name ?? ""}"`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {muscleEvolution.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold tracking-tight mb-1">Evolução por grupo muscular</h2>
          <p className="text-sm text-muted mb-4">
            A partir da leitura visual das fotos em cada ciclo — só compara leituras com confiança media/alta, um
            palpite de baixa confiança não conta como piora ou melhora.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {muscleEvolution.map((e) => {
              const tone =
                e.trend === "melhorando"
                  ? "bg-accent/15 text-accent"
                  : e.trend === "piorando"
                    ? "bg-danger/15 text-danger"
                    : "bg-surface-raised text-muted";
              return (
                <div key={e.muscle} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{e.muscleLabel}</span>
                    <span className={`badge ${tone} shrink-0 flex items-center gap-1`}>
                      {e.trend === "melhorando" && <IconTrend className="h-3 w-3" />}
                      {e.trend === "melhorando" ? "melhorando" : e.trend === "piorando" ? "piorando" : e.trend === "estavel" ? "estável" : "sem dado"}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-2 leading-relaxed">{e.trendNote}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {e.points.slice(-6).map((p, i) => (
                      <span key={i} className="badge bg-surface-raised text-muted border border-border text-[10px]">
                        {fmtDate(p.date)}: {p.relativeDevelopment === "atras_dos_outros" ? "atrás" : p.relativeDevelopment === "destaque" ? "destaque" : "prop."}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-1">Registrar sessão</h2>
          <p className="text-sm text-muted">O que você fez de verdade — carga real, não o planejado.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome da sessão">
            <input
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              className="input"
              placeholder="ex: Peito/Tríceps/Panturrilha A"
            />
          </Field>
          <Field label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>
        </div>

        <Field label="Nota de lesão/dor (opcional)">
          <input
            value={injuryNote}
            onChange={(e) => setInjuryNote(e.target.value)}
            className="input"
            placeholder="ex: dor no ombro direito, reduzi carga"
          />
        </Field>

        <div className="space-y-3">
          {rows.map((row) => {
            const exercise = exerciseById(row.exerciseId);
            return (
              <div key={row.id} className="rounded-lg border border-border bg-surface-raised/40 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={row.exerciseId}
                    onChange={(e) => updateRow(row.id, { exerciseId: e.target.value })}
                    className="input flex-1 min-w-[220px]"
                  >
                    {(Object.keys(MUSCLE_GROUP_LABEL) as MuscleGroup[]).map((muscle) => (
                      <optgroup key={muscle} label={MUSCLE_GROUP_LABEL[muscle]}>
                        {EXERCISE_LIBRARY.filter((e) => e.primaryMuscle === muscle).map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <select
                    value={row.reserveType}
                    onChange={(e) => updateRow(row.id, { reserveType: e.target.value as ReserveType })}
                    className="input w-32"
                  >
                    {(Object.keys(RESERVE_LABEL) as ReserveType[]).map((rt) => (
                      <option key={rt} value={rt}>
                        {RESERVE_LABEL[rt]}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={row.sets}
                    onChange={(e) => updateRow(row.id, { sets: parseInt(e.target.value) || 1 })}
                    className="input w-20"
                    placeholder="séries"
                  />
                  <input
                    value={row.repRange}
                    onChange={(e) => updateRow(row.id, { repRange: e.target.value })}
                    className="input w-24"
                    placeholder="reps"
                  />
                  <input
                    type="number"
                    value={row.loadKg}
                    onChange={(e) => updateRow(row.id, { loadKg: e.target.value })}
                    className="input w-24"
                    placeholder="kg"
                  />
                  <button type="button" onClick={() => removeRow(row.id)} className="text-xs text-muted hover:text-danger ml-auto">
                    ×
                  </button>
                </div>
                {exercise && exercise.secondaryMuscles.length > 0 && (
                  <p className="text-[11px] text-muted mt-1.5">
                    também estimula: {exercise.secondaryMuscles.map((m) => MUSCLE_GROUP_LABEL[m]).join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addRow} className="text-sm text-accent hover:underline">
          + adicionar exercício
        </button>

        {saveError && <p className="text-xs text-danger">{saveError}</p>}

        <button type="button" onClick={handleSave} disabled={saving || !sessionLabel.trim()} className="btn-primary">
          {saved ? <IconCheck className="h-4 w-4" /> : <IconDumbbell className="h-4 w-4" />}
          {saving ? "Salvando…" : saved ? "Sessão salva" : "Salvar sessão"}
        </button>
      </section>
    </div>
  );
}
