"use client";

/* apple-design · arquétipo D (Formulário) · coluna de leitura 720
 * Grupos = painéis brancos de linhas; linha = rótulo à esquerda, controle à
 * direita. Antes era uma grade de dois campos empilhados dentro de um cartão.
 */

import { useEffect, useState } from "react";
import { addCycle } from "@/lib/storage";
import { Cycle } from "@/lib/types";
import { fmt, fmtDate, fmtSigned } from "@/lib/format";
import { clearLastPrediction, loadLastPrediction, LoggedPrediction } from "@/lib/predictionsLog";
import { IconCheck, IconClipboard } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";
import { ReadingPage, PageHero, FormPanel, FormRow, Panel } from "@/components/apple";

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
    <ReadingPage>
      <PageHero
        eyebrow="Histórico"
        title="Registrar ciclo real"
        lede="Quando a prescrição real da consultoria chegar, registre aqui para atualizar o histórico e as regras."
      />

      {pending && !savedCycle && (
        <Panel>
          <div className="panel-row">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[15px] font-medium">
                Há uma previsão salva para {fmtDate(pending.targetDate)}
              </span>
              <button onClick={handleDismissPrediction} className="shrink-0 text-[13px] text-neutral transition-colors hover:text-foreground">
                Descartar
              </button>
            </div>
            <p className="mt-1 text-[13.5px] leading-[1.5] text-muted">
              Preencha os dados reais abaixo — a comparação (Passo 7) aparece automaticamente ao salvar.
            </p>
          </div>
        </Panel>
      )}

      {!savedCycle ? (
        <form onSubmit={handleSubmit} className="space-y-[clamp(24px,4vw,36px)]">
          <FormPanel label="Medição">
            <FormRow label="Data">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" required />
            </FormRow>
            <FormRow label="Peso" hint="Em quilos, na mesma balança e horário de sempre.">
              <input
                type="number"
                step="0.1"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="input"
                required
              />
            </FormRow>
            <FormRow label="Gordura corporal" hint="Opcional. Deixe vazio se não mediu.">
              <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} className="input" />
            </FormRow>
          </FormPanel>

          <FormPanel
            label="Prescrição"
            footer="O carboidrato é calculado como resíduo das calorias. Preencha só se a consultoria mandou um valor diferente."
          >
            <FormRow label="Calorias">
              <input type="number" step="1" value={kcal} onChange={(e) => setKcal(e.target.value)} className="input" required />
            </FormRow>
            <FormRow label="Proteína" hint="Em gramas por dia.">
              <input
                type="number"
                step="0.1"
                value={proteinG}
                onChange={(e) => setProteinG(e.target.value)}
                className="input"
                required
              />
            </FormRow>
            <FormRow label="Gordura" hint="Em gramas por dia.">
              <input type="number" step="0.1" value={fatG} onChange={(e) => setFatG(e.target.value)} className="input" required />
            </FormRow>
            <FormRow
              label="Carboidrato"
              hint={carbAuto != null ? `Calculado: ${fmt(carbAuto, 1)} g` : "Calculado como resíduo."}
            >
              <input
                type="number"
                step="0.1"
                value={carbOverride}
                onChange={(e) => setCarbOverride(e.target.value)}
                placeholder={carbAuto != null ? fmt(carbAuto, 1) : "resíduo"}
                className="input"
              />
            </FormRow>
          </FormPanel>

          <button type="submit" className="btn-primary">
            <IconClipboard className="h-4 w-4" />
            Salvar ciclo
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <Panel>
            <div className="panel-row flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-white">
                <IconCheck className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-medium">Ciclo de {fmtDate(savedCycle.date)} salvo no histórico.</span>
            </div>
          </Panel>

          {pending && (
            <Comparison pending={pending} actual={savedCycle} onDismiss={handleDismissPrediction} />
          )}

          <Link href="/" className="btn-secondary">
            Ver histórico atualizado
          </Link>
        </div>
      )}
    </ReadingPage>
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
    <section>
      <div className="mb-4 flex items-end justify-between gap-4">
        <h2 className="text-[20px]">Previsto × Real</h2>
        <button onClick={onDismiss} className="shrink-0 text-[13px] text-neutral transition-colors hover:text-foreground">
          Limpar previsão
        </button>
      </div>
      <div className="panel overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            {["Variável", "Previsto", "Real", "Erro"].map((h) => (
              <th key={h} className="py-3 pr-5 text-[13px] font-normal text-neutral first:pl-6 last:pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border last:border-0">
              <td className="py-3 pl-6 pr-5 font-medium">{r.label}</td>
              <td className="py-3 pr-5 tabular-nums text-muted">{r.predicted}</td>
              <td className="py-3 pr-5 tabular-nums">{r.real}</td>
              <td className="py-3 pr-6">
                <span className={`tabular-nums ${r.inRange ? "text-accent" : "text-warn"}`}>{r.errorText}</span>
                <span className="badge ml-2">{r.inRange ? "dentro" : "fora"}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      <p className="mt-3 px-1 text-[13px] leading-[1.5] text-neutral">
        Se o erro for sistemático (mesmo sinal, repetido em vários ciclos), ajuste as regras do Passo 4.
      </p>
    </section>
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
