"use client";

/* O programa da semana, renderizado.
 *
 * Extraído de `/treino` para poder ser exercitado fora da página — a página
 * inteira depende de sessão e de dados no Supabase, então até aqui o caminho
 * "gerador → formato de dados → tela" nunca tinha sido visto rodando. Este
 * componente é o mesmo objeto nos dois lugares: se ele renderiza bem com um
 * programa gerado pelo algoritmo, a página renderiza igual.
 */

import { TrainingSession, ReserveType } from "@/lib/trainingBuilder";
import { exerciseById } from "@/lib/exerciseLibrary";
import { SectionHeading } from "@/components/apple";

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

/** Duração estimada da sessão. Existe porque o teto de séries por sessão foi
 * calibrado em tempo de academia, e sem mostrar o tempo o número 24 é
 * arbitrário para quem lê. Conta execução (~45 s por série) + o descanso
 * prescrito + ~1 min de troca por exercício. */
function minutosEstimados(sessao: TrainingSession): number {
  let segundos = 0;
  for (const item of sessao.items) {
    segundos += 60; // montagem / deslocamento até a estação
    for (const b of item.blocks) {
      segundos += b.sets * (45 + (b.restSeconds ?? 90));
    }
  }
  return Math.round(segundos / 60);
}

export function ProgramaDaSemana({ sessions }: { sessions: TrainingSession[] }) {
  if (sessions.length === 0) return null;

  return (
    <section>
      <SectionHeading
        title="Seu programa"
        desc="Divisão por padrão de movimento. Cada exercício vem com séries, faixa de repetição, quantas repetições deixar na reserva (RIR) e o intervalo entre séries."
      />
      <div className="space-y-4">
        {sessions.map((sessao, i) => (
          <div key={`${sessao.label}-${i}`} className="panel">
            <div className="panel-row flex items-baseline justify-between gap-4">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{sessao.label}</h3>
              <span className="shrink-0 text-[13px] tabular-nums text-neutral">
                {seriesEfetivas(sessao)} séries · ~{minutosEstimados(sessao)} min
              </span>
            </div>
            {sessao.items.map((item, j) => {
              const ex = exerciseById(item.exerciseId);
              return (
                <div key={`${item.exerciseId}-${j}`} className="panel-row">
                  {/* Só o nome do exercício. O grupamento muscular ("Costas",
                      "Tríceps") era informação de auditoria vazando para a tela
                      de execução: quem vai treinar precisa saber O QUE fazer e
                      QUANTO, não a taxonomia por trás da escolha. A análise por
                      grupo continua existindo, mais abaixo na página. */}
                  <span className="text-[15px] font-medium">{ex?.name ?? item.exerciseId}</span>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] tabular-nums text-muted">
                    {item.blocks.map((b, k) => (
                      <span key={k}>
                        <span className="text-neutral">{RESERVE_LABEL[b.reserveType]}</span> {b.sets}×{b.repRange}
                        {b.rirTarget != null && <span className="text-neutral"> · RIR {b.rirTarget}</span>}
                        {b.restSeconds != null && (
                          <span className="text-neutral">
                            {" "}
                            · {b.restSeconds >= 60 ? `${b.restSeconds / 60} min` : `${b.restSeconds}s`}
                          </span>
                        )}
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
  );
}
