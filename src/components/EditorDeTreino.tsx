"use client";

/* Editor do programa de treino.
 *
 * Espelha o que `DietMealsEditor` faz para a dieta: o administrador abre o
 * programa de outra pessoa e altera exercício, séries, faixa de repetição, RIR,
 * carga e intervalo — além de acrescentar ou remover exercícios e sessões.
 *
 * Componente separado (e não JSX solto na página de admin) pela mesma razão que
 * levou `ProgramaDaSemana` a existir: a página de admin exige sessão e um
 * usuário-alvo, então o editor precisa ser exercitável fora dela.
 *
 * A autorização NÃO mora aqui. Quem decide se a escrita passa é a RLS do
 * Postgres — este componente só monta o objeto e chama o storage. Se um não
 * administrador chegasse a esta tela, o banco recusaria o `upsert`.
 */

import { useState } from "react";
import { TrainingProgram, TrainingSession, TrainingItem, ReserveType } from "@/lib/trainingBuilder";
import { EXERCISE_LIBRARY, exerciseById, MUSCLE_GROUP_LABEL } from "@/lib/exerciseLibrary";
import { SectionHeading } from "@/components/apple";
import { IconCheck } from "@/components/icons";

const RESERVE_LABEL: Record<ReserveType, string> = {
  warmup: "Aquecimento",
  feeder: "Aproximação",
  work: "Trabalho",
  topset: "Top set",
};

function seriesEfetivas(sessao: TrainingSession): number {
  return sessao.items.reduce(
    (n, it) =>
      n +
      it.blocks
        .filter((b) => b.reserveType === "work" || b.reserveType === "topset")
        .reduce((k, b) => k + b.sets, 0),
    0
  );
}

