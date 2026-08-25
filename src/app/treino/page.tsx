"use client";

/* apple-design · arquétipo B (Índice/lista) · coluna de grade 1080
 * "Volume por grupo" e "Evolução por grupo" eram grades de cartões com itens do
 * mesmo tipo — a fragmentação que a regra 1 proíbe. Viraram painel unificado.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { EXERCISE_LIBRARY, MuscleGroup, MUSCLE_GROUP_LABEL, exerciseById } from "@/lib/exerciseLibrary";
import { LoggedSetEntry, ReserveType, TrainingLog, TrainingProgram, TrainingSession, sessionToLoggedSets } from "@/lib/trainingBuilder";
import { addTrainingLog, loadTrainingLogs, loadTrainingPrograms } from "@/lib/trainingStorage";
import { readVolumeStatus, weeklyVolumeByMuscle, VolumeReading } from "@/lib/trainingVolume";
import { recommendNextWeek, WeeklyRecommendation } from "@/lib/trainingPeriodization";
import { buildMuscleEvolution, MuscleEvolution } from "@/lib/muscleEvolution";
import { loadCycles } from "@/lib/storage";
import { fmtDate } from "@/lib/format";
import { IconDumbbell, IconCheck, IconTrend, IconClipboard } from "@/components/icons";

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
import { ProgramaDaSemana } from "@/components/ProgramaDaSemana";
import { computeMuscleTargets, buildSplit, ajusteDeFadigaPara, diasEfetivosPara } from "@/lib/trainingSplitBuilder";
import { upsertTrainingProgram } from "@/lib/trainingStorage";
import { loadPreferences } from "@/lib/questionnaire";
import { newId } from "@/components/DietMealsEditor";

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

  /* GERAÇÃO AUTOMÁTICA.
   *
   * O treino nunca deveria ser montado à mão pelo usuário — o app tem leitura de
   * foto, histórico de ciclos e as faixas de volume; montar exercício por
   * exercício é justamente o trabalho que ele existe para eliminar. O único
   * input que não dá para inferir é quantos dias a pessoa consegue ir. */
  const [diasPorSemana, setDiasPorSemana] = useState(5);
  const [gerando, setGerando] = useState(false);
  const [erroGerar, setErroGerar] = useState<string | null>(null);
  /* Trava da geração automática. Cada `upsertTrainingProgram` usa um UUID novo,
     então gerar duas vezes cria DUAS linhas em vez de sobrescrever — e o
     StrictMode roda o efeito duas vezes em desenvolvimento. Ref, e não estado:
     precisa valer já na segunda execução, antes de qualquer re-render. */
  const geracaoAutomaticaTentada = useRef(false);

  const [sessionLabel, setSessionLabel] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [injuryNote, setInjuryNote] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([newRow()]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /* Devolve o programa carregado além de guardá-lo no estado. Quem chama logo
     depois do await precisa saber se existe programa AGORA — ler `programa` do
     estado ali devolveria o valor do render anterior, sempre null na primeira
     passada, e a geração automática dispararia até para quem já tem treino. */
  async function refresh(): Promise<TrainingProgram | null> {
    try {
      const l = await loadTrainingLogs(8);
      setLogs(l);
      // o programa é acessório: se a tabela não existir, a página segue funcionando
      try {
        const progs = await loadTrainingPrograms();
        const atual = progs[0] ?? null;
        setPrograma(atual);
        setLoadError(null);
        return atual;
      } catch {
        setPrograma(null);
      }
      setLoadError(null);
    } catch (e) {
      // tabela pode ainda não ter sido migrada — não trava a página, só avisa
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar treinos.");
      setLogs([]);
    }
    return null;
  }

  useEffect(() => {
    if (!ready || !user) return;
    let cancelled = false;
    void (async () => {
      const existente = await refresh();
      if (cancelled) return;
      // capturado junto com os logs, depois do await: fora do render e fora da fase síncrona do efeito
      setNowMs(Date.now());
      const cycles = await loadCycles();
      if (!cancelled) setMuscleEvolution(buildMuscleEvolution(cycles));

      /* Quem ainda não tem programa ganha um na primeira visita.
       *
       * A geração já era automática no sentido de não pedir exercício por
       * exercício, mas continuava dependendo de um clique em "Gerar treino" —
       * e o resultado disso foi `training_programs` com ZERO linhas para sete
       * usuários. Aluno que não clica ficava sem treino nenhum, e o painel do
       * administrador não tinha o que mostrar.
       *
       * Só dispara quando não existe programa: quem já tem não é sobrescrito.
       * O algoritmo do gerador não muda — muda apenas QUANDO ele roda. Trocar
       * o número de dias e regerar continua sendo do usuário. */
      if (!cancelled && !existente && !geracaoAutomaticaTentada.current) {
        geracaoAutomaticaTentada.current = true;
        await handleGerarTreino();
      }
    })();
    return () => {
      cancelled = true;
    };
    /* `handleGerarTreino` fica fora das dependências de propósito: é recriada a
       cada render, então incluí-la faria este efeito recarregar logs e ciclos
       sem parar. O efeito deve rodar quando a sessão fica pronta, e só. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user]);

  async function handleGerarTreino() {
    setGerando(true);
    setErroGerar(null);
    try {
      const [prefs, cycles] = await Promise.all([loadPreferences(), loadCycles()]);
      const ultimo = cycles.length ? cycles[cycles.length - 1] : null;

      /* A leitura visual do último ciclo é o que marca ponto fraco. Sem ciclo
         ainda, o treino sai equilibrado — e o `reason` de cada grupo explica
         que a diferenciação chega quando houver foto. */
      const leitura = (ultimo?.muscleAssessment ?? []).map((a) => ({
        muscle: a.muscle as MuscleGroup,
        relativeDevelopment: a.relativeDevelopment,
        confidence: a.confidence,
      }));

      const dias = diasEfetivosPara(diasPorSemana, 0);
      const alvos = computeMuscleTargets(leitura, prefs.priorityMuscles ?? [], 0, dias, 0, dias < diasPorSemana, prefs.sex);
      const sessions = buildSplit(dias, alvos, undefined, ajusteDeFadigaPara(0));

      await upsertTrainingProgram({
        id: newId(),
        name: `Treino de ${dias} dias`,
        createdAt: new Date().toISOString(),
        sessions,
      });
      await refresh();
    } catch (e) {
      setErroGerar(e instanceof Error ? e.message : "Erro ao gerar o treino.");
    } finally {
      setGerando(false);
    }
  }

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

  /* Converte a sessão prescrita em linhas do formulário de registro.
   *
   * Usa `sessionToLoggedSets`, que já fazia essa tradução e não tinha um único
   * chamador — mesmo defeito de `loadDiets` e `loadTrainingPrograms`: a função
   * que fecha o laço existe, funciona, e está desligada. */
  function preencherDoPrograma(sessao: TrainingSession) {
    const logged = sessionToLoggedSets(sessao).filter(
      (l) => l.reserveType === "work" || l.reserveType === "topset"
    );
    if (logged.length === 0) return;
    setSessionLabel(sessao.label);
    setRows(
      logged.map((l) => ({
        id: crypto.randomUUID(),
        exerciseId: l.exerciseId,
        reserveType: l.reserveType,
        sets: l.sets,
        repRange: l.repRange ?? "6-8",
        // carga fica VAZIA de propósito: é o único dado que só a execução
        // conhece, e prefixá-la com o planejado convidaria a confirmar sem medir
        loadKg: "",
      }))
    );
    setSaved(false);
    setSaveError(null);
  }

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
          por grupamento — informação de auditoria, não de execução.
          A renderização vive em `ProgramaDaSemana` para poder ser exercitada
          fora desta página, que exige sessão e dados no Supabase. */}
      {/* GERAR — a primeira ação da página. Antes o usuário precisava montar
          exercício por exercício no formulário lá embaixo, que é exatamente o
          trabalho que o app existe para fazer por ele. */}
      <section>
        <SectionHeading
          title={programa ? "Gerar de novo" : "Gerar seu treino"}
          desc={
            programa
              ? "Refaz o programa com a leitura de foto e as prioridades mais recentes. O anterior é substituído."
              : "O programa sai da leitura das suas fotos, das prioridades declaradas e das faixas de volume. O único dado que falta é quantos dias você consegue treinar."
          }
        />
        <div className="panel">
          <FormRow label="Dias de treino por semana" hint="Define a divisão: 3 vira Push/Pull/Legs, 5 vira PPL + Upper/Lower.">
            <select
              value={diasPorSemana}
              onChange={(e) => setDiasPorSemana(Number(e.target.value))}
              className="input"
            >
              {[1, 2, 3, 4, 5, 6].map((d) => (
                <option key={d} value={d}>
                  {d} {d === 1 ? "dia" : "dias"}
                </option>
              ))}
            </select>
          </FormRow>
          {erroGerar && <p className="panel-row text-[14.5px] text-danger">{erroGerar}</p>}
        </div>
        <button type="button" onClick={handleGerarTreino} disabled={gerando} className="btn-primary mt-4">
          <IconDumbbell className="h-4 w-4" />
          {gerando ? "Gerando…" : programa ? "Gerar de novo" : "Gerar treino"}
        </button>
      </section>

      {programa && <ProgramaDaSemana sessions={programa.sessions} />}

      {/* O guia explica o vocabulário que a prescrição usa. Fica logo abaixo do
          programa porque é ali que a dúvida aparece — "o que é RIR 2?". */}
      <section>
        <SectionHeading
          title="Guia de metodologia"
          desc="O que significa cada tipo de série, por que o RIR existe, como o volume é decidido, e as orientações de dieta — incluindo por que as refeições proteicas ficam a cada 3 horas."
        />
        <button type="button" onClick={async () => (await import("@/lib/pdf")).generateMetodologiaPdf()} className="btn-secondary">
          <IconClipboard className="h-4 w-4" />
          Baixar o guia em PDF
        </button>
      </section>

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

        {/* PREENCHER A PARTIR DO PROGRAMA.
            `sessionToLoggedSets` existia em trainingBuilder.ts desde sempre,
            fazendo exatamente esta conversão, e NUNCA foi chamada. O resultado:
            na mesma página onde o treino aparece gerado, a pessoa começava com
            uma linha vazia e digitava exercício por exercício de volta — só
            para dizer que fez o que já estava escrito acima.

            O botão traz o prescrito; a pessoa então corrige carga e séries para
            o que aconteceu de verdade, que é o ponto do registro. Aquecimento e
            aproximação não entram: o volume efetivo conta só work e top set. */}
        {programa && programa.sessions.length > 0 && (
          <div className="panel">
            <div className="panel-row">
              <p className="text-[15px] font-medium">Preencher a partir do seu programa</p>
              <p className="mt-0.5 text-[13px] leading-[1.45] text-neutral">
                Traz os exercícios e séries prescritos. Depois é só ajustar a carga real.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {programa.sessions.map((sessao, i) => (
                  <button
                    key={`${sessao.label}-${i}`}
                    type="button"
                    onClick={() => preencherDoPrograma(sessao)}
                    className="btn-secondary text-[13px]"
                  >
                    {sessao.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

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
                    aria-label="Exercício"
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
                    aria-label="Tipo de série"
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
                    aria-label="Número de séries"
                  />
                  <input
                    value={row.repRange}
                    onChange={(e) => updateRow(row.id, { repRange: e.target.value })}
                    className="input w-24"
                    placeholder="reps"
                    aria-label="Repetições"
                  />
                  <input
                    type="number"
                    value={row.loadKg}
                    onChange={(e) => updateRow(row.id, { loadKg: e.target.value })}
                    className="input w-24"
                    placeholder="kg"
                    aria-label="Carga em quilos"
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
