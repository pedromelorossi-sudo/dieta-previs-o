"use client";

/* apple-design · arquétipo D (Formulário) + painel de resultado
 * As quatro "StatCard" em grade viraram um painel único de linhas — regra 1:
 * itens irmãos não moram em cartões separados.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { BodyCompositionResult, PATH_LABEL, Sex, estimateBodyComposition } from "@/lib/bodyComposition";
import { ActivityLevel, ACTIVITY_LABEL, loadPreferences } from "@/lib/questionnaire";
import { fmt, fmtSigned } from "@/lib/format";
import { saveLastPrediction } from "@/lib/predictionsLog";
import { addCycle } from "@/lib/storage";
import { Cycle } from "@/lib/types";
import { IconCheck, IconDroplet, IconFlame, IconScale, IconWheat } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

import { ReadingPage, PageHero, FormPanel, FormRow, Panel, ValueRow, SectionHeading } from "@/components/apple";

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
    <ReadingPage>
      <PageHero
        eyebrow="Ponto de partida"
        title="Estimar dieta inicial"
        lede="Sem histórico de ciclos? Estime um ponto de partida a partir do peso, altura e %BF — o algoritmo decide entre cutting, normocalórico ou bulking e sugere os macros."
      />

      <FormPanel label="Corpo">
        <FormRow label="Peso" hint="Em quilos.">
          <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="78" className="input" />
        </FormRow>
        <FormRow label="Altura" hint="Em centímetros.">
          <input type="number" step="1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="178" className="input" />
        </FormRow>
        <FormRow label="Gordura corporal" hint="Percentual estimado.">
          <input type="number" step="0.1" value={bodyFat} onChange={(e) => setBodyFat(e.target.value)} placeholder="16" className="input" />
        </FormRow>
        <FormRow label="Idade">
          <input type="number" step="1" value={age} onChange={(e) => setAge(e.target.value)} placeholder="30" className="input" />
        </FormRow>
        <FormRow label="Sexo biológico" hint="Referência de %BF e de TMB.">
          <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
            <option value="masculino">Masculino</option>
            <option value="feminino">Feminino</option>
          </select>
        </FormRow>
      </FormPanel>

      <FormPanel
        label="Atividade"
        footer="TMB estimada pela média de duas fórmulas: Katch-McArdle (massa magra a partir do %BF) e Mifflin-St Jeor (peso, altura, idade e sexo) — a segunda funciona como checagem cruzada da primeira. O resultado é multiplicado pelo fator de atividade para chegar ao gasto total estimado."
      >
        <FormRow label="Nível de atividade física" stacked>
          <select value={activityLevel} onChange={(e) => setActivityLevel(e.target.value as ActivityLevel)} className="input">
            {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABEL[a]}
              </option>
            ))}
          </select>
        </FormRow>
      </FormPanel>

      {result && (
        <section className="space-y-[clamp(24px,4vw,36px)]">
          <div>
            <SectionHeading title="O que sai da conta" />
            <Panel>
              <ValueRow label="IMC" hint="Referência, não decide o caminho." value={fmt(result.bmi, 1)} />
              <ValueRow
                label="Massa magra"
                hint={`Gordura: ${fmt(result.fatMassKg, 1)} kg`}
                value={`${fmt(result.leanMassKg, 1)} kg`}
              />
              <ValueRow
                label="TMB (média)"
                hint={`Katch-McArdle ${fmt(result.bmrKatch, 0)} · Mifflin ${fmt(result.bmrMifflin, 0)}`}
                value={`${fmt(result.bmr, 0)} kcal`}
              />
              <ValueRow label="TDEE estimado" hint="Gasto total diário." value={`${fmt(result.tdee, 0)} kcal`} emphasis />
            </Panel>
          </div>

          <div>
            <SectionHeading
              title={
                <>
                  Caminho recomendado: <span className="text-accent">{PATH_LABEL[result.path]}</span>
                </>
              }
              desc={result.pathReason}
            />
            <Panel>
              <ValueRow
                label={
                  <span className="flex items-center gap-2">
                    <IconFlame className="h-4 w-4 text-neutral" />
                    Calorias
                  </span>
                }
                hint={`${fmtSigned(result.surplusPercent * 100, 0)}% do TDEE`}
                value={`${fmt(result.targetKcal, 0)} kcal`}
                emphasis
              />
              <ValueRow
                label={
                  <span className="flex items-center gap-2">
                    <IconScale className="h-4 w-4 text-neutral" />
                    Proteína
                  </span>
                }
                hint={`${fmt(result.proteinPerKg, 2)} g/kg`}
                value={`${fmt(result.targetProteinG, 0)} g`}
              />
              <ValueRow
                label={
                  <span className="flex items-center gap-2">
                    <IconDroplet className="h-4 w-4 text-neutral" />
                    Gordura
                  </span>
                }
                hint={`${fmt(result.fatPerKg, 2)} g/kg`}
                value={`${fmt(result.targetFatG, 0)} g`}
              />
              <ValueRow
                label={
                  <span className="flex items-center gap-2">
                    <IconWheat className="h-4 w-4 text-neutral" />
                    Carboidrato
                  </span>
                }
                hint="Calculado como resíduo."
                value={`${fmt(result.targetCarbG, 0)} g`}
              />
            </Panel>
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
            <p className="text-[13.5px] text-accent">Metas salvas — use em &quot;Montar dieta&quot; quando quiser.</p>
          )}
          <p className="max-w-[560px] text-[13.5px] leading-[1.6] text-neutral">
            Estimativa inicial, não uma prescrição — ajuste com acompanhamento real assim que possível. Salvar como
            1º ciclo permite que o modelo de previsão por histórico (baseado no algoritmo do Pedro) comece a
            funcionar para este perfil também.
          </p>
        </section>
      )}
    </ReadingPage>
  );
}
