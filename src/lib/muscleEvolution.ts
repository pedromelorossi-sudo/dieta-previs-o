import { MuscleGroup, MUSCLE_GROUP_LABEL } from "./exerciseLibrary";
import { Cycle } from "./types";

export type RelativeDevelopment = "atras_dos_outros" | "proporcional" | "destaque";
export type AssessmentConfidence = "baixa" | "media" | "alta";

export interface MuscleEvolutionPoint {
  date: string;
  relativeDevelopment: RelativeDevelopment;
  confidence: AssessmentConfidence;
}

export type EvolutionTrend = "melhorando" | "estavel" | "piorando" | "sem_dado_suficiente";

export interface MuscleEvolution {
  muscle: MuscleGroup;
  muscleLabel: string;
  points: MuscleEvolutionPoint[];
  trend: EvolutionTrend;
  trendNote: string;
}

const DEVELOPMENT_LABEL: Record<RelativeDevelopment, string> = {
  atras_dos_outros: "atrás dos outros",
  proporcional: "proporcional",
  destaque: "destaque",
};

const DEVELOPMENT_SCORE: Record<RelativeDevelopment, number> = {
  atras_dos_outros: 0,
  proporcional: 1,
  destaque: 2,
};

/** Monta a linha do tempo de leitura visual por grupo muscular a partir do histórico de ciclos — cada
 * ciclo com fotos que teve `muscleAssessment` salvo vira um ponto. Tendência (melhorando/estável/
 * piorando) só considera leituras com confidence "media" ou "alta": comparar duas leituras "baixa" pra
 * apontar melhora seria comparar dois chutes, não dado. Compara a primeira com a última leitura
 * confiável — não a média nem todo o histórico — porque o que importa pra decidir se o volume/prioridade
 * atual está funcionando é a direção recente, não a soma de anos de leituras variáveis. */
export function buildMuscleEvolution(cycles: Cycle[]): MuscleEvolution[] {
  const byMuscle = new Map<string, MuscleEvolutionPoint[]>();

  for (const cycle of cycles) {
    if (!cycle.muscleAssessment) continue;
    for (const a of cycle.muscleAssessment) {
      const list = byMuscle.get(a.muscle) ?? [];
      list.push({ date: cycle.date, relativeDevelopment: a.relativeDevelopment, confidence: a.confidence });
      byMuscle.set(a.muscle, list);
    }
  }

  const allMuscles = Object.keys(MUSCLE_GROUP_LABEL) as MuscleGroup[];

  return allMuscles
    .map((muscle) => {
      const points = (byMuscle.get(muscle) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const confidentPoints = points.filter((p) => p.confidence !== "baixa");

      let trend: EvolutionTrend = "sem_dado_suficiente";
      let trendNote = "Sem leituras suficientes com confiança media/alta pra apontar tendência ainda.";

      if (confidentPoints.length >= 2) {
        const first = confidentPoints[0];
        const last = confidentPoints[confidentPoints.length - 1];
        const firstScore = DEVELOPMENT_SCORE[first.relativeDevelopment];
        const lastScore = DEVELOPMENT_SCORE[last.relativeDevelopment];

        if (lastScore > firstScore) {
          trend = "melhorando";
          trendNote = `Foi de "${DEVELOPMENT_LABEL[first.relativeDevelopment]}" (${first.date}) pra "${DEVELOPMENT_LABEL[last.relativeDevelopment]}" (${last.date}).`;
        } else if (lastScore < firstScore) {
          trend = "piorando";
          trendNote = `Foi de "${DEVELOPMENT_LABEL[first.relativeDevelopment]}" (${first.date}) pra "${DEVELOPMENT_LABEL[last.relativeDevelopment]}" (${last.date}) — considerar subir prioridade desse grupo.`;
        } else {
          trend = "estavel";
          trendNote = `Manteve leitura "${DEVELOPMENT_LABEL[last.relativeDevelopment]}" em ${confidentPoints.length} ciclos com leitura confiável (${first.date} a ${last.date}).`;
        }
      }

      return { muscle, muscleLabel: MUSCLE_GROUP_LABEL[muscle], points, trend, trendNote };
    })
    .filter((e) => e.points.length > 0);
}
