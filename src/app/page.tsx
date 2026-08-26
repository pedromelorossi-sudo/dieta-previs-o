"use client";

/* apple-design · arquétipo C (Home/dashboard) · container de grade 1080
 *
 * A composição vem de `patterns.md`:
 *   [nav de vidro] → [herói: sobrancelha viva · H1 · linha de número]
 *   → [feed primário: LISTA UNIFICADA, com segmentado para trocar a visão]
 *   → [seções secundárias em painel] → [nota de limitação]
 *
 * A regra que muda a estrutura: o feed é uma lista unificada por padrão, e a
 * tabela densa é uma OPÇÃO do segmentado — não as duas na tela ao mesmo tempo.
 * Antes isto era um herói + grade de estatística + tabela solta, tudo empilhado.
 *
 * Sistema travado em design.md na raiz.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cycle } from "@/lib/types";
import { loadCycles, deleteCycle } from "@/lib/storage";
import { extractRules, sortByDate } from "@/lib/dietEngine";
import { fmt, fmtDate } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { loadMyComments, AdminComment } from "@/lib/comments";
import { IconClipboard, IconTrend } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import {
  GridPage,
  PageHero,
  Panel,
  SectionHeading,
  Segmented,
  ValueRow,
} from "@/components/apple";

type FeedView = "lista" | "tabela";

export default function DashboardPage() {
  const { ready, user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [feedView, setFeedView] = useState<FeedView>("lista");

  useEffect(() => {
    if (ready && user) {
      loadCycles().then((c) => setCycles(sortByDate(c)));
      loadMyComments()
        .then(setComments)
        .catch((e) => console.error("Erro ao carregar comentários do admin:", e));
    }
  }, [ready, user]);

  const rules = useMemo(() => (cycles ? extractRules(cycles) : null), [cycles]);
  const last = cycles && cycles.length ? cycles[cycles.length - 1] : null;

  async function handleDeleteCycle(id: string) {
    if (!window.confirm("Excluir esse ciclo do histórico? Isso afeta os cálculos de taxa/TDEE dos próximos ciclos.")) return;
    await deleteCycle(id);
    setCycles((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  if (!cycles) {
    return (
      <GridPage>
        <div className="skeleton h-32 w-full max-w-[560px]" />
        <div className="skeleton h-64 w-full" />
      </GridPage>
    );
  }

  /* Do mais recente para o mais antigo: no feed a pessoa quer ver o de agora. */
  const feed = [...cycles].reverse();

  return (
    <GridPage>
      {last ? (
        <PageHero
          eyebrow="Prescrição vigente"
          live
          title={
            <>
              <AnimatedNumber value={last.kcal} decimals={0} /> kcal por dia
            </>
          }
          lede={
            last.isPrediction
              ? `Previsto para ${fmtDate(last.date)} a partir do seu histórico de ciclos.`
              : `Prescrito em ${fmtDate(last.date)} e registrado como medição real.`
          }
          stat={
            <>
              {fmt(last.weightKg)} kg
              <span className="mx-2 text-faint">·</span>
              {last.bodyFatPercent != null ? `${fmt(last.bodyFatPercent)}% de gordura` : "gordura não medida"}
              <span className="mx-2 text-faint">·</span>
              {fmt(last.proteinG / last.weightKg, 2)} g/kg de proteína
              <span className="mx-2 text-faint">·</span>
              {fmt(last.kcal / last.weightKg, 1)} kcal/kg
            </>
          }
          actions={
            <>
              <Link href="/previsao-ia" className="btn-primary">
                <IconTrend className="h-4 w-4" />
                Novo ciclo
              </Link>
              <Link href="/ciclos/novo" className="btn-secondary">
                <IconClipboard className="h-4 w-4" />
                Registrar prescrição
              </Link>
            </>
          }
        />
      ) : (
        <PageHero
          eyebrow="Nenhum ciclo ainda"
          title="O método precisa dos seus números para existir."
          lede="O primeiro ciclo estabelece a linha de base — peso, composição corporal e o que você come hoje. A partir do segundo, o algoritmo passa a retrocalcular seu gasto real em vez de estimá-lo por fórmula."
          actions={
            <>
              <Link href="/previsao-ia" className="btn-primary">
                <IconTrend className="h-4 w-4" />
                Começar com fotos
              </Link>
              <Link href="/ciclos/novo" className="btn-secondary">
                <IconClipboard className="h-4 w-4" />
                Registrar prescrição
              </Link>
            </>
          }
        />
      )}

      {/* Recados do admin: painel de linhas, não caixa colorida. */}
      {comments.length > 0 && (
        <section>
          <SectionHeading title="Recados do administrador" />
          <Panel>
            {comments.map((c) => (
              <div key={c.id} className="panel-row">
                <p className="text-[15px] leading-[1.6]">{c.body}</p>
                <p className="mt-2 text-[13px] tabular-nums text-neutral">
                  {c.authorName ?? "Administrador"} · {fmtDate(c.createdAt.slice(0, 10))}
                </p>
              </div>
            ))}
          </Panel>
        </section>
      )}

      {/* Feed primário — o coração do arquétipo C. */}
      {cycles.length > 0 && (
        <section>
          <SectionHeading
            title="Histórico"
            desc={`${cycles.length} ${cycles.length === 1 ? "ciclo registrado" : "ciclos registrados"}. Cada linha é uma prescrição e o que o corpo respondeu a ela.`}
            right={
              <Segmented
                label="Visão do histórico"
                value={feedView}
                onChange={setFeedView}
                options={[
                  { value: "lista", label: "Lista" },
                  { value: "tabela", label: "Tabela" },
                ]}
              />
            }
          />

          {feedView === "lista" ? (
            <Panel>
              {feed.map((c) => (
                <div key={c.id} className="panel-row">
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[17px] font-semibold tracking-[-0.01em]">{fmtDate(c.date)}</span>
                      {c.isPrediction && <span className="badge">previsão</span>}
                    </div>
                    <span className="shrink-0 text-[19px] font-semibold tabular-nums">{fmt(c.kcal, 0)} kcal</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13.5px] tabular-nums text-muted">
                    <span>{fmt(c.weightKg)} kg</span>
                    <span>{c.bodyFatPercent != null ? `${fmt(c.bodyFatPercent)}% BF` : "BF —"}</span>
                    <span>{fmt(c.kcal / c.weightKg)} kcal/kg</span>
                    <span>
                      P {fmt(c.proteinG, 1)}g · G {fmt(c.fatG, 1)}g · C {fmt(c.carbG, 1)}g
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCycle(c.id)}
                      className="ml-auto text-[13px] text-neutral transition-colors hover:text-danger focus-visible:text-danger"
                      title="Excluir ciclo"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </Panel>
          ) : (
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Data", "Peso", "%BF", "Kcal", "Kcal/kg", "Proteína", "Gordura", "Carbo", ""].map((h) => (
                      <th key={h} className="py-3 pr-5 text-[13px] font-normal text-neutral first:pl-6 last:pr-6">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c.id} className="border-b border-border transition-colors last:border-0 hover:bg-hover">
                      <td className="whitespace-nowrap py-3 pl-6 pr-5">
                        {fmtDate(c.date)}
                        {c.isPrediction && <span className="badge ml-2">previsão</span>}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-5 font-medium">{fmt(c.weightKg)} kg</td>
                      <td className="whitespace-nowrap py-3 pr-5 text-muted">
                        {c.bodyFatPercent != null ? `${fmt(c.bodyFatPercent)}%` : "—"}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-5">{fmt(c.kcal, 0)}</td>
                      <td className="whitespace-nowrap py-3 pr-5 text-muted">{fmt(c.kcal / c.weightKg)}</td>
                      <td className="whitespace-nowrap py-3 pr-5">
                        {fmt(c.proteinG, 1)}g <span className="text-muted">({fmt(c.proteinG / c.weightKg, 1)} g/kg)</span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-5">
                        {fmt(c.fatG, 1)}g <span className="text-muted">({fmt(c.fatG / c.weightKg, 1)} g/kg)</span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-5">{fmt(c.carbG, 1)}g</td>
                      <td className="whitespace-nowrap py-3 pr-6 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteCycle(c.id)}
                          className="text-[13px] text-neutral transition-colors hover:text-danger focus-visible:text-danger"
                          title="Excluir ciclo"
                        >
                          Excluir
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </section>
      )}

      {/* Regras extraídas: painel de linhas rótulo-esquerda / valor-direita. */}
      {rules && cycles.length > 0 && (
        <section>
          <SectionHeading
            title="Regras extraídas do histórico"
            desc="Padrões que se mantiveram até aqui. São hipóteses de trabalho enquanto seguram, não leis confirmadas — cada ciclo novo testa se continuam valendo."
          />
          <Panel>
            <ValueRow
              label="Gordura"
              hint="Estável nos ciclos observados — repetir até aparecer desvio."
              value={`${fmt(rules.fatPerKg, 2)} g/kg`}
              emphasis
            />
            <ValueRow
              label="Proteína"
              hint={
                rules.proteinStepSuspected
                  ? "Último salto: +0,1 g/kg. O gatilho do degrau ainda não é conhecido."
                  : "Repete o último valor prescrito."
              }
              value={`${fmt(rules.proteinPerKg, 2)} g/kg`}
              emphasis
            />
            <div className="panel-row">
              <div className="flex items-baseline justify-between gap-5">
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">Densidade calórica</div>
                  <div className="mt-0.5 text-[13px] leading-[1.45] text-neutral">
                    Progressão média de {fmt(rules.kcalPerKgAvgStep, 2)} por ciclo. Próximo extrapolado:{" "}
                    {fmt(rules.kcalPerKgExtrapolated, 1)}.
                  </div>
                </div>
                <div className="shrink-0 text-[19px] font-semibold tabular-nums">
                  {fmt(rules.kcalPerKgLast, 1)} kcal/kg
                </div>
              </div>
              <div className="mt-3">
                <Sparkline
                  values={rules.kcalPerKgSeries.map((s) => s.value)}
                  projectedNext={rules.kcalPerKgExtrapolated}
                />
              </div>
            </div>
          </Panel>
        </section>
      )}

      {/* Limitações: prosa solta sob um fio. Nunca caixa de destaque — a regra 3
          da skill diz que espaço em branco resolve antes de moldura. */}
      <section className="border-t border-border pt-8">
        <h2 className="text-[17px]">O que este método não sabe</h2>
        <ul className="mt-4 max-w-[720px] space-y-3 text-[14.5px] leading-[1.65] text-muted">
          <li>
            Foi construído com poucos pontos de dado. Cada ciclo novo é um teste de se as regras seguram, não uma
            confirmação de que seguram.
          </li>
          <li>
            Por padrão o %BF é estimado por foto, não medido. Quem tem acesso a DEXA, bioimpedância, adipometria ou
            ultrassom pode informar o valor medido — ele substitui a leitura da foto, não só a acompanha.
          </li>
          <li>
            Captura a parte matemática. Adesão, aparência nas fotos e exame físico continuam sendo julgamento humano.
          </li>
          <li>
            <span className="tabular-nums text-foreground">E</span> — a energia por quilo ganho — é inferido pela
            estabilidade do %BF. Sem uma série de exames medidos, nunca é certo.
          </li>
        </ul>
      </section>
    </GridPage>
  );
}
