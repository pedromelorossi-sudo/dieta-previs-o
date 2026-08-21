"use client";

import { useEffect, useState } from "react";
import { addCycle } from "@/lib/storage";
import { Cycle } from "@/lib/types";
import { fmt, fmtDate, fmtSigned } from "@/lib/format";
import { clearLastPrediction, loadLastPrediction, LoggedPrediction } from "@/lib/predictionsLog";
import { IconCheck, IconClipboard } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function NovoCicloPage() {
  const { ready, user } = useAuth();
  const [date, setDate] = useState(todayISO());
  const [weightKg, setWeightKg] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [kcal, setKcal] = useState("");
  const [proteinG, setProteinG] = useState("");
  const [fatG, setFatG] = useState("");
  const [carbOverride, setCarbOverride] = useState("");
  const [pending, setPending] = useState<LoggedPrediction | null>(null);
  const [savedCycle, setSavedCycle] = useState<Cycle | null>(null);

  useEffect(() => {
    if (ready && user) loadLastPrediction().then(setPending);
  }, [ready, user]);

  const carbAuto =
    kcal && proteinG && fatG
      ? (parseFloat(kcal) - parseFloat(proteinG) * 4 - parseFloat(fatG) * 9) / 4
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const w = parseFloat(weightKg);
    const k = parseFloat(kcal);
    const p = parseFloat(proteinG);
    const f = parseFloat(fatG);
    if (!date || !user || Number.isNaN(w) || Number.isNaN(k) || Number.isNaN(p) || Number.isNaN(f)) return;
    const carb = carbOverride ? parseFloat(carbOverride) : carbAuto ?? 0;

    const cycle: Cycle = {
      id: crypto.randomUUID(),
      date,
      weightKg: w,
      bodyFatPercent: bodyFat ? parseFloat(bodyFat) : null,
      kcal: k,
      proteinG: p,
      fatG: f,
      carbG: carb,
      origin: "consultoria",
    };
    await addCycle(cycle);
    setSavedCycle(cycle);
  }

  async function handleDismissPrediction() {
    if (!user) return;
    await clearLastPrediction();
    setPending(null);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Registrar ciclo real</h1>
        <p className="text-sm text-muted mt-2">
          Quando a prescrição real da consultoria chegar, registre aqui para atualizar o histórico e as regras.
        </p>
      </div>

      {pending && !savedCycle && (
        <div className="card border-warn/30 bg-warn/5 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Há uma previsão salva para {fmtDate(pending.targetDate)}
            </span>
            <button onClick={handleDismissPrediction} className="text-xs text-muted hover:text-foreground">
              descartar
            </button>
          </div>
          <p className="text-muted mt-1 text-xs">
            Preencha os dados reais abaixo — a comparação (Passo 7) aparece automaticamente ao salvar.
          </p>
        </div>
      )}

      {!savedCycle ? (
        <form onSubmit={handleSubmit} className="card p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
            </Field>
            <Field label="Peso (kg)">
              <input
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label="%BF (opcional)">
              <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} className="input" />
            </Field>
            <Field label="Kcal">
              <input type="number" step="1" value={kcal} onChange={(e) => setKcal(e.target.value)} className="input" required />
            </Field>
            <Field label="Proteína (g)">
              <input
                type="number"
                step="0.1"
                value={proteinG}
                onChange={(e) => setProteinG(e.target.value)}
                className="input"
                required
              />
            </Field>
            <Field label="Gordura (g)">
              <input type="number" step="0.1" value={fatG} onChange={(e) => setFatG(e.target.value)} className="input" required />
            </Field>
            <Field label={`Carboidrato (g) ${carbAuto != null ? `— auto: ${fmt(carbAuto, 1)}g` : ""}`}>
              <input
                type="number"
                step="0.1"
                value={carbOverride}
                onChange={(e) => setCarbOverride(e.target.value)}
                placeholder={carbAuto != null ? fmt(carbAuto, 1) : "calculado como resíduo"}
                className="input"
              />
            </Field>
          </div>
          <button type="submit" className="btn-primary">
            <IconClipboard className="h-4 w-4" />
            Salvar ciclo
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="card border-accent/30 bg-accent/5 p-4 text-sm flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
              <IconCheck className="h-3.5 w-3.5" />
            </span>
            Ciclo de {fmtDate(savedCycle.date)} salvo no histórico.
          </div>

          {pending && (
            <Comparison pending={pending} actual={savedCycle} onDismiss={handleDismissPrediction} />
          )}

          <Link href="/" className="inline-block text-sm text-accent hover:underline">
            Ver histórico atualizado →
          </Link>
        </div>
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

function Comparison({
  pending,
  actual,
  onDismiss,
}: {
  pending: LoggedPrediction;
  actual: Cycle;
  onDismiss: () => void;
}) {
  const rows = [
    errorRow("Peso", pending.weightKg, actual.weightKg, "kg"),
    errorRow("Kcal", pending.kcal, actual.kcal, "", 0),
    errorRow("Proteína", pending.proteinG, actual.proteinG, "g"),
    errorRow("Gordura", pending.fatG, actual.fatG, "g"),
    errorRow("Carboidrato", pending.carbG, actual.carbG, "g"),
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Previsto × Real (Passo 7)</h2>
        <button onClick={onDismiss} className="text-xs text-muted hover:text-foreground">
          limpar previsão
        </button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted text-xs">
            <th className="pb-2 font-medium">Variável</th>
            <th className="pb-2 font-medium">Previsto</th>
            <th className="pb-2 font-medium">Real</th>
            <th className="pb-2 font-medium">Erro</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="py-2.5 font-medium">{r.label}</td>
              <td className="py-2.5 text-muted">{r.predicted}</td>
              <td className="py-2.5">{r.real}</td>
              <td className="py-2.5">
                <span className={r.inRange ? "text-accent" : "text-warn"}>{r.errorText}</span>
                <span className={`ml-2 badge ${r.inRange ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"}`}>
                  {r.inRange ? "dentro" : "fora"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted mt-3">
        Se o erro for sistemático (mesmo sinal, repetido em vários ciclos), ajuste as regras do Passo 4.
      </p>
    </div>
  );
}

function errorRow(
  label: string,
  predicted: { min: number; max: number },
  real: number,
  suffix: string,
  decimals = 1
) {
  const mid = (predicted.min + predicted.max) / 2;
  const inRange = real >= predicted.min && real <= predicted.max;
  const error = real - mid;
  return {
    label,
    predicted: `${fmt(predicted.min, decimals)}–${fmt(predicted.max, decimals)}${suffix ? " " + suffix : ""}`,
    real: `${fmt(real, decimals)}${suffix ? " " + suffix : ""}`,
    errorText: `${fmtSigned(error, decimals)}${suffix ? " " + suffix : ""}`,
    inRange,
  };
}
