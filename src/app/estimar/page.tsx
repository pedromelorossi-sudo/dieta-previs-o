"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BodyCompositionResult, PATH_LABEL, Sex, estimateBodyComposition } from "@/lib/bodyComposition";
import { ActivityLevel, ACTIVITY_LABEL, loadPreferences } from "@/lib/questionnaire";
import { fmt, fmtSigned } from "@/lib/format";
import { saveLastPrediction } from "@/lib/predictionsLog";
import { addCycle } from "@/lib/storage";
import { Cycle } from "@/lib/types";
import { IconCheck, IconDroplet, IconFlame, IconScale, IconTarget, IconWheat } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function EstimarPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bodyFat, setBodyFat] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>("masculino");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>("moderado");
  const [savedPrediction, setSavedPrediction] = useState(false);
  const [savedCycle, setSavedCycle] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    loadPreferences().then((prefs) => setActivityLevel(prefs.activityLevel));
  }, [ready, user]);

  const result: BodyCompositionResult | null = useMemo(() => {
    const w = parseFloat(weight);
    const h = parseFloat(height);
    const bf = parseFloat(bodyFat);
    const a = parseFloat(age);
    if (
      Number.isNaN(w) || Number.isNaN(h) || Number.isNaN(bf) || Number.isNaN(a) ||
      w <= 0 || h <= 0 || bf <= 0 || bf >= 60 || a <= 0 || a >= 100
    )
      return null;
    return estimateBodyComposition({ weightKg: w, heightCm: h, bodyFatPercent: bf, age: a, sex, activityLevel });
  }, [weight, height, bodyFat, age, sex, activityLevel]);

  async function handleUseTargets() {
    if (!result || !user) return;
    await saveLastPrediction({
      createdAt: new Date().toISOString(),
      targetDate: todayISO(),
      kcal: { min: result.targetKcal, max: result.targetKcal },
      proteinG: { min: result.targetProteinG, max: result.targetProteinG },
      fatG: { min: result.targetFatG, max: result.targetFatG },
      carbG: { min: result.targetCarbG, max: result.targetCarbG },
      weightKg: { min: parseFloat(weight), max: parseFloat(weight) },
    });
    setSavedPrediction(true);
  }

  async function handleSaveAsFirstCycle() {
    if (!result || !user) return;
    const cycle: Cycle = {
      id: crypto.randomUUID(),
      date: todayISO(),
      weightKg: parseFloat(weight),
      bodyFatPercent: parseFloat(bodyFat),
      kcal: result.targetKcal,
      proteinG: result.targetProteinG,
      fatG: result.targetFatG,
      carbG: result.targetCarbG,
      isPrediction: true,
      origin: "estimativa",
    };
    await addCycle(cycle);
    setSavedCycle(true);
  }

  async function handleGoToDietBuilder() {
    await handleUseTargets();
    router.push("/dieta/novo");
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">Estimar dieta inicial</h1>
        <p className="text-sm text-muted mt-2">
          Sem histórico de ciclos? Estime um ponto de partida a partir do peso, altura e %BF — o algoritmo decide
          entre cutting, normocalórico ou bulking e sugere os macros.
        </p>
      </div>

      <div className="card p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Peso (kg)">
            <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="ex: 78" className="input" />
          </Field>
          <Field label="Altura (cm)">
            <input type="number" step="1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="ex: 178" className="input" />
          </Field>
          <Field label="%BF estimado">
            <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="ex: 16" className="input" />
          </Field>
          <Field label="Idade">
            <input type="number" step="1" value={age} onChange={(e) => setAge(e.target.value)} placeholder="ex: 30" className="input" />
          </Field>
          <Field label="Sexo biológico (referência de %BF e TMB)">
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
          </Field>
          <Field label="Nível de atividade física">
            <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)} className="input">
              {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-muted">
          TMB estimada pela média de duas fórmulas: Katch-McArdle (massa magra a partir do %BF) e Mifflin-St Jeor
          (peso, altura, idade e sexo) — a segunda funciona como checagem cruzada da primeira. O resultado é
          multiplicado pelo fator de atividade para chegar ao gasto total estimado (TDEE).
        </p>
      </div>

      {result && (
        <section className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-4">
            <StatCard label="IMC" value={fmt(result.bmi, 1)} hint="referência, não decide o caminho" />
            <StatCard label="Massa magra" value={`${fmt(result.leanMassKg, 1)} kg`} hint={`gordura: ${fmt(result.fatMassKg, 1)} kg`} />
            <StatCard
              label="TMB (média)"
              value={`${fmt(result.bmr, 0)} kcal`}
              hint={`Katch-McArdle ${fmt(result.bmrKatch, 0)} · Mifflin ${fmt(result.bmrMifflin, 0)}`}
            />
            <StatCard label="TDEE estimado" value={`${fmt(result.tdee, 0)} kcal`} hint="gasto total diário" />
          </div>

          <div className="card-glow p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                <IconTarget className="h-3.5 w-3.5" />
              </span>
              <h2 className="text-sm font-semibold">
                Caminho recomendado: <span className="text-accent">{PATH_LABEL[result.path]}</span>
              </h2>
            </div>
            <p className="text-xs text-muted leading-relaxed mb-5">{result.pathReason}</p>
            <div className="grid gap-5 sm:grid-cols-4">
              <MacroStat icon={<IconFlame className="h-4 w-4" />} label="Kcal alvo" value={fmt(result.targetKcal, 0)} sub={`${fmtSigned(result.surplusPercent * 100, 0)}% do TDEE`} />
              <MacroStat icon={<IconScale className="h-4 w-4" />} label="Proteína" value={`${fmt(result.targetProteinG, 0)} g`} sub={`${fmt(result.proteinPerKg, 2)} g/kg`} />
              <MacroStat icon={<IconDroplet className="h-4 w-4" />} label="Gordura" value={`${fmt(result.targetFatG, 0)} g`} sub={`${fmt(result.fatPerKg, 2)} g/kg`} />
              <MacroStat icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" value={`${fmt(result.targetCarbG, 0)} g`} sub="resíduo" />
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
            <button type="button" onClick={handleGoToDietBuilder} className="btn-primary">
              Montar dieta com essas metas →
            </button>
            <button type="button" onClick={handleSaveAsFirstCycle} className="btn-secondary">
              {savedCycle ? <IconCheck className="h-4 w-4" /> : null}
              {savedCycle ? "Salvo como ciclo inicial" : "Salvar como 1º ciclo do histórico"}
            </button>
          </div>
          {savedPrediction && !savedCycle && (
            <p className="text-xs text-accent">Metas salvas — use em &quot;Montar dieta&quot; quando quiser.</p>
          )}
          <p className="text-xs text-muted leading-relaxed">
            Estimativa inicial, não uma prescrição — ajuste com acompanhamento real assim que possível. Salvar como
            1º ciclo permite que o modelo de previsão por histórico (baseado no algoritmo do Pedro) comece a
            funcionar para este perfil também.
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

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1.5 text-lg font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-[10px] text-muted">{hint}</div>
    </div>
  );
}

function MacroStat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-lg">{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}
