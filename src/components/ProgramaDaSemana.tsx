"use client";

/* O programa da semana, renderizado.
 *
 * Extraído de `/treino` para poder ser exercitado fora da página — a página
 * inteira depende de sessão e de dados no Supabase, então até aqui o caminho
 * "gerador → formato de dados → tela" nunca tinha sido visto rodando. Este
 * componente é o mesmo objeto nos dois lugares: se ele renderiza bem com um
 * programa gerado pelo algoritmo, a página renderiza igual.
 */

import { TrainingSession } from "@/lib/trainingBuilder";
import { exerciseById } from "@/lib/exerciseLibrary";
import { SectionHeading } from "@/components/apple";

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
                  {/* SÉRIES × REPETIÇÕES EM PRIMEIRO PLANO.
                      Antes, aquecimento e trabalho saíam lado a lado no mesmo
                      tamanho e na mesma cor — "Aquecimento 2×6-10 · RIR 4 · 90s
                      Trabalho 4×6-10 · RIR 2 · 3 min" —, e o número que a pessoa
                      precisa para executar ficava perdido entre quatro outros.
                      Agora o bloco de trabalho vem grande e sozinho; RIR e
                      descanso descem para uma linha de apoio; e o aquecimento
                      vira nota discreta, porque é preparação e não volume. */}
                  {(() => {
                    const trabalho = item.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset");
                    const aquecimento = item.blocks.filter((b) => b.reserveType === "warmup" || b.reserveType === "feeder");
                    const seriesTrabalho = trabalho.reduce((n, b) => n + b.sets, 0);
                    const faixa = trabalho[0]?.repRange;
                    const rir = trabalho.find((b) => b.rirTarget != null)?.rirTarget;
                    const descanso = trabalho.find((b) => b.restSeconds != null)?.restSeconds;
                    const carga = trabalho.find((b) => b.loadKg != null)?.loadKg;
                    const seriesAquecimento = aquecimento.reduce((n, b) => n + b.sets, 0);
                    return (
                      <>
                        {seriesTrabalho > 0 && (
                          <div className="mt-1 text-[17px] font-semibold tabular-nums tracking-[-0.01em]">
                            {seriesTrabalho}{" "}
                            <span className="text-[13.5px] font-normal text-neutral">
                              {seriesTrabalho === 1 ? "série de" : "séries de"}
                            </span>{" "}
                            {faixa}{" "}
                            <span className="text-[13.5px] font-normal text-neutral">repetições</span>
                            {carga != null && <span className="text-[15px] font-medium text-accent"> · {carga} kg</span>}
                          </div>
                        )}
                        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] tabular-nums text-muted">
                          {rir != null && (
                            <span>
                              deixando <span className="text-foreground">{rir}</span>{" "}
                              {rir === 1 ? "repetição" : "repetições"} na reserva
                            </span>
                          )}
                          {descanso != null && (
                            <span>
                              descanso{" "}
                              <span className="text-foreground">
                                {descanso >= 60 ? `${descanso / 60} min` : `${descanso}s`}
                              </span>
                            </span>
                          )}
                        </div>
                        {seriesAquecimento > 0 && (
                          <p className="mt-1 text-[12.5px] text-neutral">
                            antes: {seriesAquecimento} {seriesAquecimento === 1 ? "série" : "séries"} de aquecimento, sem
                            chegar perto da falha
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
