"use client";

import { useEffect, useMemo, useState } from "react";
import { Cycle } from "@/lib/types";
import { loadCycles, deleteCycle } from "@/lib/storage";
import { extractRules, sortByDate } from "@/lib/dietEngine";
import { fmt, fmtDate } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { loadMyComments, AdminComment } from "@/lib/comments";
import { IconCheck, IconClipboard, IconDrumstick, IconDroplet, IconFlame, IconTrend } from "@/components/icons";
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

  async function handleDeleteCycle(id: string) {
    if (!window.confirm("Excluir esse ciclo do histórico? Isso afeta os cálculos de taxa/TDEE dos próximos ciclos.")) return;
    await deleteCycle(id);
    setCycles((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
  }

  if (!cycles) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 space-y-6">
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-48 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
          <div className="skeleton h-28" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-12">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-in-up">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight gradient-text">Histórico de ciclos</h1>
          <p className="text-sm text-muted mt-2">
            {cycles.length} ciclo{cycles.length !== 1 ? "s" : ""} registrado{cycles.length !== 1 ? "s" : ""} · método
            construído a partir dos seus dados reais de consultoria
          </p>
        </div>
        <div className="flex gap-3">
          <a href="/previsao-ia" className="btn-primary">
            <IconTrend className="h-4 w-4" />
            Novo ciclo
          </a>
          <a href="/ciclos/novo" className="btn-secondary">
            <IconClipboard className="h-4 w-4" />
            Registrar ciclo
          </a>
        </div>
      </section>

      {comments.length > 0 && (
        <section className="space-y-3 animate-fade-in-up stagger-1">
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Recados do administrador</h2>
          {comments.map((c) => (
            <div key={c.id} className="card-glow p-4">
              <div className="text-xs text-muted mb-1">
                {c.authorName ?? "Administrador"} · {fmtDate(c.createdAt.slice(0, 10))}
              </div>
              <p className="text-sm">{c.body}</p>
            </div>
          ))}
        </section>
      )}

      {cycles.length === 0 ? (
        <section className="card p-8 text-center animate-fade-in-up stagger-1">
          <p className="text-sm text-muted">
            Nenhum ciclo registrado para este perfil ainda. Comece estimando uma dieta inicial a partir do seu peso,
            altura e %BF, ou registre um ciclo real se já tiver uma prescrição.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <a href="/previsao-ia" className="btn-primary">
              Começar (informações + fotos)
            </a>
            <a href="/ciclos/novo" className="btn-secondary">
              Registrar ciclo
            </a>
          </div>
        </section>
      ) : (
        <section className="card overflow-hidden animate-fade-in-up stagger-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Peso</th>
                  <th className="px-4 py-3 font-medium">%BF</th>
                  <th className="px-4 py-3 font-medium">Kcal</th>
                  <th className="px-4 py-3 font-medium">Kcal/kg</th>
                  <th className="px-4 py-3 font-medium">Proteína</th>
                  <th className="px-4 py-3 font-medium">Gordura</th>
                  <th className="px-4 py-3 font-medium">Carbo</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {cycles.map((c, i) => (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-surface-raised/60 transition-colors animate-fade-in-up"
                    style={{ animationDelay: `${Math.min(i, 10) * 45}ms` }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtDate(c.date)}
                      {c.isPrediction && (
                        <span className="ml-2 badge bg-warn/15 text-warn">previsão</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium">{fmt(c.weightKg)} kg</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">
                      {c.bodyFatPercent != null ? `${fmt(c.bodyFatPercent)}%` : "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(c.kcal, 0)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted">{fmt(c.kcal / c.weightKg)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmt(c.proteinG, 1)}g{" "}
                      <span className="text-muted">({fmt(c.proteinG / c.weightKg, 1)} g/kg)</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmt(c.fatG, 1)}g{" "}
                      <span className="text-muted">({fmt(c.fatG / c.weightKg, 1)} g/kg)</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{fmt(c.carbG, 1)}g</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteCycle(c.id)}
                        className="text-xs text-muted hover:text-danger transition-colors"
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

      {rules && cycles.length > 0 && (
        <section className="animate-fade-in-up stagger-2">
          <h2 className="text-lg font-semibold tracking-tight mb-1">Regras extraídas</h2>
          <p className="text-sm text-muted mb-5">
            Padrões observados no histórico — hipóteses de trabalho enquanto seguram, não leis confirmadas.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <RuleCard
              icon={<IconDroplet className="h-4 w-4" />}
              label="Gordura"
              numericValue={rules.fatPerKg}
              decimals={2}
              suffix=" g/kg"
              note="Estável nos ciclos observados — repetir até ver desvio."
              tone="stable"
              delayClass="stagger-3"
            />
            <RuleCard
              icon={<IconDrumstick className="h-4 w-4" />}
              label="Proteína"
              numericValue={rules.proteinPerKg}
              decimals={2}
              suffix=" g/kg"
              note={
                rules.proteinStepSuspected
                  ? "Último salto detectado: +0,1 g/kg. Gatilho do degrau ainda desconhecido."
                  : "Repetir o último valor prescrito."
              }
              tone={rules.proteinStepSuspected ? "watch" : "stable"}
              delayClass="stagger-4"
            />
            <RuleCard
              icon={<IconFlame className="h-4 w-4" />}
              label="Kcal/kg"
              numericValue={rules.kcalPerKgLast}
              decimals={1}
              note={`Progressão média de ${fmt(rules.kcalPerKgAvgStep, 2)}/ciclo. Próximo extrapolado: ${fmt(
                rules.kcalPerKgExtrapolated,
                1
              )}.`}
              tone="watch"
              delayClass="stagger-5"
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

      <section className="card p-6 animate-fade-in-up stagger-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-warn/15 text-warn">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          <h3 className="text-sm font-semibold">Limitações do modelo</h3>
        </div>
        <ul className="text-sm text-muted space-y-2 list-disc list-inside marker:text-border">
          <li>Construído com poucos pontos de dado — cada novo ciclo deve testar se as regras seguram.</li>
          <li>%BF é estimado, não medido com precisão (bioimpedância/DEXA melhorariam isso).</li>
          <li>Captura só a parte matemática. Adesão, fotos e exame físico continuam sendo julgamento humano.</li>
          <li>
            <span className="font-mono text-foreground">E</span> (energia por kg ganho) é inferido pela estabilidade
            do %BF, nunca certo sem DEXA seriada.
          </li>
        </ul>
      </section>
    </div>
  );
}

function RuleCard({
  icon,
  label,
  numericValue,
  decimals = 1,
  suffix = "",
  note,
  tone,
  chart,
  delayClass = "",
}: {
  icon: React.ReactNode;
  label: string;
  numericValue: number;
  decimals?: number;
  suffix?: string;
  note: string;
  tone: "stable" | "watch";
  chart?: React.ReactNode;
  delayClass?: string;
}) {
  return (
    <div className={`card p-5 animate-fade-in-up ${delayClass}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
          <span className={`flex h-6 w-6 items-center justify-center rounded-md ${tone === "stable" ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"}`}>
            {icon}
          </span>
          {label}
        </span>
        <span
          className={`h-1.5 w-1.5 rounded-full ${tone === "stable" ? "bg-accent animate-glow-pulse" : "bg-warn"}`}
          title={tone === "stable" ? "Regra estável" : "Em observação"}
        />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight">
        <AnimatedNumber value={numericValue} decimals={decimals} />
        {suffix}
      </div>
      <p className="mt-2 text-xs text-muted leading-relaxed">{note}</p>
      {chart && <div className="mt-3">{chart}</div>}
    </div>
  );
}
