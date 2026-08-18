"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Cycle } from "@/lib/types";
import { loadCycles, addCycle, deleteCycle } from "@/lib/storage";
import { sortByDate, daysBetween } from "@/lib/dietEngine";
import {
  Sex,
  ACTIVITY_LABEL,
  ExerciseFreq,
  SessionDuration,
  EXERCISE_FREQ_LABEL,
  SESSION_DURATION_LABEL,
  StepsKnown,
  STEPS_KNOWN_LABEL,
  HasOtherSport,
  HAS_OTHER_SPORT_LABEL,
  OtherSportActivity,
  OTHER_SPORT_ACTIVITY_LABEL,
  TalkTestIntensity,
  TALK_TEST_LABEL,
  loadPreferences,
  savePreferences,
} from "@/lib/questionnaire";
import { fmt, fmtDate } from "@/lib/format";
import { saveLastPrediction } from "@/lib/predictionsLog";
import { addProgressPhoto } from "@/lib/photos";
import { resizeImageToBase64 } from "@/lib/imageResize";
import { Diet, DietMeal, dietTotals, mealTotals, itemMacros } from "@/lib/dietBuilder";
import { getFood } from "@/lib/foods";
import { upsertDiet } from "@/lib/dietStorage";
import { generateDietPdf } from "@/lib/pdf";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { IconCheck, IconClipboard, IconDrumstick, IconDroplet, IconFlame, IconScale, IconTarget, IconWheat } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

type Angle = "frente" | "costas" | "lado_esquerdo" | "lado_direito";

const ANGLES: { key: Angle; label: string; required: boolean }[] = [
  { key: "frente", label: "Frente", required: true },
  { key: "costas", label: "Costas", required: false },
  { key: "lado_esquerdo", label: "Lado esquerdo", required: false },
  { key: "lado_direito", label: "Lado direito", required: false },
];

interface PredictionResponse {
  isFirstCycle: boolean;
  activityLevelDisplay?: "sedentario" | "leve" | "moderado" | "intenso";
  bfPercentVisual: number;
  bfConfidence: "baixa" | "media" | "alta";
  bfReasoning: string;
  evolutionNote: string | null;
  strategy: "cutting" | "normocalorico" | "bulking";
  strategyLabel: string;
  strategyReason: string;
  gainComposition: "musculo" | "misto" | "gordura" | null;
  gainCompositionLabel: string | null;
  gainCompositionReasoning: string | null;
  recommendedKcal: number;
  recommendedProteinG: number;
  recommendedFatG: number;
  recommendedCarbG: number;
  note: string;
  ranges: {
    kcal: { min: number; max: number };
    protein: { min: number; max: number };
    fat: { min: number; max: number };
    carb: { min: number; max: number };
    weight: { min: number; max: number };
  };
  rateKgWeek: number;
  recoveryScore?: number;
  meals: DietMeal[];
  dietWarnings: string[];
  oneMonthProjection: {
    weightRange: { min: number; max: number };
    note: string;
  };
}

