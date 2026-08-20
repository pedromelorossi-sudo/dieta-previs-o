"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cycle, GainComposition } from "@/lib/types";
import { loadCycles } from "@/lib/storage";
import { E_SCENARIOS, predictNextCycle, sortByDate } from "@/lib/dietEngine";
import { fmt, fmtDate, fmtPercent, fmtSigned } from "@/lib/format";
import { saveLastPrediction } from "@/lib/predictionsLog";
import { IconCheck, IconClipboard, IconDrumstick, IconDroplet, IconFlame, IconScale, IconTarget, IconTrend, IconWheat } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function PrevisaoPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayISO());
  const [weeks, setWeeks] = useState("4");
  const [composition, setComposition] = useState<GainComposition>("misto");
  const [stabilityMode, setStabilityMode] = useState(false);
  const [applyProteinStep, setApplyProteinStep] = useState(false);
  const [savedResult, setSavedResult] = useState<typeof result>(null);

  useEffect(() => {
    if (ready && user) loadCycles().then((c) => setCycles(sortByDate(c)));
  }, [ready, user]);

  const last = cycles && cycles.length ? cycles[cycles.length - 1] : null;

  const result = useMemo(() => {
    if (!cycles || !weight || !weeks) return null;
    const w = parseFloat(weight);
    const wk = parseFloat(weeks);
    if (Number.isNaN(w) || Number.isNaN(wk) || w <= 0 || wk <= 0) return null;
    return predictNextCycle({
      history: cycles,
      currentWeightKg: w,
      currentDate: date,
      weeksToNextConsult: wk,
      gainComposition: composition,
      stabilityMode,
      applyProteinStep,
    });
  }, [cycles, weight, date, weeks, composition, stabilityMode, applyProteinStep]);

  // Antes isto era um efeito que chamava setSaved(false) a cada mudança de `result` — um setState
  // síncrono dentro de efeito, que o React 19 sinaliza porque dispara um render em cascata. "Já salvei
  // ESTE resultado?" é estado derivado: basta guardar qual resultado foi salvo e comparar.
  const saved = savedResult !== null && savedResult === result;

  async function handleSavePrediction() {
    if (!result || !weeks || !user) return;
    const target = new Date(date);
    target.setDate(target.getDate() + Math.round(parseFloat(weeks) * 7));
    await saveLastPrediction({
      createdAt: new Date().toISOString(),
      targetDate: target.toISOString().slice(0, 10),
      kcal: result.kcalRange,
      proteinG: result.proteinRange,
      fatG: result.fatRange,
      carbG: result.carbRange,
      weightKg: result.projectedWeightRange,
    });
    setSavedResult(result);
  }

  async function handleGoToDietBuilder() {
    await handleSavePrediction();
    router.push("/dieta/novo");
  }

  if (!cycles) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (!last) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-muted">
          Nenhum ciclo no histórico ainda.{" "}
          <a href="/previsao-ia" className="text-accent hover:underline">
            Estime uma dieta inicial
          </a>{" "}
          pelo peso, altura e %BF, ou{" "}
          <a href="/ciclos/novo" className="text-accent hover:underline">
            registre o primeiro ciclo
          </a>{" "}
          antes de gerar uma previsão baseada em histórico.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">Nova previsão</h1>
        <p className="text-sm text-muted mt-2">
          Baseado no último ciclo registrado ({fmtDate(last.date)}: {fmt(last.weightKg)} kg,{" "}
          {fmt(last.kcal, 0)} kcal).
        </p>
      </div>

      <form className="card p-6 space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Peso atual (kg)">
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="ex: 85.2"
              className="input"
            />
          </Field>
          <Field label="Data da pesagem">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </Field>
          <Field label="Semanas até a próxima consulta">
            <input
              type="number"
              step="1"
              min="1"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Composição do ganho">
            <select
              value={composition}
              onChange={(e) => setComposition(e.target.value as GainComposition)}
              disabled={stabilityMode}
              className="input disabled:opacity-40"
            >
              {E_SCENARIOS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} (E {fmt(s.min, 0)}
                  {s.min !== s.max ? `–${fmt(s.max, 0)}` : ""})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised/50 p-3.5 text-sm cursor-pointer hover:border-accent/30 transition-colors">
          <input
            type="checkbox"
            checked={stabilityMode}
            onChange={(e) => setStabilityMode(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Modo estabilidade</span>
            <span className="block text-muted text-xs mt-0.5">
              O peso ficou parado por 2-3 semanas na ingestão atual, sem mudança de dieta. Usa essa ingestão
              diretamente como manutenção — mais preciso, elimina o chute de E.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised/50 p-3.5 text-sm cursor-pointer hover:border-accent/30 transition-colors">
          <input
            type="checkbox"
            checked={applyProteinStep}
            onChange={(e) => setApplyProteinStep(e.target.checked)}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="font-medium">Aplicar degrau de proteína (+0,1 g/kg)</span>
            <span className="block text-muted text-xs mt-0.5">
              O gatilho do degrau ainda é desconhecido — marque se você acredita que este ciclo terá o salto.
            </span>
          </span>
        </label>
      </form>

      {result && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              icon={<IconTrend className="h-4 w-4" />}
              label="Taxa observada"
              value={`${fmtSigned(result.rateKgWeek, 2)} kg/semana`}
              hint="Passo 1"
            />
            <StatCard
              icon={<IconTarget className="h-4 w-4" />}
              label="Manutenção estimada (TDEE)"
              value={
                result.usedStabilityMode
                  ? `${fmt(result.tdeeRange.min, 0)} kcal`
                  : `${fmt(result.tdeeRange.min, 0)}–${fmt(result.tdeeRange.max, 0)} kcal`
              }
              hint={result.usedStabilityMode ? "Passo 2 · modo estabilidade" : "Passo 2 · faixa por E"}
            />
            <StatCard
              icon={<IconFlame className="h-4 w-4" />}
              label="Superávit relativo"
              value={
                result.usedStabilityMode
                  ? fmtPercent(result.surplusPercentRange.min)
                  : `${fmtPercent(result.surplusPercentRange.min)} a ${fmtPercent(result.surplusPercentRange.max)}`
              }
              hint="Passo 3"
            />
            <StatCard
              icon={<IconScale className="h-4 w-4" />}
              label="Peso projetado"
              value={`${fmt(result.projectedWeightRange.min)}–${fmt(result.projectedWeightRange.max)} kg`}
              hint="Passo 5"
            />
          </div>

          <div className="card-glow p-6">
            <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                <IconTarget className="h-3.5 w-3.5" />
              </span>
              Prescrição prevista para o próximo ciclo
            </h2>
            <div className="grid gap-5 sm:grid-cols-4">
              <MacroCard icon={<IconFlame className="h-4 w-4" />} label="Kcal" range={result.kcalRange} decimals={0} />
              <MacroCard
                icon={<IconDrumstick className="h-4 w-4" />}
                label="Proteína"
                range={result.proteinRange}
                suffix="g"
                sub={`${fmt(result.proteinPerKgUsed, 2)} g/kg`}
              />
              <MacroCard
                icon={<IconDroplet className="h-4 w-4" />}
                label="Gordura"
                range={result.fatRange}
                suffix="g"
                sub={`${fmt(result.fatPerKgUsed, 2)} g/kg`}
              />
              <MacroCard icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" range={result.carbRange} suffix="g" sub="resíduo" />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
            <button type="button" onClick={handleSavePrediction} className="btn-primary">
              {saved ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
              {saved ? "Previsão salva" : "Salvar esta previsão (Passo 7)"}
            </button>
            <button type="button" onClick={handleGoToDietBuilder} className="btn-secondary">
              Montar dieta com essas metas →
            </button>
            <p className="text-xs text-muted leading-relaxed">
              Anota a previsão antes da consulta real, para comparar depois em{" "}
              <a href="/ciclos/novo" className="text-accent hover:underline">
                Registrar ciclo
              </a>
              .
            </p>
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Faixa reflete a incerteza de E (composição do ganho) e a extrapolação linear das regras do histórico.
          </p>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-raised text-muted">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">{hint}</div>
    </div>
  );
}

function MacroCard({
  icon,
  label,
  range,
  suffix = "kcal",
  decimals = 1,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  range: { min: number; max: number };
  suffix?: string;
  decimals?: number;
  sub?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-lg">
        {fmt(range.min, decimals)}–{fmt(range.max, decimals)}
        <span className="text-muted font-normal text-xs"> {suffix}</span>
      </div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
}
