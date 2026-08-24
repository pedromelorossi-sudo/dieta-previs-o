"use client";

/* apple-design · arquétipo D (Formulário) · coluna de leitura 720
 *
 * Cada etapa numerada virou um PAINEL branco de linhas, com o rótulo do grupo
 * fora dele — a estrutura de Ajustes do macOS. O `Field` local foi reescrito
 * para render `FormRow` (rótulo à esquerda, controle à direita), o que converte
 * os 40 campos da página de uma vez em vez de 40 edições.
 */

import { memo, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { exerciseById, MUSCLE_GROUP_LABEL } from "@/lib/exerciseLibrary";
import { TrainingSession } from "@/lib/trainingBuilder";
import { upsertTrainingProgram } from "@/lib/trainingStorage";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  IconCheck,
  IconClipboard,
  IconDrumstick,
  IconDroplet,
  IconFlame,
  IconScale,
  IconTarget,
  IconWheat,
  IconDumbbell,
  IconTrend,
} from "@/components/icons";

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
  afericaoBf: {
    estimado: number;
    medido: number;
    metodo: MetodoMedicaoBf;
    erroPp: number;
    dentroDaMargem: boolean;
    veredito: string;
  } | null;
  tendenciaBf: { n: number; viesPp: number; erroMedioAbsPp: number; diagnostico: string } | null;
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
  monthlyPlan?: {
    monthIndex: number;
    label: string;
    phase: "cutting" | "normocalorico" | "bulking";
    phaseLabel: string;
    tdee: number;
    recommendedKcal: number;
    startWeightKg: number;
    endWeightKg: number;
    startBfPercent: number;
    endBfPercent: number;
    leanMassKg: number;
  }[];
  planoDeFases?: {
    resumo: string;
    premissas: string[];
    fases: {
      index: number;
      phase: "cutting" | "normocalorico" | "bulking";
      phaseLabel: string;
      subtipoCorte?: "retorno" | "profundo";
      bfAlvoTermino: number;
      mesInicioEstimado: number;
      mesFimEstimado: number;
      duracaoMesesEstimada: number;
      gatilhoEntrada: string;
      gatilhoSaida: string;
      objetivo: string;
      pesoInicioKg: number;
      pesoFimKg: number;
      bfInicioPercent: number;
      bfFimPercent: number;
      magraInicioKg: number;
      magraFimKg: number;
      kcalInicio: number;
      kcalFim: number;
      oQuePodeMudar: string;
    }[];
  };
  muscleGroupAssessment?: {
    muscle: string;
    relativeDevelopment: "atras_dos_outros" | "proporcional" | "destaque";
    developmentNote: string;
    symmetryNote: string;
    confidence: "baixa" | "media" | "alta";
  }[];
  suggestedTrainingProgram?: TrainingSession[];
  trainingPeriodizationPlan?: {
    weekIndex: number;
    label: string;
    isDeload: boolean;
    focusNote: string;
    sessions: TrainingSession[];
  }[];
  trainingAdherenceScore?: number;
  plannedSessions?: number;
  tdeeCalibration?: {
    factor: number;
    confidence: "nenhuma" | "baixa" | "media" | "alta";
    cleanCyclesUsed: number;
    totalCyclesSeen: number;
    note: string;
  };
  /** frase explicando como o fator de calibração entrou no TDEE deste ciclo (null = não entrou) */
  calibrationApplied?: string | null;
  /** por que a calibração está indisponível — ex: a migração da tabela de auditoria não rodou */
  calibrationUnavailableReason?: string | null;
  /** limites de segurança que precisaram ser aplicados na prescrição (ver src/lib/safety.ts) */
  safetyWarnings?: string[];
  /** gasto estimado do cardio prescrito, kcal/dia */
  cardioKcalPerDay?: number;
  /** este ciclo vai alimentar a calibração, ou está "sujo" demais pra isso? */
  cycleCleanForCalibration?: boolean;
  cycleDirtyReasons?: string[];
  confrontoDoPlano?: {
    mesesDecorridos: number;
    pesoProjetado: number;
    pesoReal: number;
    bfProjetado: number;
    bfReal: number;
    dentroDoPlano: boolean;
    veredito: string;
  } | null;
  volumeAdherence?: {
    perMuscle: { muscle: string; muscleLabel: string; targetSets: number; actualSets: number; ratio: number; note: string }[];
    overallRatio: number;
    summary: string;
  } | null;
  cardioSessionsPlanned?: number;
  bfConsistency?: { consistent: boolean; note: string } | null;
  cardioPrescription?: {
    sessions: {
      modality: string;
      frequencyPerWeek: number;
      minutesPerSession: number;
      intensityLabel: string;
      timingNote: string;
    }[];
    totalMinutesPerWeek: number;
    reason: string;
    interferenceNote: string;
  };
}

import { ReadingPage, PageHero, FormRow } from "@/components/apple";

