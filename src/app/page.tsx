"use client";

/* Hallmark · macrostructure: Stat-Led · genre: modern-minimal · tone: technical
 * theme: projeto (preservado — âmbar #eab308 sobre #0b0c0d, Geist) · enrichment: none
 * reveal: number-tick no número do herói apenas · nav: existente (layout.tsx)
 * sistema travado em design.md na raiz
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

export default function DashboardPage() {
  const { ready, user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [comments, setComments] = useState<AdminComment[]>([]);

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
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-20 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* ---- Herói Stat-Led: o número é o conteúdo, mas nunca aparece sozinho ---- */}
      <section className="border-b border-border pb-10">
        {last ? (
          <>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
              <span className="font-mono text-[clamp(3.5rem,12vw,7rem)] font-semibold leading-[0.85] tracking-[-0.04em] tabular-nums">
                <AnimatedNumber value={last.kcal} decimals={0} />
              </span>
              <span className="pb-2 text-xl text-muted">kcal/dia</span>
            </div>
            <p className="mt-5 max-w-xl text-lg leading-snug tracking-tight">
              é o que está prescrito desde{" "}
              <span className="text-accent">{fmtDate(last.date)}</span>
              {last.isPrediction ? ", a partir de uma previsão." : ", a partir de uma prescrição registrada."}
            </p>

            <dl className="mt-7 flex flex-wrap gap-x-8 gap-y-3 text-sm">
              <Figure label="Peso" value={`${fmt(last.weightKg)} kg`} />
              <Figure label="Gordura" value={last.bodyFatPercent != null ? `${fmt(last.bodyFatPercent)}%` : "não medida"} />
              <Figure label="Proteína" value={`${fmt(last.proteinG / last.weightKg, 2)} g/kg`} />
              <Figure label="Densidade" value={`${fmt(last.kcal / last.weightKg, 1)} kcal/kg`} />
              <Figure label="Ciclos" value={String(cycles.length)} />
            </dl>
          </>
        ) : (
          <>
            <h1 className="max-w-2xl text-[clamp(1.9rem,5vw,2.9rem)] font-semibold leading-tight tracking-[-0.03em]">
              Nenhum ciclo ainda. O método precisa dos seus números para existir.
            </h1>
            <p className="mt-4 max-w-xl text-muted leading-relaxed">
              O primeiro ciclo estabelece a linha de base — peso, composição corporal e o que você come hoje.
              A partir do segundo, o algoritmo passa a retrocalcular seu gasto real em vez de estimá-lo por fórmula.
            </p>
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/previsao-ia" className="btn-primary">
            <IconTrend className="h-4 w-4" />
            {last ? "Novo ciclo" : "Começar com fotos"}
          </Link>
          <Link href="/ciclos/novo" className="btn-secondary">
            <IconClipboard className="h-4 w-4" />
            Registrar prescrição
          </Link>
        </div>
      </section>

      {/* ---- Recados do admin: hairline, não cartão brilhante ---- */}
      {comments.length > 0 && (
        <section className="border-b border-border py-8">
          <h2 className="text-xs uppercase tracking-[0.12em] text-muted">Recados do administrador</h2>
          <div className="mt-4 space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="border-l-2 border-accent/50 pl-4">
                <p className="text-sm leading-relaxed">{c.body}</p>
                <p className="mt-1.5 font-mono text-xs text-muted tabular-nums">
                  {c.authorName ?? "Administrador"} · {fmtDate(c.createdAt.slice(0, 10))}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- Blocos de estatística separados por régua, não cartões em grade ---- */}
      {rules && cycles.length > 0 && (
        <section className="border-b border-border py-8">
          <h2 className="text-xs uppercase tracking-[0.12em] text-muted">Regras extraídas do histórico</h2>
          <p className="mt-2 max-w-xl text-sm text-muted leading-relaxed">
            Padrões que se mantiveram até aqui. São hipóteses de trabalho enquanto seguram, não leis confirmadas —
            cada ciclo novo testa se continuam valendo.
          </p>

          <div className="mt-6 grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            <StatBlock
              label="Gordura"
              value={fmt(rules.fatPerKg, 2)}
              unit="g/kg"
              note="Estável nos ciclos observados — repetir até aparecer desvio."
              steady
            />
            <StatBlock
              label="Proteína"
              value={fmt(rules.proteinPerKg, 2)}
              unit="g/kg"
              note={
                rules.proteinStepSuspected
                  ? "Último salto: +0,1 g/kg. O gatilho do degrau ainda não é conhecido."
                  : "Repete o último valor prescrito."
              }
              steady={!rules.proteinStepSuspected}
            />
            <StatBlock
              label="Densidade calórica"
              value={fmt(rules.kcalPerKgLast, 1)}
              unit="kcal/kg"
              note={`Progressão média de ${fmt(rules.kcalPerKgAvgStep, 2)} por ciclo. Próximo extrapolado: ${fmt(rules.kcalPerKgExtrapolated, 1)}.`}
              chart={
                <Sparkline
                  values={rules.kcalPerKgSeries.map((s) => s.value)}
                  projectedNext={rules.kcalPerKgExtrapolated}
                />
              }
            />
          </div>
        </section>
      )}

      {/* ---- Histórico ---- */}
      {cycles.length > 0 && (
        <section className="border-b border-border py-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-xs uppercase tracking-[0.12em] text-muted">Histórico</h2>
            <span className="font-mono text-xs text-muted tabular-nums">
              {cycles.length} {cycles.length === 1 ? "ciclo" : "ciclos"}
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Data", "Peso", "%BF", "Kcal", "Kcal/kg", "Proteína", "Gordura", "Carbo", ""].map((h) => (
                    <th key={h} className="py-2.5 pr-5 font-mono text-xs font-normal uppercase tracking-wider text-muted last:pr-0">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cycles.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-surface-raised/50">
                    <td className="whitespace-nowrap py-3 pr-5">
                      {fmtDate(c.date)}
                      {c.isPrediction && <span className="ml-2 badge bg-warn/15 text-warn">previsão</span>}
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
                    <td className="whitespace-nowrap py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteCycle(c.id)}
                        className="text-xs text-muted transition-colors hover:text-danger focus-visible:text-danger"
                        title="Excluir ciclo"
                      >
                        excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ---- Limitações: nota de rodapé, não cartão de destaque ---- */}
      <section className="py-8">
        <h2 className="text-xs uppercase tracking-[0.12em] text-muted">O que este método não sabe</h2>
        <ul className="mt-4 max-w-2xl space-y-2.5 text-sm leading-relaxed text-muted">
          <li>
            Foi construído com poucos pontos de dado. Cada ciclo novo é um teste de se as regras seguram, não uma
            confirmação de que seguram.
          </li>
          <li>O %BF é estimado por foto, não medido. Bioimpedância ou DEXA fechariam essa lacuna.</li>
          <li>
            Captura a parte matemática. Adesão, aparência nas fotos e exame físico continuam sendo julgamento humano.
          </li>
          <li>
            <span className="font-mono text-foreground">E</span> — a energia por quilo ganho — é inferido pela
            estabilidade do %BF. Sem DEXA seriada, nunca é certo.
          </li>
        </ul>
      </section>
    </div>
  );
}

/** Figura de apoio do herói: rótulo pequeno acima, valor tabular abaixo. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Bloco de estatística separado por régua. Substitui o cartão em grade de três colunas —
 * o número é o conteúdo, a moldura não precisa competir com ele. */
function StatBlock({
  label,
  value,
  unit,
  note,
  steady,
  chart,
}: {
  label: string;
  value: string;
  unit: string;
  note: string;
  steady?: boolean;
  chart?: React.ReactNode;
}) {
  return (
    <div className="px-0 py-5 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</span>
        <span
          className={`h-1 w-1 rounded-full ${steady ? "bg-accent" : "bg-warn"}`}
          title={steady ? "Estável" : "Em observação"}
        />
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="text-sm text-muted">{unit}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
      {chart && <div className="mt-3">{chart}</div>}
    </div>
  );
}