export function EditorDeTreino({
  programaInicial,
  onSave,
}: {
  programaInicial: TrainingProgram;
  onSave: (programa: TrainingProgram) => Promise<void>;
}) {
  const [programa, setPrograma] = useState<TrainingProgram>(programaInicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function alterar(fn: (p: TrainingProgram) => TrainingProgram) {
    setPrograma(fn);
    setSalvo(false);
  }

  function alterarSessao(i: number, fn: (s: TrainingSession) => TrainingSession) {
    alterar((p) => ({ ...p, sessions: p.sessions.map((s, k) => (k === i ? fn(s) : s)) }));
  }

  function alterarItem(iS: number, iI: number, fn: (it: TrainingItem) => TrainingItem) {
    alterarSessao(iS, (s) => ({ ...s, items: s.items.map((it, k) => (k === iI ? fn(it) : it)) }));
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await onSave(programa);
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-[clamp(24px,4vw,36px)]">
      <SectionHeading
        title="Treino"
                      aria-label="Treino"
        desc="Alterações aqui substituem o programa desta pessoa. O que ela vê na página de treino passa a ser isto."
      />

      <div className="panel">
        <label className="panel-row flex min-h-[44px] items-center justify-between gap-5">
          <span className="text-[15px] font-medium">Nome do programa</span>
          <span className="w-[clamp(140px,45%,280px)] shrink-0">
            <input
              className="input"
              value={programa.name}
              onChange={(e) => alterar((p) => ({ ...p, name: e.target.value }))}
            />
          </span>
        </label>
      </div>

      {programa.sessions.map((sessao, iS) => (
        <div key={`${sessao.label}-${iS}`} className="panel">
          <div className="panel-row flex flex-wrap items-center justify-between gap-3">
            <input
              aria-label="Nome da sessão"
              className="input max-w-[240px]"
              value={sessao.label}
              onChange={(e) => alterarSessao(iS, (s) => ({ ...s, label: e.target.value }))}
            />
            <div className="flex items-center gap-3">
              <span className="text-[13px] tabular-nums text-neutral">{seriesEfetivas(sessao)} séries efetivas</span>
              <button
                type="button"
                onClick={() => alterar((p) => ({ ...p, sessions: p.sessions.filter((_, k) => k !== iS) }))}
                className="text-[13px] text-neutral transition-colors hover:text-danger"
              >
                Remover dia
              </button>
            </div>
          </div>

          {sessao.items.map((item, iI) => {
            const ex = exerciseById(item.exerciseId);
            return (
              <div key={`${item.exerciseId}-${iI}`} className="panel-row space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Exercício"
                    className="input max-w-[320px]"
                    value={item.exerciseId}
                    onChange={(e) => alterarItem(iS, iI, (it) => ({ ...it, exerciseId: e.target.value }))}
                  >
                    {EXERCISE_LIBRARY.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} · {MUSCLE_GROUP_LABEL[o.primaryMuscle]}
                      </option>
                    ))}
                  </select>
                  {ex && <span className="text-[13px] text-neutral">{MUSCLE_GROUP_LABEL[ex.primaryMuscle]}</span>}
                  <button
                    type="button"
                    onClick={() =>
                      alterarSessao(iS, (s) => ({ ...s, items: s.items.filter((_, k) => k !== iI) }))
                    }
                    className="ml-auto text-[13px] text-neutral transition-colors hover:text-danger"
                  >
                    Remover
                  </button>
                </div>

                {item.blocks.map((b, iB) => (
                  <div key={iB} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                    <select
                      aria-label="Tipo de série"
                      className="input max-w-[140px]"
                      value={b.reserveType}
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) =>
                            k === iB ? { ...x, reserveType: e.target.value as ReserveType } : x
                          ),
                        }))
                      }
                    >
                      {(Object.keys(RESERVE_LABEL) as ReserveType[]).map((r) => (
                        <option key={r} value={r}>
                          {RESERVE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      className="input max-w-[80px]"
                      value={b.sets}
                      title="séries"
                      aria-label="séries"
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) =>
                            k === iB ? { ...x, sets: parseInt(e.target.value) || 1 } : x
                          ),
                        }))
                      }
                    />
                    <span className="text-neutral">×</span>
                    <input
                      className="input max-w-[100px]"
                      value={b.repRange}
                      title="repetições"
                      aria-label="repetições"
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) => (k === iB ? { ...x, repRange: e.target.value } : x)),
                        }))
                      }
                    />
                    <input
                      type="number"
                      className="input max-w-[90px]"
                      value={b.rirTarget ?? ""}
                      placeholder="RIR"
                      title="repetições em reserva"
                      aria-label="repetições em reserva"
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) =>
                            k === iB ? { ...x, rirTarget: e.target.value === "" ? null : parseInt(e.target.value) } : x
                          ),
                        }))
                      }
                    />
                    <input
                      type="number"
                      className="input max-w-[100px]"
                      value={b.loadKg ?? ""}
                      placeholder="kg"
                      title="carga"
                      aria-label="carga"
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) =>
                            k === iB ? { ...x, loadKg: e.target.value === "" ? null : parseFloat(e.target.value) } : x
                          ),
                        }))
                      }
                    />
                    <input
                      type="number"
                      className="input max-w-[110px]"
                      value={b.restSeconds ?? ""}
                      placeholder="descanso s"
                      title="descanso em segundos"
                      aria-label="descanso em segundos"
                      onChange={(e) =>
                        alterarItem(iS, iI, (it) => ({
                          ...it,
                          blocks: it.blocks.map((x, k) =>
                            k === iB
                              ? { ...x, restSeconds: e.target.value === "" ? null : parseInt(e.target.value) }
                              : x
                          ),
                        }))
                      }
                    />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() =>
                    alterarItem(iS, iI, (it) => ({
                      ...it,
                      blocks: [...it.blocks, { reserveType: "work", sets: 3, repRange: "8-12", rirTarget: 2, restSeconds: 120 }],
                    }))
                  }
                  className="text-[13px] text-accent hover:underline"
                >
                  + bloco
                </button>
              </div>
            );
          })}

          <div className="panel-row">
            <button
              type="button"
              onClick={() =>
                alterarSessao(iS, (s) => ({
                  ...s,
                  items: [
                    ...s.items,
                    {
                      exerciseId: EXERCISE_LIBRARY[0].id,
                      blocks: [{ reserveType: "work" as const, sets: 3, repRange: "8-12", rirTarget: 2, restSeconds: 120 }],
                    },
                  ],
                }))
              }
              className="text-[13px] text-accent hover:underline"
            >
              + adicionar exercício
            </button>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            alterar((p) => ({ ...p, sessions: [...p.sessions, { label: `Dia ${p.sessions.length + 1}`, items: [] }] }))
          }
          className="btn-secondary"
        >
          + adicionar dia
        </button>
        <button type="button" onClick={salvar} disabled={salvando} className="btn-primary">
          {salvo ? <IconCheck className="h-4 w-4" /> : null}
          {salvando ? "Salvando…" : salvo ? "Salvo" : "Salvar treino"}
        </button>
      </div>

      {erro && <p className="text-[14px] text-danger">{erro}</p>}
    </section>
  );
}
