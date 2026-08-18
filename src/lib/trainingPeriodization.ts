import { MuscleGroup, exerciseById, exercisesByMuscle } from "./exerciseLibrary";
import {
  VolumeReading,
  VolumeStatus,
  weeklyVolumeByMuscle,
  readVolumeStatus,
  adjustLandmarkForInjury,
  InjuryContext,
} from "./trainingVolume";
import { TrainingLog } from "./trainingBuilder";

export type VolumeAdjustment = "subir" | "manter" | "reduzir";

export interface ExerciseSwapSuggestion {
  fromExerciseId?: string;
  toExerciseId: string;
  reason: string;
}

export interface MuscleRecommendation {
  muscle: MuscleGroup;
  muscleLabel: string;
  currentWeeklySets: number;
  status: VolumeStatus;
  adjustment: VolumeAdjustment;
  reason: string;
  suggestedExerciseSwap?: ExerciseSwapSuggestion;
}

export interface WeeklyRecommendation {
  /** início (ISO) da janela de 7 dias mais recente analisada */
  weekStart: string;
  muscles: MuscleRecommendation[];
  deloadSuggested: boolean;
  deloadReason?: string;
}

export interface TrainingPeriodizationInput {
  /** histórico já carregado (ver trainingStorage.loadTrainingLogs) — pelo menos 2-3 semanas pra decisão
   * de deload fazer sentido; menos que isso ainda funciona, só sem o sinal de "2 semanas consecutivas" */
  logs: TrainingLog[];
  /** grupos em reentrada conhecida (lesão/dor recente) — desconta MEV/MAV proporcionalmente em vez de
   * tratar volume baixo aí como estagnação (ver adjustLandmarkForInjury em trainingVolume.ts) */
  injuries?: InjuryContext[];
}

function weekIndex(dateStr: string, refDate: Date): number {
  const daysAgo = Math.floor((refDate.getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(daysAgo / 7);
}

function logsInWeek(logs: TrainingLog[], week: number, refDate: Date): TrainingLog[] {
  return logs.filter((l) => weekIndex(l.date, refDate) === week);
}

function volumeReadingsForWeek(logs: TrainingLog[], week: number, refDate: Date): VolumeReading[] {
  const weekLogs = logsInWeek(logs, week, refDate);
  const allSets = weekLogs.flatMap((l) => l.setsLogged);
  const volume = weeklyVolumeByMuscle(allSets, (id) => exerciseById(id)?.primaryMuscle);
  return readVolumeStatus(volume);
}

/** Quando o volume precisa subir, sugere um exercício do mesmo primaryMuscle que a pessoa NÃO fez nas
 * últimas semanas em vez de simplesmente empilhar mais séries no mesmo exercício — variar o estímulo é
 * seguro porque frequência/distribuição importa menos que volume total pra hipertrofia (Schoenfeld, Grgic
 * & Krieger 2018, J Sports Sci, DOI 10.1080/02640414.2018.1555906: com volume equalizado, 1x vs 3x+
 * por semana não muda o resultado). */
function suggestExerciseSwap(muscle: MuscleGroup, recentLogs: TrainingLog[]): ExerciseSwapSuggestion | undefined {
  const candidates = exercisesByMuscle(muscle);
  if (candidates.length === 0) return undefined;

  const recentIds = new Set(recentLogs.flatMap((l) => l.setsLogged.map((s) => s.exerciseId)));
  const notRecentlyUsed = candidates.filter((c) => !recentIds.has(c.id));
  const toExercise = notRecentlyUsed[0] ?? candidates[0];
  const mostUsed = candidates.find((c) => recentIds.has(c.id));

  return {
    fromExerciseId: mostUsed?.id,
    toExerciseId: toExercise.id,
    reason:
      notRecentlyUsed.length > 0
        ? `"${toExercise.name}" não apareceu nas últimas semanas — variar o estímulo é seguro aqui, frequência/distribuição importa menos que volume total (Schoenfeld, Grgic & Krieger 2018, DOI 10.1080/02640414.2018.1555906).`
        : `"${toExercise.name}" pra somar volume nesse grupo — já passou por todas as opções do catálogo recentemente, repetir é a alternativa razoável.`,
  };
}

/** Decide, por grupo muscular, se o volume da próxima semana deve subir/manter/reduzir a partir do
 * volume efetivo da semana mais recente vs. MEV/MAV/MRV (ajustado por lesão quando aplicável), sugere
 * troca de exercício quando subir volume faz sentido, e sinaliza deload quando 2+ grupos passaram do MRV
 * por 2 semanas seguidas — recuperação virando o fator limitante, prática padrão de periodização (mesmo
 * raciocínio já presente nos comentários de trainingVolume.ts). */
export function recommendNextWeek(input: TrainingPeriodizationInput, refDate: Date = new Date()): WeeklyRecommendation {
  const { logs, injuries = [] } = input;

  const week0Readings = volumeReadingsForWeek(logs, 0, refDate);
  const week1Readings = volumeReadingsForWeek(logs, 1, refDate);
  const week1ByMuscle = new Map(week1Readings.map((r) => [r.muscle, r]));

  // "usado recentemente" pra decisão de troca de exercício = últimas ~3 semanas, não só a última
  const recentLogs = logs.filter((l) => weekIndex(l.date, refDate) <= 2);

  const muscles: MuscleRecommendation[] = week0Readings.map((reading) => {
    const injury = injuries.find((i) => i.muscle === reading.muscle);
    const adjustedForInjury = injury ? adjustLandmarkForInjury(reading.landmark, injury) : null;
    const landmark = adjustedForInjury ?? reading.landmark;

    let adjustment: VolumeAdjustment;
    let reason: string;
    if (reading.effectiveSets < landmark.mev) {
      adjustment = "subir";
      reason = adjustedForInjury ? adjustedForInjury.reentryNote : reading.note;
    } else if (reading.effectiveSets > landmark.mrv) {
      adjustment = "reduzir";
      reason = reading.note;
    } else if (reading.effectiveSets < landmark.mav) {
      adjustment = "subir";
      reason = `${reading.effectiveSets} séries/semana está entre o mínimo (${landmark.mev}) e a faixa de melhor custo-benefício (${landmark.mav}) — tem espaço pra subir.`;
    } else {
      adjustment = "manter";
      reason = reading.note;
    }

    const suggestedExerciseSwap = adjustment === "subir" ? suggestExerciseSwap(reading.muscle, recentLogs) : undefined;

    return {
      muscle: reading.muscle,
      muscleLabel: reading.muscleLabel,
      currentWeeklySets: reading.effectiveSets,
      status: reading.status,
      adjustment,
      reason,
      suggestedExerciseSwap,
    };
  });

  const consecutiveOverMrv = week0Readings.filter((r0) => {
    const r1 = week1ByMuscle.get(r0.muscle);
    return r0.status === "acima_mrv" && r1?.status === "acima_mrv";
  });
  const deloadSuggested = consecutiveOverMrv.length >= 2;

  const weekStart = new Date(refDate.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    weekStart,
    muscles,
    deloadSuggested,
    deloadReason: deloadSuggested
      ? `${consecutiveOverMrv.map((r) => r.muscleLabel).join(", ")} passaram do teto recuperável (MRV) por 2 semanas seguidas — recuperação virando o fator limitante, não o estímulo. Sugerido: 1 semana de deload (~50% do volume) antes de retomar volume normal.`
      : undefined,
  };
}