import { METODO_MEDICAO_LABEL, ERRO_TIPICO_PP, type MetodoMedicaoBf } from "@/lib/bfMedido";

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

  // adesão ao treino do ciclo anterior — sessões previstas são calculadas (dias/semana × semanas
  // decorridas), você só informa quantas completou de verdade e se manteve exercícios/cargas
  const [completedSessions, setCompletedSessions] = useState("");
  const [keptExercisesAndLoads, setKeptExercisesAndLoads] = useState<
    "" | "seguiu_de_perto" | "trocou_mas_manteve_volume" | "reduziu_bastante"
  >("");
  const [effortNearFailure, setEffortNearFailure] = useState<"" | "sim" | "nao">("");
  const [cardioSessions, setCardioSessions] = useState("");
  // Padrão 5 para treino e cardio, alterável. A faixa de `exerciseFreq` ("5+") não distingue 5 de 6
  // dias, e a divisão precisa do número exato pra dimensionar o orçamento de séries.
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState("5");
  const [cardioDaysPerWeek, setCardioDaysPerWeek] = useState("5");

  // adesão detalhada — fatos contáveis, não autoavaliação, usados só pra decidir se esse ciclo é
  // confiável o bastante pra calibrar a fórmula (ver calibration.ts e Lichtman et al. 1992: autorrelato
  // sem medição real é o maior confundidor conhecido nessa área, não a fórmula em si)
  const [daysFollowedPerWeek, setDaysFollowedPerWeek] = useState("");
  const [trackingMethod, setTrackingMethod] = useState<"" | "pesei_a_maioria" | "estimei_de_olho">("");
  const [weighInConsistent, setWeighInConsistent] = useState<"" | "sim" | "nao">("");
  const [alcoholDosesPerWeek, setAlcoholDosesPerWeek] = useState("");

  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayISO());
  /* %BF medido por exame — opcional. Vazio quer dizer "não fiz", e aí o app
     segue estimando por foto como sempre fez. */
  const [bfMedidoMetodo, setBfMedidoMetodo] = useState<MetodoMedicaoBf | "">("");
  const [bfMedidoPercent, setBfMedidoPercent] = useState("");
  const [weeks, setWeeks] = useState("4");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [dietSaved, setDietSaved] = useState(false);
  const [programSaving, setProgramSaving] = useState(false);
  const [programSaved, setProgramSaved] = useState(false);

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

  // As perguntas de adesão só fazem sentido se o app REALMENTE prescreveu algo pra seguir. Um ciclo
  // vindo da calculadora rápida (/estimar) é um número de referência, não um plano — perguntar "você
  // seguiu de perto as X kcal prescritas?" sobre ele convida a uma resposta inventada, e resposta
  // inventada contamina o retrocálculo de TDEE (é exatamente o autorrelato que calibration.ts cita
  // Lichtman et al. 1992 pra desqualificar). Ciclos sem origem registrada são anteriores a essa
  // coluna: mantêm o comportamento antigo e continuam perguntando.
  const ultimoFoiPrescricao = last != null && last.origin !== "estimativa";
  const mostrarPerguntasDeAdesao = !isFirstCycle && last != null && ultimoFoiPrescricao;

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
          // só envia quando os DOIS estão preenchidos — método sem número, ou
          // número sem método, não permite aferir nada
          ...(bfMedidoMetodo && bfMedidoPercent
            ? { bfMedidoMetodo, bfMedidoPercent: parseFloat(bfMedidoPercent) }
            : {}),
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
          lastCycleCompletedSessions: completedSessions ? parseFloat(completedSessions) : undefined,
          lastCycleKeptExercisesAndLoads: keptExercisesAndLoads || undefined,
          lastCycleEffortNearFailure: effortNearFailure || undefined,
          lastCycleCardioSessions: cardioSessions ? parseInt(cardioSessions, 10) : undefined,
          trainingDaysPerWeek: trainingDaysPerWeek ? parseInt(trainingDaysPerWeek, 10) : undefined,
          cardioDaysPerWeek: cardioDaysPerWeek ? parseInt(cardioDaysPerWeek, 10) : undefined,
          lastCycleDaysFollowedPerWeek: daysFollowedPerWeek ? parseFloat(daysFollowedPerWeek) : undefined,
          lastCycleTrackingMethod: trackingMethod || undefined,
          lastCycleWeighInConsistent: weighInConsistent ? weighInConsistent === "sim" : undefined,
          lastCycleAlcoholDosesPerWeek: alcoholDosesPerWeek ? parseFloat(alcoholDosesPerWeek) : undefined,
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
        origin: "ia",
        muscleAssessment: data.muscleGroupAssessment?.length ? data.muscleGroupAssessment : null,
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

  async function handleSaveTrainingProgram() {
    if (!result?.suggestedTrainingProgram || !user) return;
    setProgramSaving(true);
    try {
      await upsertTrainingProgram({
        id: crypto.randomUUID(),
        name: `Divisão sugerida ${fmtDate(date)}`,
        createdAt: new Date().toISOString(),
        sessions: result.suggestedTrainingProgram,
      });
      setProgramSaved(true);
    } finally {
      setProgramSaving(false);
    }
  }

  async function handleDownloadPdf() {
    const diet = dietFromResult();
    if (!diet) return;
    (await import("@/lib/pdf")).generateDietPdf(diet);
    await handleSaveDiet();
  }

  if (!cycles || !prefsLoaded) {
    return (
      <ReadingPage>
        <div className="skeleton h-14 w-full max-w-[420px]" />
        <div className="skeleton h-64 w-full" />
      </ReadingPage>
    );
  }

  return (
    <ReadingPage>
      <PageHero
        eyebrow={isFirstCycle ? "Primeiro ciclo" : "Novo ciclo"}
        title={isFirstCycle ? "Começar: informações e fotos" : "Fotos e previsão"}
        lede={
          isFirstCycle
            ? "Preencha suas informações básicas e envie fotos — o Claude estima seu %BF e calcula sua dieta inicial. Da próxima vez, essas informações já vêm preenchidas."
            : `O Claude estima seu %BF a partir das fotos e recomenda um ponto dentro das faixas calculadas pelo seu algoritmo — baseado no último ciclo (${fmtDate(last!.date)}: ${fmt(last!.weightKg)} kg).`
        }
      />

      <form onSubmit={handleSubmit} className="space-y-[clamp(24px,4vw,36px)]">
        <div>
          <Etapa numero="1" titulo={"Informações básicas"} />
          <div className="panel">
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

          {/* %BF MEDIDO POR EXAME.
              Opcional. Quando preenchido, é ele que entra no cálculo — mas o
              Claude continua estimando pela foto e as duas leituras são
              confrontadas, para saber se a estimativa visual está calibrada. */}
          <div className="panel mt-4">
            <FormRow
              label="Fez exame de composição corporal?"
              hint="Opcional. Com exame, o cálculo usa o valor medido — e a estimativa por foto vira aferição."
            >
              <select
                value={bfMedidoMetodo}
                onChange={(e) => setBfMedidoMetodo(e.target.value as MetodoMedicaoBf | "")}
                className="input"
              >
                <option value="">Não fiz</option>
                {(Object.keys(METODO_MEDICAO_LABEL) as MetodoMedicaoBf[]).map((m) => (
                  <option key={m} value={m}>
                    {METODO_MEDICAO_LABEL[m]}
                  </option>
                ))}
              </select>
            </FormRow>
            {bfMedidoMetodo && (
              <FormRow
                label="Gordura corporal medida"
                hint={`Percentual do exame. Margem típica do método: ~${ERRO_TIPICO_PP[bfMedidoMetodo]} pontos.`}
              >
                <input
                  type="number"
                  step="0.1"
                  value={bfMedidoPercent}
                  onChange={(e) => setBfMedidoPercent(e.target.value)}
                  className="input"
                  placeholder="14.2"
                />
              </FormRow>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Field label="Com que frequência você treina hoje? (usado no cálculo de gasto)">
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
              <Field label="Quantos dias de TREINO montar na divisão?">
                <select
                  value={trainingDaysPerWeek}
                  onChange={(e) => setTrainingDaysPerWeek(e.target.value)}
                  className="input"
                >
                  {[1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={String(d)}>
                      {d} {d === 1 ? "dia" : "dias"} por semana{d === 5 ? " (padrão)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Quantos dias de CARDIO por semana?">
              <select value={cardioDaysPerWeek} onChange={(e) => setCardioDaysPerWeek(e.target.value)} className="input">
                {[2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={String(d)}>
                    {d} dias por semana{d === 5 ? " (padrão)" : ""}
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
          <Etapa numero="2" titulo={"Gasto fora do treino (NEAT)"} />
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
                Responda com números reais, não com &quot;quão ativo você se sente&quot; — o algoritmo calcula o nível a
                partir disso.
              </p>
              <div className="panel">
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
          <Etapa numero="3" titulo={"Outro esporte ou atividade física fora da academia"} />
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
          <Etapa numero="4" titulo={"Fotos (frente obrigatória, o resto ajuda a precisão)"} />
          <div className="grid gap-4 sm:grid-cols-4">
            {ANGLES.map(({ key, label, required }) => (
              <div key={key}>
                <label className="block cursor-pointer">
                  <div className="h-28 w-full rounded-[12px] border border-dashed border-border bg-surface-raised/40 flex items-center justify-center overflow-hidden transition-colors duration-150 hover:border-accent/50 hover:bg-surface-raised/70">
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

        {mostrarPerguntasDeAdesao && last && (
          <div>
            <Etapa numero="5" titulo={"Parâmetros da previsão"} />
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
              {adherence !== "" && adherence !== "nao_acompanhou" && (
                <Field
                  label={
                    adherence === "seguiu"
                      ? "Média de kcal que você realmente comeu (se acompanhou)"
                      : "Quantas kcal você estima que comeu, em média?"
                  }
                >
                  <input
                    type="number"
                    step="1"
                    value={actualKcal}
                    onChange={(e) => setActualKcal(e.target.value)}
                    className="input"
                    placeholder={adherence === "seguiu" ? `ex: ${fmt(last.kcal, 0)}` : "ex: 2600"}
                  />
                </Field>
              )}
            </div>
            <p className="text-xs text-muted mt-2">
              Isso corrige o cálculo de TDEE pra usar o que você realmente comeu, não o que foi prescrito — importa
              porque o algoritmo retrocalcula seu gasto real a partir disso. Vale informar mesmo respondendo
              &ldquo;segui de perto&rdquo;: um número medido vale mais que o rótulo, e uma diferença de 10% entre
              prescrito e comido desloca o gasto estimado em ~9%.
            </p>

            <p className="text-xs text-muted mt-5 mb-2">
              Detalhes de execução — usados só pra decidir se esse ciclo é confiável o bastante pra ensinar algo à
              fórmula (ver nota de calibração nos resultados), não pra te julgar.
            </p>
            <div className="panel">
              <Field label="Em quantos dos 7 dias da semana você seguiu a dieta à risca?">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="7"
                  value={daysFollowedPerWeek}
                  onChange={(e) => setDaysFollowedPerWeek(e.target.value)}
                  className="input"
                  placeholder="ex: 6"
                />
              </Field>
              <Field label="Você pesou/mediu os alimentos ou estimou de olho na maior parte do tempo?">
                <select value={trackingMethod} onChange={(e) => setTrackingMethod(e.target.value as typeof trackingMethod)} className="input">
                  <option value="">Selecione…</option>
                  <option value="pesei_a_maioria">Pesei/medi a maior parte</option>
                  <option value="estimei_de_olho">Estimei de olho</option>
                </select>
              </Field>
              <Field label="Você se pesou sempre nas mesmas condições (mesma balança, mesmo horário, em jejum)?">
                <select value={weighInConsistent} onChange={(e) => setWeighInConsistent(e.target.value as typeof weighInConsistent)} className="input">
                  <option value="">Selecione…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não</option>
                </select>
              </Field>
              <Field label="Quantas doses de álcool, em média por semana, durante o ciclo?">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={alcoholDosesPerWeek}
                  onChange={(e) => setAlcoholDosesPerWeek(e.target.value)}
                  className="input"
                  placeholder="ex: 0"
                />
              </Field>
            </div>

            <p className="text-xs text-muted mt-5 mb-2">
              Sobre o ciclo que terminou — isso decide se o déficit foi grande demais e ajusta automaticamente o
              próximo, sem você precisar avaliar &quot;quão cansado&quot; se sentiu.
            </p>
            <div className="panel">
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

            <p className="text-xs text-muted mt-5 mb-2">
              Adesão ao treino — as sessões previstas são calculadas sozinhas (dias/semana × tempo desde o último
              ciclo), isso só ajusta o volume do próximo mesociclo pra não mirar o teto se o atual nem está sendo
              completado.
            </p>
            <div className="panel">
              <Field label="Quantas sessões de treino você completou de verdade desde o último ciclo?">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={completedSessions}
                  onChange={(e) => setCompletedSessions(e.target.value)}
                  className="input"
                  placeholder="ex: 10"
                />
              </Field>
              <Field label="Nas sessões que fez, manteve os exercícios e cargas sugeridos?">
                <select
                  value={keptExercisesAndLoads}
                  onChange={(e) => setKeptExercisesAndLoads(e.target.value as typeof keptExercisesAndLoads)}
                  className="input"
                >
                  <option value="">Selecione…</option>
                  <option value="seguiu_de_perto">Segui de perto</option>
                  <option value="trocou_mas_manteve_volume">Troquei alguns exercícios, mas mantive o volume</option>
                  <option value="reduziu_bastante">Reduzi bastante (menos séries/carga que o sugerido)</option>
                </select>
              </Field>
              <Field label="Nas séries de trabalho, você geralmente chegava perto da falha (1-2 reps de reserva)?">
                <select value={effortNearFailure} onChange={(e) => setEffortNearFailure(e.target.value as typeof effortNearFailure)} className="input">
                  <option value="">Selecione…</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Não, parava bem antes</option>
                </select>
              </Field>
              <Field label="Quantas sessões de CARDIO você completou desde o último ciclo?">
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={cardioSessions}
                  onChange={(e) => setCardioSessions(e.target.value)}
                  className="input"
                  placeholder="ex: 10"
                />
              </Field>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        {!isFirstCycle && last && !ultimoFoiPrescricao && (
          <div>
            <Etapa numero="5" titulo={"Parâmetros da previsão"} />
            <Field label="Semanas até a próxima consulta">
              <input type="number" step="1" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="input" />
            </Field>
            <p className="text-xs text-muted mt-3 leading-relaxed">
              As perguntas de adesão não aparecem desta vez: seu último registro veio da calculadora
              rápida, que é um número de referência e não um plano que você recebeu pra seguir. A partir
              do próximo ciclo — já com a prescrição desta análise — elas voltam, e é a partir delas que
              o algoritmo aprende o quanto a fórmula erra pra você.
            </p>
          </div>
        )}

        <button type="submit" disabled={!canSubmit || loading} className="btn-primary">
          {loading && (
            <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin-slow" style={{ animationDuration: "0.7s" }} />
          )}
          {loading ? "Analisando fotos…" : isFirstCycle ? "Calcular minha dieta inicial" : "Gerar previsão com IA"}
        </button>
      </form>

      {result && (
        <ResultadoPrevisao
          result={result}
          saved={saved}
          dietSaved={dietSaved}
          programSaved={programSaved}
          programSaving={programSaving}
          handleSavePrediction={handleSavePrediction}
          handleSaveDiet={handleSaveDiet}
          handleDownloadPdf={handleDownloadPdf}
          handleGoToDietBuilder={handleGoToDietBuilder}
          handleSaveTrainingProgram={handleSaveTrainingProgram}
        />
      )}
    </ReadingPage>
  );
}

/** O bloco de resultado vivia dentro do componente principal, na mesma árvore que os 37 campos do
 * formulário e os 40 `useState` que os controlam — cada tecla digitada re-renderizava os 85 nós de JSX
 * e os 8 `.map()` do resultado. Extraído e memoizado, ele só re-renderiza quando o resultado (ou um dos
 * flags de salvamento) muda de verdade. */
const ResultadoPrevisao = memo(function ResultadoPrevisao({
  result,
  saved,
  dietSaved,
  programSaved,
  programSaving,
  handleSavePrediction,
  handleSaveDiet,
  handleDownloadPdf,
  handleGoToDietBuilder,
  handleSaveTrainingProgram,
}: {
  result: PredictionResponse;
  saved: boolean;
  dietSaved: boolean;
  programSaved: boolean;
  programSaving: boolean;
  handleSavePrediction: () => void;
  handleSaveDiet: () => void;
  handleDownloadPdf: () => void;
  handleGoToDietBuilder: () => void;
  handleSaveTrainingProgram: () => void;
}) {
  return (
        <section className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              <IconScale className="h-4 w-4" /> %BF estimado por IA
            </div>
            <div className="mt-2 text-2xl font-semibold">
              <AnimatedNumber value={result.bfPercentVisual} decimals={1} />%
              <span className="ml-2 text-xs font-normal text-muted">confiança {result.bfConfidence}</span>
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.bfReasoning}</p>

            {/* AFERIÇÃO. Aparece só quando houve exame. O ponto do bloco não é
                mostrar quem "ganhou", e sim registrar se a estimativa por foto
                está calibrada — por isso o veredito fala de margem do método, e
                a tendência separa viés de ruído. */}
            {result.afericaoBf && (
              <div className="mt-4 rounded-[12px] bg-surface-raised p-4">
                <p className="text-[15px] font-semibold">Estimativa por foto × exame</p>
                <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] tabular-nums">
                  <span>
                    <span className="text-neutral">Estimado:</span> {fmt(result.afericaoBf.estimado, 1)}%
                  </span>
                  <span>
                    <span className="text-neutral">{METODO_MEDICAO_LABEL[result.afericaoBf.metodo]}:</span>{" "}
                    {fmt(result.afericaoBf.medido, 1)}%
                  </span>
                  <span className={result.afericaoBf.dentroDaMargem ? "text-accent" : "text-warn"}>
                    {result.afericaoBf.erroPp > 0 ? "+" : ""}
                    {fmt(result.afericaoBf.erroPp, 1)} p.p.
                  </span>
                </div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{result.afericaoBf.veredito}</p>
                {result.tendenciaBf && result.tendenciaBf.n > 1 && (
                  <p className="mt-2 border-t border-border pt-2 text-[13.5px] leading-relaxed text-muted">
                    {result.tendenciaBf.diagnostico}
                  </p>
                )}
              </div>
            )}
            {result.activityLevelDisplay && (
              <p className="text-xs text-muted mt-3 border-t border-border pt-3">
                Nível de atividade calculado a partir do seu gasto real (NEAT + treino):{" "}
                <span className="text-accent font-medium">{ACTIVITY_LABEL[result.activityLevelDisplay]}</span>
              </p>
            )}
          </div>

          <div className="card p-5 border-accent/30">
            <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              <IconTarget className="h-4 w-4" /> Estratégia decidida
            </div>
            <div className="mt-2 text-xl font-semibold text-accent">{result.strategyLabel}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.strategyReason}</p>
          </div>

          {result.confrontoDoPlano && (
            <div className={`card p-5 ${result.confrontoDoPlano.dentroDoPlano ? "" : "border-warn/40"}`}>
              <div className={`flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] ${result.confrontoDoPlano.dentroDoPlano ? "text-accent" : "text-warn"}`}>
                {result.confrontoDoPlano.dentroDoPlano ? "✓" : "⚠"} O plano anterior vs. o que aconteceu
              </div>
              <p className="text-sm mt-2 leading-relaxed">{result.confrontoDoPlano.veredito}</p>
              <div className="grid gap-2 sm:grid-cols-2 mt-3 text-xs tabular-nums text-muted">
                <span>
                  Peso: projetado {fmt(result.confrontoDoPlano.pesoProjetado, 1)}kg · real{" "}
                  {fmt(result.confrontoDoPlano.pesoReal, 1)}kg
                </span>
                <span>
                  Gordura: projetada {fmt(result.confrontoDoPlano.bfProjetado, 1)}% · real{" "}
                  {fmt(result.confrontoDoPlano.bfReal, 1)}%
                </span>
              </div>
            </div>
          )}

          {result.volumeAdherence && result.volumeAdherence.perMuscle.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconTarget className="h-4 w-4" /> Volume prescrito vs. executado
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.volumeAdherence.summary}</p>
              <div className="mt-3 space-y-1.5">
                {result.volumeAdherence.perMuscle
                  .slice()
                  .sort((a, b) => a.ratio - b.ratio)
                  .map((m) => (
                    <div key={m.muscle} className="flex items-center gap-3 text-xs">
                      <span className="w-32 shrink-0 text-muted">{m.muscleLabel}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-track overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.ratio >= 0.9 ? "bg-accent" : m.ratio >= 0.6 ? "bg-warn" : "bg-danger"}`}
                          style={{ width: `${Math.min(100, m.ratio * 100)}%` }}
                        />
                      </div>
                      <span className="w-20 shrink-0 text-right tabular-nums text-muted">
                        {m.actualSets}/{m.targetSets}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {result.planoDeFases && result.planoDeFases.fases.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconTarget className="h-4 w-4" /> Roteiro de fases
              </div>
              <p className="text-sm mt-2 leading-relaxed">{result.planoDeFases.resumo}</p>
              <p className="text-xs text-warn mt-2 leading-relaxed">
                O que encerra cada fase é o <strong>percentual de gordura</strong>, não o calendário. Os meses abaixo
                são estimativa da velocidade projetada — se você responder mais rápido ou mais devagar, os meses mudam
                e a fase continua até o %BF chegar no alvo.
              </p>

              <div className="mt-4 space-y-3">
                {result.planoDeFases.fases.map((f) => {
                  const tone =
                    f.phase === "cutting"
                      ? "bg-danger/15 text-danger"
                      : f.phase === "bulking"
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-raised text-muted";
                  return (
                    <details key={f.index} className="rounded-[12px] border border-border bg-surface-raised/40 p-3">
                      <summary className="cursor-pointer list-none">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted tabular-nums">Fase {f.index}</span>
                          <span className={`badge ${tone}`}>
                            {f.phaseLabel}
                            {f.subtipoCorte === "retorno" ? " · retorno" : ""}
                          </span>
                          <span className="text-sm font-medium tabular-nums">
                            {fmt(f.bfInicioPercent, 1)}% → {fmt(f.bfAlvoTermino, 0)}%BF
                          </span>
                          <span className="text-xs text-muted ml-auto tabular-nums whitespace-nowrap">
                            ~{f.duracaoMesesEstimada} {f.duracaoMesesEstimada === 1 ? "mês" : "meses"} (est.)
                          </span>
                        </span>
                      </summary>

                      <div className="mt-3 space-y-2 border-t border-border pt-3">
                        <p className="text-sm text-muted leading-relaxed">{f.objetivo}</p>
                        <div className="grid gap-2 sm:grid-cols-3 text-xs tabular-nums">
                          <span className="text-muted">
                            Peso {fmt(f.pesoInicioKg, 1)} → {fmt(f.pesoFimKg, 1)}kg
                          </span>
                          <span className="text-muted">
                            Massa magra {fmt(f.magraInicioKg, 1)} → {fmt(f.magraFimKg, 1)}kg
                          </span>
                          <span className="text-muted">
                            {fmt(f.kcalInicio, 0)} → {fmt(f.kcalFim, 0)}kcal
                          </span>
                        </div>
                        <p className="text-xs text-muted leading-relaxed">
                          <strong className="text-foreground">Começa porque:</strong> {f.gatilhoEntrada}
                        </p>
                        <p className="text-xs text-muted leading-relaxed">
                          <strong className="text-foreground">Termina quando:</strong> {f.gatilhoSaida}
                        </p>
                        <p className="text-xs text-muted leading-relaxed">
                          <strong className="text-foreground">O que pode mudar a rota:</strong> {f.oQuePodeMudar}
                        </p>
                      </div>
                    </details>
                  );
                })}
              </div>

              <details className="mt-4 border-t border-border pt-3">
                <summary className="cursor-pointer text-[13px] text-muted">
                  Premissas deste plano
                </summary>
                <ul className="mt-2 space-y-2">
                  {result.planoDeFases.premissas.map((pr, i) => (
                    <li key={i} className="text-xs text-muted leading-relaxed border-l-2 border-border pl-3">
                      {pr}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {result.monthlyPlan && result.monthlyPlan.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconClipboard className="h-4 w-4" /> Detalhamento mês a mês
              </div>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                O mesmo roteiro acima, aberto mês a mês. O TDEE é recalculado a cada mês pela mudança de composição —
                não é um número congelado. Cada ciclo real com fotos recalibra a rota.
              </p>
              <div className="mt-4 space-y-2">
                {result.monthlyPlan.map((m) => {
                  const tone =
                    m.phase === "cutting"
                      ? "bg-danger/15 text-danger"
                      : m.phase === "bulking"
                        ? "bg-accent/15 text-accent"
                        : "bg-surface-raised text-muted";
                  return (
                    <div
                      key={m.monthIndex}
                      className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-surface-raised/40 p-3"
                    >
                      <span className="text-xs text-muted w-14 shrink-0">{m.label}</span>
                      <span className={`badge ${tone} shrink-0`}>{m.phaseLabel}</span>
                      <span className="text-sm shrink-0">{fmt(m.recommendedKcal, 0)}kcal</span>
                      <span className="text-xs text-muted ml-auto whitespace-nowrap">
                        {fmt(m.startWeightKg, 1)}→{fmt(m.endWeightKg, 1)}kg · {fmt(m.startBfPercent, 1)}→
                        {fmt(m.endBfPercent, 1)}%BF · magra {fmt(m.leanMassKg, 1)}kg
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.suggestedTrainingProgram && result.suggestedTrainingProgram.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                  <IconDumbbell className="h-4 w-4" /> Divisão de treino sugerida
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => (await import("@/lib/pdf")).generateTrainingPdf(result.suggestedTrainingProgram!, "Plano de treino")}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Baixar PDF
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveTrainingProgram}
                    disabled={programSaving}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    {programSaved ? <IconCheck className="h-3.5 w-3.5" /> : null}
                    {programSaving ? "Salvando…" : programSaved ? "Salvo" : "Salvar como programa"}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Gerada a partir da leitura visual por grupo muscular nas fotos — meta de volume no MAV, ajustada pra
                cima nos grupos que a IA marcou atrás dos outros. Edite livremente depois de salvar.
              </p>
              <div className="mt-4 space-y-5">
                {result.suggestedTrainingProgram.map((session, i) => {
                  // Séries de TRABALHO apenas — aquecimento não é estímulo e não entra na contagem
                  // (mesma regra de isEffective em trainingVolume.ts).
                  const workSets = session.items.reduce(
                    (a, it) => a + it.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset").reduce((c, b) => c + b.sets, 0),
                    0
                  );
                  const warmSets = session.items.reduce(
                    (a, it) => a + it.blocks.filter((b) => b.reserveType === "warmup").reduce((c, b) => c + b.sets, 0),
                    0
                  );
                  // ~2,5min por série de trabalho (execução + descanso) e ~1min por série de aproximação
                  const minutos = Math.round(workSets * 2.5 + warmSets);
                  const grupos = [...new Set(session.items.map((it) => exerciseById(it.exerciseId)?.primaryMuscle).filter(Boolean))];

                  return (
                    <div key={i} className="rounded-[12px] border border-border overflow-hidden">
                      <div className="bg-surface-raised/70 px-4 py-3 border-b border-border">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-sm font-semibold">
                            <span className="text-muted font-normal mr-2">Dia {i + 1}</span>
                            {session.label}
                          </span>
                          <span className="text-xs text-muted tabular-nums">
                            {session.items.length} exercícios · {workSets} séries · ~{minutos}min
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {grupos.map((g) => (
                            <span key={g} className="badge bg-border/50 text-[10px]">
                              {MUSCLE_GROUP_LABEL[g as keyof typeof MUSCLE_GROUP_LABEL]}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="divide-y divide-border/60">
                        {session.items.map((item, j) => {
                          const ex = exerciseById(item.exerciseId);
                          const aquecimento = item.blocks.find((b) => b.reserveType === "warmup");
                          const trabalho = item.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset");
                          return (
                            <div key={j} className="px-4 py-3">
                              <div className="flex items-baseline gap-2.5">
                                <span className="text-xs text-muted tabular-nums shrink-0 w-4">{j + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium leading-snug">{ex?.name ?? item.exerciseId}</div>
                                  {ex && (
                                    <div className="text-[11px] text-muted mt-0.5">
                                      {MUSCLE_GROUP_LABEL[ex.primaryMuscle]} · {ex.equipment}
                                      {ex.unilateral ? " · unilateral (conta por lado)" : ""}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-2 ml-6 space-y-1">
                                {aquecimento && (
                                  <div className="flex items-center gap-3 text-xs text-muted">
                                    <span className="badge bg-border/40 text-[10px] shrink-0 w-20 text-center">aquecimento</span>
                                    <span className="tabular-nums">
                                      {aquecimento.sets} × {aquecimento.repRange}
                                    </span>
                                    <span className="text-[11px]">
                                      {aquecimento.loadKg != null ? `~${fmt(aquecimento.loadKg, 1)}kg` : "carga leve, subindo"}
                                    </span>
                                  </div>
                                )}
                                {trabalho.map((b, k) => (
                                  <div key={k} className="flex items-center gap-3 text-sm">
                                    <span className="badge bg-accent/15 text-accent text-[10px] shrink-0 w-20 text-center">
                                      {b.reserveType === "topset" ? "top set" : "trabalho"}
                                    </span>
                                    <span className="font-medium tabular-nums">
                                      {b.sets} × {b.repRange}
                                    </span>
                                    {b.loadKg != null && (
                                      <span className="text-xs text-muted tabular-nums">{fmt(b.loadKg, 1)}kg</span>
                                    )}
                                    {b.rirTarget != null && (
                                      <span className="text-[11px] text-muted ml-auto shrink-0">
                                        deixar {b.rirTarget} {b.rirTarget === 1 ? "rep" : "reps"} na reserva
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.trainingPeriodizationPlan && result.trainingPeriodizationPlan.length > 0 && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconDumbbell className="h-4 w-4" /> Periodização de treino
              </div>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                Mesociclo de 5 semanas: volume sobe progressivamente até a meta e cai pra ~metade na semana de
                deload, antes de recomeçar.
              </p>
              <div className="mt-4 space-y-2">
                {result.trainingPeriodizationPlan.map((w) => (
                  <div
                    key={w.weekIndex}
                    className={`flex items-center gap-3 rounded-[12px] border p-3 ${
                      w.isDeload ? "border-warn/30 bg-warn/5" : "border-border bg-surface-raised/40"
                    }`}
                  >
                    <span className="text-xs text-muted w-20 shrink-0">{w.label}</span>
                    {w.isDeload && <span className="badge bg-warn/15 text-warn shrink-0">deload</span>}
                    <span className="text-xs text-muted">{w.focusNote}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.cardioPrescription && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconTrend className="h-4 w-4" /> Cardio — turnover metabólico
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.cardioPrescription.reason}</p>
              <div className="mt-4 space-y-2">
                {result.cardioPrescription.sessions.map((s, i) => (
                  <div key={i} className="rounded-[12px] border border-border bg-surface-raised/40 p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{s.modality}</span>
                      <span className="text-muted">
                        {s.frequencyPerWeek}x/semana · {s.minutesPerSession}min · {s.intensityLabel}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-1">{s.timingNote}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-3 border-t border-border pt-3">
                Total: {result.cardioPrescription.totalMinutesPerWeek}min/semana. {result.cardioPrescription.interferenceNote}
              </p>
            </div>
          )}

          {result.calibrationUnavailableReason && (
            <div className="card p-5 border-warn/40">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-warn">
                ⚠ Calibração indisponível
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.calibrationUnavailableReason}</p>
            </div>
          )}

          {result.safetyWarnings && result.safetyWarnings.length > 0 && (
            <div className="card p-5 border-warn/40">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-warn">
                ⚠ Limites de segurança aplicados
              </div>
              <p className="text-xs text-muted mt-2">
                A prescrição bruta do algoritmo foi ajustada antes de virar dieta. O motivo de cada ajuste:
              </p>
              <ul className="mt-3 space-y-2">
                {result.safetyWarnings.map((w, i) => (
                  <li key={i} className="text-sm text-muted leading-relaxed border-l-2 border-warn/50 pl-3">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.tdeeCalibration && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconCheck className="h-4 w-4" /> Calibração contínua da fórmula
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.tdeeCalibration.note}</p>
              {result.tdeeCalibration.confidence !== "nenhuma" && (
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span
                    className={`badge inline-block ${
                      result.tdeeCalibration.confidence === "alta" ? "bg-accent/15 text-accent" : "bg-warn/15 text-warn"
                    }`}
                  >
                    confiança {result.tdeeCalibration.confidence}
                  </span>
                  {/* o número em si nunca era mostrado — só a frase e o selo */}
                  <span className="badge inline-block bg-border/60 tabular-nums">
                    fator {result.tdeeCalibration.factor.toFixed(3)}
                  </span>
                  <span className="badge inline-block bg-border/60 tabular-nums">
                    {result.tdeeCalibration.cleanCyclesUsed}/{result.tdeeCalibration.totalCyclesSeen} ciclos limpos
                  </span>
                </div>
              )}
              {result.calibrationApplied && (
                <p className="text-xs text-accent mt-3 border-t border-border pt-3">{result.calibrationApplied}</p>
              )}
              {result.cycleCleanForCalibration === false && result.cycleDirtyReasons && result.cycleDirtyReasons.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs text-muted">Este ciclo NÃO vai contar pra calibração:</p>
                  <ul className="mt-1 space-y-1">
                    {result.cycleDirtyReasons.map((r, i) => (
                      <li key={i} className="text-xs text-muted leading-relaxed">
                        • {r}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.bfConsistency && !result.bfConsistency.consistent && (
                <p className="text-xs text-warn mt-3 border-t border-border pt-3">⚠ {result.bfConsistency.note}</p>
              )}
            </div>
          )}

          {result.evolutionNote && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconTarget className="h-4 w-4" /> Evolução muscular
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.evolutionNote}</p>
            </div>
          )}

          {result.gainCompositionLabel && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
                <IconDrumstick className="h-4 w-4" /> Composição do ganho (decidida pela IA)
              </div>
              <div className="mt-2 text-lg font-semibold">{result.gainCompositionLabel}</div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.gainCompositionReasoning}</p>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-foreground">
              <IconScale className="h-4 w-4" /> Projeção de 1 mês seguindo essa dieta
            </div>
            <div className="mt-2 text-xl font-semibold">
              <AnimatedNumber value={result.oneMonthProjection.weightRange.min} decimals={1} />–
              <AnimatedNumber value={result.oneMonthProjection.weightRange.max} decimals={1} /> kg
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.oneMonthProjection.note}</p>
          </div>

          <div className="card p-6">
            <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
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
            <div className="card p-6">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
                  <IconClipboard className="h-3.5 w-3.5" />
                </span>
                Dieta montada
              </h2>
              <p className="text-xs text-muted mb-4">
                Já distribuída nas refeições pra bater as metas acima. Ajuste manualmente em{" "}
                <Link href="/dieta/novo" className="text-accent hover:underline">
                  Montar dieta
                </Link>{" "}
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
                    <div key={meal.id} className="rounded-[12px] border border-border bg-surface-raised/40 p-4">
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
            <Link href="/fotos" className="text-accent hover:underline">
              Fotos de progresso
            </Link>
            .
          </p>
        </section>
      
  );
});

/** Rótulo de etapa — macroestrutura Narrative Workflow (ver design.md).
 *
 * O formulário já era numerado ("1. Informações básicas…"); isto formaliza a numeração que existia
 * como um rótulo de estágio de verdade: número em mono, título ao lado, régua abaixo separando as
 * etapas. A macroestrutura pede "large numbered stage labels" e "thick numbered rule between stages",
 * e o processo aqui é uma sequência real — a pessoa preenche 1, depois 2, depois 3. */
/* Rótulo do grupo, ACIMA do painel. O número da etapa some do visual: numerar
   cada bloco era a voz antiga; aqui a ordem já é dada pela sequência vertical,
   e a regra 3 da skill manda remover o que não carrega significado. */
function Etapa({ titulo }: { numero?: string; titulo: string }) {
  return <h2 className="mb-3 px-1 text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h2>;
}

/* Reescrito sobre FormRow: rótulo à esquerda, controle à direita, dentro do
   painel do grupo. `stacked` para controle largo (textarea, grupo de opções). */
function Field({
  label,
  hint,
  stacked,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FormRow label={label} hint={hint} stacked={stacked}>
      {children}
    </FormRow>
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