export default function PrevisaoIaPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [files, setFiles] = useState<Partial<Record<Angle, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Angle, string>>>({});
  const [sex, setSex] = useState<Sex>("masculino");
  const [heightCm, setHeightCm] = useState("");
  const [age, setAge] = useState("");
  const [exerciseFreq, setExerciseFreq] = useState<ExerciseFreq | "">("");
  const [sessionDuration, setSessionDuration] = useState<SessionDuration | "">("");

  // NEAT — passos/dia é o sinal mais direto quando disponível; senão, orçamento de tempo real (horas
  // sentado, horas em pé/se movimentando, minutos de deslocamento ativo, horas de tarefas domésticas,
  // lances de escada) em vez de rótulos subjetivos tipo "rotina ativa" — o algoritmo conclui o nível a
  // partir dos fatos, o usuário não se autoavalia (ver nota em bodyComposition.ts).
  const [stepsKnown, setStepsKnown] = useState<StepsKnown | "">("");
  const [dailyStepsAvg, setDailyStepsAvg] = useState("");
  const [sittingHoursPerDay, setSittingHoursPerDay] = useState("");
  const [standingWorkHoursPerDay, setStandingWorkHoursPerDay] = useState("");
  const [activeCommuteMinutesPerDay, setActiveCommuteMinutesPerDay] = useState("");
  const [choresHoursPerWeek, setChoresHoursPerWeek] = useState("");
  const [stairFlightsPerDay, setStairFlightsPerDay] = useState("");

  // esporte fora da academia — capturado à parte do treino principal, com intensidade lida pelo talk
  // test (fato observável: "consegue conversar?") em vez do usuário se autoavaliar como leve/moderado
  const [hasOtherSport, setHasOtherSport] = useState<HasOtherSport | "">("");
  const [otherSportActivity, setOtherSportActivity] = useState<OtherSportActivity | "">("");
  const [otherSportSessionsPerWeek, setOtherSportSessionsPerWeek] = useState("");
  const [otherSportMinutesPerSession, setOtherSportMinutesPerSession] = useState("");
  const [otherSportTalkTest, setOtherSportTalkTest] = useState<TalkTestIntensity | "">("");

  const neatComplete = useMemo(() => {
    if (stepsKnown === "sim") return !!dailyStepsAvg && parseFloat(dailyStepsAvg) > 0;
    if (stepsKnown === "nao") {
      return (
        !!sittingHoursPerDay &&
        !!standingWorkHoursPerDay &&
        !!activeCommuteMinutesPerDay &&
        !!choresHoursPerWeek &&
        !!stairFlightsPerDay
      );
    }
    return false;
  }, [stepsKnown, dailyStepsAvg, sittingHoursPerDay, standingWorkHoursPerDay, activeCommuteMinutesPerDay, choresHoursPerWeek, stairFlightsPerDay]);

  const otherSportComplete = useMemo(() => {
    if (hasOtherSport === "nao") return true;
    if (hasOtherSport === "sim") {
      return !!otherSportActivity && !!otherSportSessionsPerWeek && !!otherSportMinutesPerSession && !!otherSportTalkTest;
    }
    return false;
  }, [hasOtherSport, otherSportActivity, otherSportSessionsPerWeek, otherSportMinutesPerSession, otherSportTalkTest]);

  const [currentIntakeKcal, setCurrentIntakeKcal] = useState("");
  const [weightTrend, setWeightTrend] = useState<"" | "subindo" | "descendo" | "estavel" | "nao_sei">("");
  const [adherence, setAdherence] = useState<"" | "seguiu" | "comeu_mais" | "comeu_menos" | "nao_acompanhou">("");
  const [actualKcal, setActualKcal] = useState("");

  // sinais objetivos de recuperação do ciclo que terminou — fatos observáveis (carga na barra, treinos
  // pulados por cansaço, sono), não autoavaliação de "quão cansado". Usado pra suavizar automaticamente
  // o déficit do próximo ciclo se o anterior foi agressivo demais (ver scoreRecoverySignals).
  const [strengthTrend, setStrengthTrend] = useState<"" | "subiu" | "manteve" | "caiu">("");
  const [missedSessionsFatigue, setMissedSessionsFatigue] = useState("");
  const [sleepHoursAvg, setSleepHoursAvg] = useState("");
  const [sleepDisturbance, setSleepDisturbance] = useState<"" | "sim" | "nao">("");
  const [daytimeFatigue, setDaytimeFatigue] = useState<"" | "sim" | "nao">("");

  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayISO());
  const [weeks, setWeeks] = useState("4");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [dietSaved, setDietSaved] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    loadCycles().then((c) => setCycles(sortByDate(c)));
    loadPreferences().then((p) => {
      if (p.sex) setSex(p.sex);
      if (p.heightCm) setHeightCm(String(p.heightCm));
      if (p.age) setAge(String(p.age));
      setPrefsLoaded(true);
    });
  }, [ready, user]);

  const last = cycles && cycles.length ? cycles[cycles.length - 1] : null;
  const isFirstCycle = cycles !== null && cycles.length === 0;

  const canSubmit = useMemo(() => {
    return (
      !!files.frente &&
      !!weight &&
      !!heightCm &&
      !!age &&
      !!exerciseFreq &&
      neatComplete &&
      otherSportComplete &&
      (exerciseFreq === "0" || !!sessionDuration) &&
      parseFloat(weight) > 0 &&
      parseFloat(heightCm) > 0 &&
      parseFloat(age) > 0
    );
  }, [files, weight, heightCm, age, exerciseFreq, sessionDuration, neatComplete, otherSportComplete]);

  function handleFileChange(angle: Angle, f: File | null) {
    setFiles((prev) => ({ ...prev, [angle]: f ?? undefined }));
    setPreviews((prev) => {
      const old = prev[angle];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [angle]: f ? URL.createObjectURL(f) : undefined };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || cycles === null) return;

    // duas entradas na mesma data (ou muito próximas) quebram o cálculo de taxa de variação — com
    // menos de 5 dias de intervalo a taxa semanal vira ruído amplificado (kg/semana explode) e isso
    // se propaga multiplicado pra proteína/gordura/kcal recomendados, gerando números absurdos.
    let effectiveCycles = cycles;
    if (last && last.date === date) {
      const overwrite = window.confirm(
        `Já existe um ciclo registrado em ${fmtDate(date)} (${fmt(last.weightKg)}kg, ${fmt(last.kcal, 0)}kcal).\n\n` +
          `Duas entradas na mesma data impedem calcular a taxa de variação corretamente.\n\n` +
          `OK = substituir esse ciclo pelos dados de agora.\nCancelar = escolher outra data antes de gerar.`
      );
      if (!overwrite) return;
      await deleteCycle(last.id);
      effectiveCycles = cycles.filter((c) => c.id !== last.id);
      setCycles(effectiveCycles);
    } else if (last && daysBetween(last.date, date) < 5) {
      const proceed = window.confirm(
        `O último ciclo foi em ${fmtDate(last.date)} — só ${Math.round(daysBetween(last.date, date))} dia(s) atrás.\n\n` +
          `Com um intervalo tão curto, a taxa de variação de peso fica instável e pode gerar kcal/proteína fora da realidade.\n\n` +
          `OK = gerar mesmo assim.\nCancelar = escolher uma data mais distante do último ciclo.`
      );
      if (!proceed) return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const photos = await Promise.all(
        (Object.entries(files) as [Angle, File][])
          .filter(([, f]) => !!f)
          .map(async ([angle, f]) => {
            const { base64, mediaType } = await resizeImageToBase64(f);
            return { angle, base64, mediaType };
          })
      );

      const res = await fetch("/api/previsao-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos,
          sex,
          heightCm: parseFloat(heightCm),
          age: parseFloat(age),
          activityLevel: "moderado",
          exerciseFreq: exerciseFreq || undefined,
          sessionDuration: sessionDuration || undefined,
          dailyStepsAvg: stepsKnown === "sim" && dailyStepsAvg ? parseFloat(dailyStepsAvg) : undefined,
          sittingHoursPerDay: stepsKnown === "nao" && sittingHoursPerDay ? parseFloat(sittingHoursPerDay) : undefined,
          standingWorkHoursPerDay: stepsKnown === "nao" && standingWorkHoursPerDay ? parseFloat(standingWorkHoursPerDay) : undefined,
          activeCommuteMinutesPerDay:
            stepsKnown === "nao" && activeCommuteMinutesPerDay ? parseFloat(activeCommuteMinutesPerDay) : undefined,
          choresHoursPerWeek: stepsKnown === "nao" && choresHoursPerWeek ? parseFloat(choresHoursPerWeek) : undefined,
          stairFlightsPerDay: stepsKnown === "nao" && stairFlightsPerDay ? parseFloat(stairFlightsPerDay) : undefined,
          otherSportActivity: hasOtherSport === "sim" ? otherSportActivity || undefined : undefined,
          otherSportSessionsPerWeek:
            hasOtherSport === "sim" && otherSportSessionsPerWeek ? parseFloat(otherSportSessionsPerWeek) : undefined,
          otherSportMinutesPerSession:
            hasOtherSport === "sim" && otherSportMinutesPerSession ? parseFloat(otherSportMinutesPerSession) : undefined,
          otherSportTalkTest: hasOtherSport === "sim" ? otherSportTalkTest || undefined : undefined,
          currentWeightKg: parseFloat(weight),
          date,
          weeksToNextConsult: parseFloat(weeks),
          currentIntakeKcal: currentIntakeKcal ? parseFloat(currentIntakeKcal) : undefined,
          weightTrend: weightTrend || undefined,
          lastCycleAdherence: adherence || undefined,
          lastCycleActualKcal: actualKcal ? parseFloat(actualKcal) : undefined,
          lastCycleStrengthTrend: strengthTrend || undefined,
          lastCycleMissedSessionsFatigue: missedSessionsFatigue ? parseFloat(missedSessionsFatigue) : undefined,
          lastCycleSleepHoursAvg: sleepHoursAvg ? parseFloat(sleepHoursAvg) : undefined,
          lastCycleSleepDisturbance: sleepDisturbance ? sleepDisturbance === "sim" : undefined,
          lastCycleDaytimeFatigue: daytimeFatigue ? daytimeFatigue === "sim" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar previsão.");
      setResult(data);
      setDietSaved(false);

      // salva as informações básicas no perfil, pra não pedir de novo da próxima vez
      const prefs = await loadPreferences();
      await savePreferences({
        ...prefs,
        sex,
        heightCm: parseFloat(heightCm),
        age: parseFloat(age),
        activityLevel: data.activityLevelDisplay ?? prefs.activityLevel,
      });

      const frenteFile = files.frente!;
      const anglesUsed = Object.keys(files).filter((a) => files[a as Angle]);
      await addProgressPhoto({
        date,
        file: frenteFile,
        waistCm: null,
        neckCm: null,
        hipCm: null,
        sex,
        estimatedBfPercent: data.bfPercentVisual,
        notes: `%BF estimado por IA (Claude) a partir de foto(s): ${anglesUsed.join(", ")}.`,
        cycleId: null,
      });

      await addCycle({
        id: crypto.randomUUID(),
        date,
        weightKg: parseFloat(weight),
        bodyFatPercent: data.bfPercentVisual,
        kcal: data.recommendedKcal,
        proteinG: data.recommendedProteinG,
        fatG: data.recommendedFatG,
        carbG: data.recommendedCarbG,
        isPrediction: true,
      });
      setCycles(sortByDate(await loadCycles()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar previsão.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePrediction() {
    if (!result || !user) return;
    const target = new Date(date);
    target.setDate(target.getDate() + Math.round(parseFloat(weeks) * 7));
    await saveLastPrediction({
      createdAt: new Date().toISOString(),
      targetDate: target.toISOString().slice(0, 10),
      kcal: result.ranges.kcal,
      proteinG: result.ranges.protein,
      fatG: result.ranges.fat,
      carbG: result.ranges.carb,
      weightKg: result.ranges.weight,
    });
    setSaved(true);
  }

  async function handleGoToDietBuilder() {
    await handleSavePrediction();
    router.push("/dieta/novo");
  }

  function dietFromResult(): Diet | null {
    if (!result) return null;
    return {
      id: crypto.randomUUID(),
      name: `Plano ${fmtDate(date)}`,
      createdAt: new Date().toISOString(),
      targetKcal: result.recommendedKcal,
      targetProteinG: result.recommendedProteinG,
      targetFatG: result.recommendedFatG,
      targetCarbG: result.recommendedCarbG,
      meals: result.meals,
    };
  }

  async function handleSaveDiet() {
    const diet = dietFromResult();
    if (!diet || !user) return;
    await upsertDiet(diet);
    setDietSaved(true);
  }

  async function handleDownloadPdf() {
    const diet = dietFromResult();
    if (!diet) return;
    generateDietPdf(diet);
    await handleSaveDiet();
  }

  if (!cycles || !prefsLoaded) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">
          {isFirstCycle ? "Começar: informações e fotos" : "Novo ciclo: fotos e previsão"}
        </h1>
        <p className="text-sm text-muted mt-2">
          {isFirstCycle
            ? "Preencha suas informações básicas e envie fotos — o Claude estima seu %BF e calcula sua dieta inicial. Da próxima vez, essas informações já vêm preenchidas."
            : `O Claude estima seu %BF a partir das fotos e recomenda um ponto dentro das faixas calculadas pelo seu algoritmo — baseado no último ciclo (${fmtDate(last!.date)}: ${fmt(last!.weightKg)} kg).`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6 animate-fade-in-up stagger-1">
        <div>
          <span className="block text-xs text-muted mb-2">1. Informações básicas</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sexo biológico">
              <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </Field>
            <Field label="Altura (cm)">
              <input type="number" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="input" placeholder="ex: 178" />
            </Field>
            <Field label="Idade">
              <input type="number" step="1" value={age} onChange={(e) => setAge(e.target.value)} className="input" placeholder="ex: 28" />
            </Field>
            <Field label="Peso atual (kg)">
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="input" placeholder="ex: 85.2" />
            </Field>
            <Field label="Data da pesagem">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Field label="Quantos dias por semana você treina?">
              <select value={exerciseFreq} onChange={(e) => setExerciseFreq(e.target.value as ExerciseFreq)} className="input">
                <option value="" disabled>
                  Selecione…
                </option>
                {(Object.keys(EXERCISE_FREQ_LABEL) as ExerciseFreq[]).map((f) => (
                  <option key={f} value={f}>
                    {EXERCISE_FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            {exerciseFreq && exerciseFreq !== "0" && (
              <Field label="Quanto tempo dura cada sessão de treino, em média?">
                <select value={sessionDuration} onChange={(e) => setSessionDuration(e.target.value as SessionDuration)} className="input">
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {(Object.keys(SESSION_DURATION_LABEL) as SessionDuration[]).map((d) => (
                    <option key={d} value={d}>
                      {SESSION_DURATION_LABEL[d]}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          {isFirstCycle && (
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <Field label="Quantas kcal você vem comendo, em média? (opcional)">
                <input
                  type="number"
                  step="1"
                  value={currentIntakeKcal}
                  onChange={(e) => setCurrentIntakeKcal(e.target.value)}
                  className="input"
                  placeholder="ex: 2800"
                />
              </Field>
              <Field label="Nas últimas semanas, comendo isso, seu peso está:">
                <select value={weightTrend} onChange={(e) => setWeightTrend(e.target.value as typeof weightTrend)} className="input">
                  <option value="">Selecione…</option>
                  <option value="subindo">Subindo</option>
                  <option value="descendo">Descendo</option>
                  <option value="estavel">Estável</option>
                  <option value="nao_sei">Não sei / não acompanhei</option>
                </select>
              </Field>
              <p className="text-xs text-muted sm:col-span-2">
                Com isso o TDEE calculado fica um meio-termo entre a fórmula e sua resposta real — não obrigatório,
                mas deixa a primeira estimativa mais precisa.
              </p>
            </div>
          )}
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">2. Gasto fora do treino (NEAT)</span>
          <p className="text-xs text-muted mb-3">
            Em lean bulk e cutting a margem sobre o gasto total é estreita — o NEAT (gasto fora do treino formal)
            costuma ser o maior ponto cego, então quanto mais preciso aqui, mais confiável o resto do cálculo.
          </p>
          <Field label="Você acompanha sua contagem de passos diária (celular/smartwatch)?">
            <select value={stepsKnown} onChange={(e) => setStepsKnown(e.target.value as StepsKnown)} className="input">
              <option value="" disabled>
                Selecione…
              </option>
              {(Object.keys(STEPS_KNOWN_LABEL) as StepsKnown[]).map((s) => (
                <option key={s} value={s}>
                  {STEPS_KNOWN_LABEL[s]}
                </option>
              ))}
            </select>
          </Field>

          {stepsKnown === "sim" && (
            <div className="mt-4">
              <Field label="Média de passos por dia (últimos 7-14 dias)">
                <input
                  type="number"
                  step="100"
                  value={dailyStepsAvg}
                  onChange={(e) => setDailyStepsAvg(e.target.value)}
                  className="input"
                  placeholder="ex: 7500"
                />
              </Field>
            </div>
          )}

          {stepsKnown === "nao" && (
            <>
              <p className="text-xs text-muted mt-4 mb-2">
                Responda com números reais, não com "quão ativo você se sente" — o algoritmo calcula o nível a
                partir disso.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Horas por dia sentado(a) — trabalho, estudo, trajeto, tela (fora o sono)">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="20"
                    value={sittingHoursPerDay}
                    onChange={(e) => setSittingHoursPerDay(e.target.value)}
                    className="input"
                    placeholder="ex: 9"
                  />
                </Field>
                <Field label="Horas por dia em pé ou se movimentando fora da academia (trabalho, tarefas, estudo em pé)">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="20"
                    value={standingWorkHoursPerDay}
                    onChange={(e) => setStandingWorkHoursPerDay(e.target.value)}
                    className="input"
                    placeholder="ex: 1"
                  />
                </Field>
                <Field label="Minutos por dia caminhando ou pedalando pra se deslocar (ida + volta)">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={activeCommuteMinutesPerDay}
                    onChange={(e) => setActiveCommuteMinutesPerDay(e.target.value)}
                    className="input"
                    placeholder="ex: 20"
                  />
                </Field>
                <Field label="Horas por semana com tarefas domésticas em movimento (limpar, cozinhar, compras)">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={choresHoursPerWeek}
                    onChange={(e) => setChoresHoursPerWeek(e.target.value)}
                    className="input"
                    placeholder="ex: 3"
                  />
                </Field>
                <Field label="Lances de escada (andares) que você sobe a pé, em média, por dia">
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={stairFlightsPerDay}
                    onChange={(e) => setStairFlightsPerDay(e.target.value)}
                    className="input"
                    placeholder="ex: 4"
                  />
                </Field>
              </div>
            </>
          )}
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">3. Outro esporte ou atividade física fora da academia</span>
          <Field label="Além do treino principal, você pratica algum outro esporte ou atividade física regular?">
            <select value={hasOtherSport} onChange={(e) => setHasOtherSport(e.target.value as HasOtherSport)} className="input">
              <option value="" disabled>
                Selecione…
              </option>
              {(Object.keys(HAS_OTHER_SPORT_LABEL) as HasOtherSport[]).map((h) => (
                <option key={h} value={h}>
                  {HAS_OTHER_SPORT_LABEL[h]}
                </option>
              ))}
            </select>
          </Field>

          {hasOtherSport === "sim" && (
            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <Field label="Qual atividade?">
                <select
                  value={otherSportActivity}
                  onChange={(e) => setOtherSportActivity(e.target.value as OtherSportActivity)}
                  className="input"
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {(Object.keys(OTHER_SPORT_ACTIVITY_LABEL) as OtherSportActivity[]).map((o) => (
                    <option key={o} value={o}>
                      {OTHER_SPORT_ACTIVITY_LABEL[o]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantas vezes por semana?">
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={otherSportSessionsPerWeek}
                  onChange={(e) => setOtherSportSessionsPerWeek(e.target.value)}
                  className="input"
                  placeholder="ex: 2"
                />
              </Field>
              <Field label="Quantos minutos por sessão, em média?">
                <input
                  type="number"
                  step="5"
                  min="1"
                  value={otherSportMinutesPerSession}
                  onChange={(e) => setOtherSportMinutesPerSession(e.target.value)}
                  className="input"
                  placeholder="ex: 60"
                />
              </Field>
              <Field label="Durante essa atividade, você consegue conversar normalmente?">
                <select
                  value={otherSportTalkTest}
                  onChange={(e) => setOtherSportTalkTest(e.target.value as TalkTestIntensity)}
                  className="input"
                >
                  <option value="" disabled>
                    Selecione…
                  </option>
                  {(Object.keys(TALK_TEST_LABEL) as TalkTestIntensity[]).map((t) => (
                    <option key={t} value={t}>
                      {TALK_TEST_LABEL[t]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">4. Fotos (frente obrigatória, o resto ajuda a precisão)</span>
          <div className="grid gap-4 sm:grid-cols-4">
            {ANGLES.map(({ key, label, required }) => (
              <div key={key}>
                <label className="block cursor-pointer">
                  <div className="h-28 w-full rounded-lg border border-dashed border-border bg-surface-raised/40 flex items-center justify-center overflow-hidden hover:border-accent/40 hover:scale-[1.03] active:scale-[0.98] transition-all duration-200">
                    {previews[key] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[key]} alt={label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-muted text-center px-2">
                        {label}
                        {required && " *"}
                      </span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(key, e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="block text-[10px] text-muted mt-1 text-center">
                  {label}
                  {required && " *"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!isFirstCycle && last && (
          <div>
            <span className="block text-xs text-muted mb-2">5. Parâmetros da previsão</span>
            <Field label="Semanas até a próxima consulta">
              <input type="number" step="1" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="input" />
            </Field>
            <p className="text-xs text-muted mt-2">
              Composição do ganho (músculo/misto/gordura) é decidida pela IA comparando com sua foto anterior — não
              precisa escolher.
            </p>

            <div className="grid gap-4 sm:grid-cols-2 mt-4">
              <Field label={`Você seguiu de perto as ${fmt(last.kcal, 0)}kcal prescritas no último ciclo?`}>
                <select value={adherence} onChange={(e) => setAdherence(e.target.value as typeof adherence)} className="input">
                  <option value="">Selecione…</option>
                  <option value="seguiu">Sim, de perto</option>
                  <option value="comeu_mais">Não, comi mais</option>
                  <option value="comeu_menos">Não, comi menos</option>
                  <option value="nao_acompanhou">Não acompanhei direito</option>
                </select>
              </Field>
              {(adherence === "comeu_mais" || adherence === "comeu_menos") && (
                <Field label="Quantas kcal você estima que comeu, em média?">
                  <input
                    type="number"
                    step="1"
                    value={actualKcal}
                    onChange={(e) => setActualKcal(e.target.value)}
                    className="input"
                    placeholder="ex: 2600"
                  />
                </Field>
              )}
            </div>
            <p className="text-xs text-muted mt-2">
              Isso corrige o cálculo de TDEE pra usar o que você realmente comeu, não o que foi prescrito — importa
              porque o algoritmo retrocalcula seu gasto real a partir disso.
            </p>

            <p className="text-xs text-muted mt-5 mb-2">
              Sobre o ciclo que terminou — isso decide se o déficit foi grande demais e ajusta automaticamente o
              próximo, sem você precisar avaliar "quão cansado" se sentiu.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Comparado ao início desse ciclo, sua carga nos exercícios principais:">
                <select value={strengthTrend} onChange={(e) => setStrengthTrend(e.target.value as typeof strengthTrend)} className="input">
                  <option value="">Selecione…</option>
                  <option value="subiu">Consegui subir carga ou repetições</option>
                  <option value="manteve">Mantive a mesma carga</option>
                  <option value="caiu">Precisei reduzir carga ou repetições</option>
                </select>
              </Field>
              <Field label="Quantos treinos você pulou ou encurtou por cansaço nesse ciclo (não por falta de tempo)?">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={missedSessionsFatigue}
                  onChange={(e) => setMissedSessionsFatigue(e.target.value)}
                  className="input"
                  placeholder="ex: 0"
                />
              </Field>
              <Field label="Quantas horas você dormiu, em média, por noite nesse ciclo?">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="14"
                  value={sleepHoursAvg}
                  onChange={(e) => setSleepHoursAvg(e.target.value)}
                  className="input"
                  placeholder="ex: 7"
                />
              </Field>
              <Field label="Notou mais dificuldade pra dormir ou acordou mais vezes que o normal?">
                <select value={sleepDisturbance} onChange={(e) => setSleepDisturbance(e.target.value as typeof sleepDisturbance)} className="input">
                  <option value="">Selecione…</option>
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
              <Field label="Fora do treino, precisou de cochilos ou parar atividades por cansaço que não sentia antes desse ciclo?">
                <select value={daytimeFatigue} onChange={(e) => setDaytimeFatigue(e.target.value as typeof daytimeFatigue)} className="input">
                  <option value="">Selecione…</option>
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </Field>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={!canSubmit || loading} className="btn-primary">
          {loading && (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin-slow" style={{ animationDuration: "0.7s" }} />
          )}
          {loading ? "Analisando fotos…" : isFirstCycle ? "Calcular minha dieta inicial" : "Gerar previsão com IA"}
        </button>
      </form>

      {result && (
        <section className="space-y-6">
          <div className="card p-5 animate-fade-in-up">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconScale className="h-4 w-4" /> %BF estimado por IA
            </div>
            <div className="mt-2 text-2xl font-semibold">
              <AnimatedNumber value={result.bfPercentVisual} decimals={1} />%
              <span className="ml-2 text-xs font-normal text-muted">confiança {result.bfConfidence}</span>
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.bfReasoning}</p>
            {result.activityLevelDisplay && (
              <p className="text-xs text-muted mt-3 border-t border-border pt-3">
                Nível de atividade calculado a partir do seu gasto real (NEAT + treino):{" "}
                <span className="text-accent font-medium">{ACTIVITY_LABEL[result.activityLevelDisplay]}</span>
              </p>
            )}
          </div>

          <div className="card p-5 border-accent/30 animate-fade-in-up stagger-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconTarget className="h-4 w-4" /> Estratégia decidida
            </div>
            <div className="mt-2 text-xl font-semibold text-accent">{result.strategyLabel}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.strategyReason}</p>
          </div>

          {result.evolutionNote && (
            <div className="card p-5 animate-fade-in-up stagger-2">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconTarget className="h-4 w-4" /> Evolução muscular
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.evolutionNote}</p>
            </div>
          )}

          {result.gainCompositionLabel && (
            <div className="card p-5 animate-fade-in-up stagger-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconDrumstick className="h-4 w-4" /> Composição do ganho (decidida pela IA)
              </div>
              <div className="mt-2 text-lg font-semibold">{result.gainCompositionLabel}</div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.gainCompositionReasoning}</p>
            </div>
          )}

          <div className="card p-5 animate-fade-in-up stagger-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconScale className="h-4 w-4" /> Projeção de 1 mês seguindo essa dieta
            </div>
            <div className="mt-2 text-xl font-semibold">
              <AnimatedNumber value={result.oneMonthProjection.weightRange.min} decimals={1} />–
              <AnimatedNumber value={result.oneMonthProjection.weightRange.max} decimals={1} /> kg
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.oneMonthProjection.note}</p>
          </div>

          <div className="card-glow p-6 animate-fade-in-up stagger-5">
            <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                <IconTarget className="h-3.5 w-3.5" />
              </span>
              {result.isFirstCycle ? "Metas iniciais" : "Recomendação da IA (dentro das faixas do seu algoritmo)"}
            </h2>
            <div className="grid gap-5 sm:grid-cols-4">
              <MacroCard icon={<IconFlame className="h-4 w-4" />} label="Kcal" value={result.recommendedKcal} range={result.ranges.kcal} decimals={0} />
              <MacroCard icon={<IconDrumstick className="h-4 w-4" />} label="Proteína" value={result.recommendedProteinG} range={result.ranges.protein} suffix="g" />
              <MacroCard icon={<IconDroplet className="h-4 w-4" />} label="Gordura" value={result.recommendedFatG} range={result.ranges.fat} suffix="g" />
              <MacroCard icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" value={result.recommendedCarbG} range={result.ranges.carb} suffix="g" />
            </div>
            <p className="text-sm text-muted leading-relaxed mt-5 pt-5 border-t border-border">{result.note}</p>
          </div>

          {result.meals.length > 0 && (
            <div className="card p-6 animate-fade-in-up stagger-6">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <IconClipboard className="h-3.5 w-3.5" />
                </span>
                Dieta montada
              </h2>
              <p className="text-xs text-muted mb-4">
                Já distribuída nas refeições pra bater as metas acima. Ajuste manualmente em{" "}
                <a href="/dieta/novo" className="text-accent hover:underline">
                  Montar dieta
                </a>{" "}
                se quiser trocar algo.
              </p>

              {result.dietWarnings.length > 0 && (
                <div className="mb-4 text-xs text-warn space-y-1">
                  {result.dietWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {result.meals.map((meal) => {
                  const totals = mealTotals(meal);
                  return (
                    <div key={meal.id} className="rounded-lg border border-border bg-surface-raised/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">{meal.name}</span>
                        <span className="text-xs text-muted">
                          {fmt(totals.kcal, 0)} kcal · {fmt(totals.proteinG, 0)}p / {fmt(totals.fatG, 0)}g / {fmt(totals.carbG, 0)}c
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {meal.items.map((item) => {
                          const food = getFood(item.foodId);
                          const m = itemMacros(item);
                          return (
                            <li key={item.id} className="flex items-center justify-between text-xs text-muted">
                              <span>
                                {food?.name ?? item.foodId} — {fmt(item.quantityG, 0)}g
                              </span>
                              <span>{fmt(m.kcal, 0)} kcal</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-border">
                <span className="text-xs text-muted self-center">
                  Total: {fmt(dietTotals({ id: "", name: "", createdAt: "", targetKcal: 0, targetProteinG: 0, targetFatG: 0, targetCarbG: 0, meals: result.meals }).kcal, 0)} kcal
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
            <button type="button" onClick={handleSavePrediction} className="btn-secondary">
              {saved ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
              {saved ? "Previsão salva" : "Salvar previsão"}
            </button>
            <button type="button" onClick={handleDownloadPdf} className="btn-primary">
              <IconClipboard className="h-4 w-4" />
              Baixar PDF do plano
            </button>
            <button type="button" onClick={handleSaveDiet} className="btn-secondary">
              {dietSaved ? <IconCheck className="h-4 w-4" /> : null}
              {dietSaved ? "Dieta salva" : "Salvar dieta"}
            </button>
            <button type="button" onClick={handleGoToDietBuilder} className="text-xs text-accent hover:underline">
              ajustar manualmente →
            </button>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {result.isFirstCycle
              ? "Faixa vem da sua composição corporal estimada; a IA só leu o %BF na foto."
              : "A faixa vem do seu algoritmo (mesma matemática de sempre); a IA só escolhe o ponto dentro dela usando as fotos como evidência."}{" "}
            A foto de frente foi salva em{" "}
            <a href="/fotos" className="text-accent hover:underline">
              Fotos de progresso
            </a>
            .
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

function MacroCard({
  icon,
  label,
  value,
  range,
  suffix = "kcal",
  decimals = 1,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  range: { min: number; max: number };
  suffix?: string;
  decimals?: number;
}) {
  const isRange = Math.abs(range.max - range.min) > 0.01;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-lg">
        <AnimatedNumber value={value} decimals={decimals} />
        <span className="text-muted font-normal text-xs"> {suffix}</span>
      </div>
      {isRange && (
        <div className="text-[11px] text-muted mt-0.5">
          faixa {fmt(range.min, decimals)}–{fmt(range.max, decimals)}
        </div>
      )}
    </div>
  );
}
