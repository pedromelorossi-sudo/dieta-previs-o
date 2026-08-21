"use client";

/* apple-design · arquétipo B (Índice/lista) · coluna de grade 1080
 * "Volume por grupo" e "Evolução por grupo" eram grades de cartões com itens do
 * mesmo tipo — a fragmentação que a regra 1 proíbe. Viraram painel unificado.
 */

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { EXERCISE_LIBRARY, MuscleGroup, MUSCLE_GROUP_LABEL, exerciseById } from "@/lib/exerciseLibrary";
import { LoggedSetEntry, ReserveType, TrainingLog, TrainingProgram } from "@/lib/trainingBuilder";
import { addTrainingLog, loadTrainingLogs, loadTrainingPrograms } from "@/lib/trainingStorage";
import { readVolumeStatus, weeklyVolumeByMuscle, VolumeReading } from "@/lib/trainingVolume";
import { recommendNextWeek, WeeklyRecommendation } from "@/lib/trainingPeriodization";
import { buildMuscleEvolution, MuscleEvolution } from "@/lib/muscleEvolution";
import { loadCycles } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
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

import { GridPage, PageHero, SectionHeading, Panel, FormRow } from "@/components/apple";

export default function TreinoPage() {
  const { ready, user } = useAuth();
  const [logs, setLogs] = useState<TrainingLog[] | null>(null);
  // A "hora de agora" precisa ser um estado, não uma leitura durante o render: Date.now() dentro do
  // useMemo é impuro (React 19 sinaliza) — dois renders com as mesmas dependências dariam resultados
  // diferentes. Aqui ela é capturada uma vez, quando os logs chegam.
  const [nowMs, setNowMs] = useState<number | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [muscleEvolution, setMuscleEvolution] = useState<MuscleEvolution[]>([]);
  /* O programa gerado (exercícios, séries, repetições) era SALVO e nunca lido —
     `loadTrainingPrograms` existia em trainingStorage.ts sem um único chamador.
     Por isso a página só mostrava contagem de séries por grupamento, que é o
     que o usuário descreveu como "treino com nome de grupamento e sem séries".
     O treino sempre existiu; faltava exibi-lo. */
  const [programa, setPrograma] = useState<TrainingProgram | null>(null);

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
      // o programa é acessório: se a tabela não existir, a página segue funcionando
      try {
        const progs = await loadTrainingPrograms();
        setPrograma(progs[0] ?? null);
      } catch {
        setPrograma(null);
      }
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
      <GridPage>
        <div className="skeleton h-14 w-full max-w-[420px]" />
        <div className="skeleton h-48 w-full" />
      </GridPage>
    );
  }

  return (
    <GridPage>
      <PageHero
        eyebrow="Semana"
        title="Treino"
        lede="Seu programa da semana, o volume por grupo muscular contra as faixas MEV/MAV/MRV, e o que ajustar no próximo bloco."
      />

      {/* ── O PROGRAMA ──
          Primeira coisa da página, porque é o que a pessoa abre para consultar
          antes de treinar. Antes disto a página começava por contagem de séries
          por grupamento — informação de auditoria, não de execução. */}
      {programa && programa.sessions.length > 0 && (
        <section>
          <SectionHeading
            title="Seu programa"
            desc="Divisão por padrão de movimento. Cada exercício vem com séries, faixa de repetição e quantas repetições deixar na reserva (RIR)."
          />
          <div className="space-y-4">
            {programa.sessions.map((sessao, i) => (
              <div key={`${sessao.label}-${i}`} className="panel">
                <div className="panel-row flex items-baseline justify-between gap-4">
                  <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{sessao.label}</h3>
                  <span className="shrink-0 text-[13px] tabular-nums text-neutral">
                    {sessao.items.reduce(
                      (n, it) => n + it.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset").reduce((k, b) => k + b.sets, 0),
                      0
                    )}{" "}
                    séries efetivas
                  </span>
                </div>
                {sessao.items.map((item, j) => {
                  const ex = exerciseById(item.exerciseId);
                  return (
                    <div key={`${item.exerciseId}-${j}`} className="panel-row">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-[15px] font-medium">{ex?.name ?? item.exerciseId}</span>
                        {ex && (
                          <span className="shrink-0 text-[13px] text-neutral">{MUSCLE_GROUP_LABEL[ex.primaryMuscle]}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] tabular-nums text-muted">
                        {item.blocks.map((b, k) => (
                          <span key={k}>
                            <span className="text-neutral">{RESERVE_LABEL[b.reserveType]}</span>{" "}
                            {b.sets}×{b.repRange}
                            {b.rirTarget != null && <span className="text-neutral"> · RIR {b.rirTarget}</span>}
                            {b.loadKg != null && <span className="text-foreground"> · {b.loadKg} kg</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
      )}

      {loadError && (
        <Panel>
          <div className="panel-row text-[14.5px] leading-[1.6] text-warn">
            {loadError} — se as tabelas de treino ainda não foram criadas no Supabase, rode a migração antes de usar
            esta página.
          </div>
        </Panel>
      )}

      {recommendation?.deloadSuggested && (
        <Panel>
          <div className="panel-row text-[14.5px] leading-[1.6] text-danger">{recommendation.deloadReason}</div>
        </Panel>
      )}

      <section>
        <SectionHeading
          title="Volume da semana por grupo"
          desc="Últimos 7 dias, contando só séries Work e Top set."
        />
        <Panel>
          {volumeReadings.map((r) => {
            const rec = recommendation?.muscles.find((m) => m.muscle === r.muscle);
            /* A cor do número diz o estado; a etiqueta fica cinza. Duas cores
               competindo na mesma linha é o que a regra 4 chama de errado. */
            const tone =
              r.status === "abaixo_mev" ? "text-warn" : r.status === "acima_mrv" ? "text-danger" : "text-foreground";
            return (
              <div key={r.muscle} className="panel-row">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-[17px] font-semibold tracking-[-0.01em]">{r.muscleLabel}</span>
                  <span className={`shrink-0 text-[17px] font-semibold tabular-nums ${tone}`}>
                    {r.effectiveSets} séries
                  </span>
                </div>
                <p className="mt-1 text-[13.5px] leading-[1.5] text-muted">{r.note}</p>
                {rec && rec.adjustment !== "manter" && (
                  <p className="mt-1.5 text-[13.5px] leading-[1.5] text-accent">
                    Próxima semana: {rec.adjustment === "subir" ? "subir volume" : "reduzir volume"}
                    {rec.suggestedExerciseSwap &&
                      ` — experimentar "${exerciseById(rec.suggestedExerciseSwap.toExerciseId)?.name ?? ""}"`}
                  </p>
                )}
              </div>
            );
          })}
        </Panel>
      </section>

      {muscleEvolution.length > 0 && (
        <section>
          <SectionHeading
            title="Evolução por grupo muscular"
            desc="A partir da leitura visual das fotos em cada ciclo — só compara leituras com confiança média/alta; um palpite de baixa confiança não conta como piora nem como melhora."
          />
          <Panel>
            {muscleEvolution.map((e) => {
              const tone =
                e.trend === "melhorando" ? "text-accent" : e.trend === "piorando" ? "text-danger" : "text-muted";
              return (
                <div key={e.muscle} className="panel-row">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-[17px] font-semibold tracking-[-0.01em]">{e.muscleLabel}</span>
                    <span className={`flex shrink-0 items-center gap-1.5 text-[15px] font-medium ${tone}`}>
                      {e.trend === "melhorando" && <IconTrend className="h-3.5 w-3.5" />}
                      {e.trend === "melhorando"
                        ? "melhorando"
                        : e.trend === "piorando"
                          ? "piorando"
                          : e.trend === "estavel"
                            ? "estável"
                            : "sem dado"}
                    </span>
                  </div>
                  <p className="mt-1 text-[13.5px] leading-[1.5] text-muted">{e.trendNote}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {e.points.slice(-6).map((p, i) => (
                      <span key={i} className="badge">
                        {fmtDate(p.date)}:{" "}
                        {p.relativeDevelopment === "atras_dos_outros"
                          ? "atrás"
                          : p.relativeDevelopment === "destaque"
                            ? "destaque"
                            : "prop."}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </Panel>
        </section>
      )}

      <section className="card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-1">Registrar sessão</h2>
          <p className="text-sm text-muted">O que você fez de verdade — carga real, não o planejado.</p>
        </div>

        <div className="panel">
          <FormRow label="Nome da sessão">
            <input
              value={sessionLabel}
              onChange={(e) => setSessionLabel(e.target.value)}
              className="input"
              placeholder="Peito/Tríceps A"
            />
          </FormRow>
          <FormRow label="Data">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </FormRow>
          <FormRow label="Nota de lesão ou dor" hint="Opcional." stacked>
            <input
              value={injuryNote}
              onChange={(e) => setInjuryNote(e.target.value)}
              className="input"
              placeholder="dor no ombro direito, reduzi carga"
            />
          </FormRow>
        </div>

        <div className="space-y-3">
          {rows.map((row) => {
            const exercise = exerciseById(row.exerciseId);
            return (
              <div key={row.id} className="rounded-[12px] border border-border bg-surface-raised/40 p-3">
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
    </GridPage>
  );
}
