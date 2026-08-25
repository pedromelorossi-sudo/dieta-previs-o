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
import { ReserveType } from "@/lib/trainingBuilder";

/** Nome de cada bloco na tela. Existe porque "warmup"/"feeder"/"work"/"topset"
 * é vocabulário do modelo de dados, não da pessoa que vai treinar. */
const BLOCO_LABEL: Record<ReserveType, string> = {
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
        desc="Divisão por padrão de movimento. Cada exercício traz os blocos na ordem de execução: aquecimento e aproximação preparam e não contam como volume; as séries de TRABALHO param perto da falha; o TOP SET é a última, levada até a falha dentro da faixa — é ela que define se a carga sobe na semana seguinte."
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
                  {/* CADA BLOCO ROTULADO, um por linha.
                      A versão anterior somava work + top set num "3 séries de
                      5-7 repetições" — legível, mas apagava a distinção que é o
                      centro da metodologia: as séries de trabalho param a 1-2
                      repetições da falha e a ÚLTIMA vai até a falha. Sem
                      separar, a pessoa não sabe em qual série apertar.

                      Agora cada bloco tem nome ("Trabalho", "Top set"), a
                      contagem diz "série"/"séries" e "repetições" por extenso, e
                      o esforço vem em palavras em vez de "RIR 2" — sigla que só
                      significa algo para quem já sabe o que é. */}
                  <div className="mt-2 space-y-1">
                    {item.blocks.map((b, k) => {
                      const nome = BLOCO_LABEL[b.reserveType];
                      const esforco =
                        b.reserveType === "warmup"
                          ? "bem longe da falha"
                          : b.reserveType === "feeder"
                            ? "longe da falha, só para pegar o movimento"
                            : b.rirTarget === 0
                              ? "até a falha, dentro da faixa"
                              : b.rirTarget != null
                                ? `parando com ${b.rirTarget} ${b.rirTarget === 1 ? "repetição" : "repetições"} na reserva`
                                : null;
                      const destaque = b.reserveType === "work" || b.reserveType === "topset";
                      return (
                        <div key={k} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[14px]">
                          <span
                            className={`w-[92px] shrink-0 text-[12.5px] uppercase tracking-[0.04em] ${
                              destaque ? "text-accent" : "text-neutral"
                            }`}
                          >
                            {nome}
                          </span>
                          <span className={`tabular-nums ${destaque ? "font-semibold" : ""}`}>
                            {b.sets} {b.sets === 1 ? "série" : "séries"}
                          </span>
                          <span className="text-neutral">de</span>
                          <span className={`tabular-nums ${destaque ? "font-semibold" : ""}`}>{b.repRange}</span>
                          <span className="text-neutral">
                            {b.repRange === "1" ? "repetição" : "repetições"}
                          </span>
                          {b.loadKg != null && (
                            <span className="tabular-nums font-medium text-accent">· {b.loadKg} kg</span>
                          )}
                          {esforco && <span className="text-[13px] text-muted">— {esforco}</span>}
                        </div>
                      );
                    })}
                    {(() => {
                      const descanso = item.blocks.find(
                        (b) => (b.reserveType === "work" || b.reserveType === "topset") && b.restSeconds != null
                      )?.restSeconds;
                      if (descanso == null) return null;
                      return (
                        <p className="pt-0.5 text-[13px] text-neutral">
                          <span className="inline-block w-[92px]" />
                          descanso de {descanso >= 60 ? `${descanso / 60} min` : `${descanso}s`} entre as séries
                        </p>
                      );
                    })()}
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
