import { MuscleGroup, MUSCLE_GROUP_LABEL } from "./exerciseLibrary";

/** Uma série "efetiva" — Work + Top set do protocolo do educador (RIR baixo, perto da falha). Feeder e
 * Warm up são aproximação/aquecimento, não entram na contagem de volume (ver notas em lote-01-raw.md:
 * o próprio protocolo do educador já separa por instrução RIR 6 vs RIR 2 vs falha). */
export interface LoggedSet {
  exerciseId: string;
  /** número de séries desse bloco (ex: work 3x6-8 → sets: 3) */
  sets: number;
  reserveType: "warmup" | "feeder" | "work" | "topset";
}

/** Faixas de volume semanal (séries efetivas/grupo muscular) — MEV (mínimo pra manter progresso),
 * MAV (faixa de melhor custo-benefício) e MRV (teto antes de recuperação virar limitante).
 *
 * Base científica: a relação dose-resposta série→hipertrofia é bem estabelecida (Schoenfeld, Ogborn &
 * Krieger 2016, J Sports Sci, DOI 10.1080/02640414.2016.1210197: cada série semanal adicional aumenta o
 * tamanho do efeito em ~0,37% de ganho, com bins categóricos <5 / 5-9 / 10+ séries/semana; atualizado por
 * Pelland, Remmert, Robinson, Hinson & Zourdos 2025, Sports Medicine, DOI 10.1007/s40279-025-02344-w,
 * meta-regressão com 67 estudos confirmando retornos diminuindo, sem platô abrupto). NENHUM desses
 * estudos publica uma tabela numérica MEV/MAV/MRV separada por grupo muscular individual — os números
 * abaixo são os bins genéricos da meta-análise (baixo <5, moderado 5-9, alto 10+) ajustados pra cada
 * grupo pela prática comum de forçar mais volume em grupos grandes/multiarticulares (peito, costas,
 * quadríceps, posterior de coxa) e menos em grupos pequenos que recebem estímulo indireto de outros
 * exercícios (bíceps/tríceps já trabalham em puxadas/supinos, panturrilha e antebraço recuperam mais
 * rápido). Tratar como ponto de partida ajustável pela resposta real da pessoa, não como alvo rígido —
 * mesma filosofia de "estimativa com premissas explícitas" que o resto do app já usa (ver periodization.ts).
 */
export interface VolumeLandmark {
  muscle: MuscleGroup;
  mev: number;
  mav: number;
  mrv: number;
}

export const VOLUME_LANDMARKS: VolumeLandmark[] = [
  { muscle: "peito", mev: 8, mav: 14, mrv: 22 },
  { muscle: "costas", mev: 10, mav: 16, mrv: 25 },
  { muscle: "ombro", mev: 8, mav: 16, mrv: 26 },
  { muscle: "biceps", mev: 6, mav: 12, mrv: 20 },
  { muscle: "triceps", mev: 6, mav: 12, mrv: 20 },
  { muscle: "antebraco", mev: 0, mav: 6, mrv: 16 },
  { muscle: "quadriceps", mev: 8, mav: 14, mrv: 22 },
  { muscle: "posterior_coxa", mev: 6, mav: 12, mrv: 20 },
  { muscle: "gluteo", mev: 4, mav: 10, mrv: 18 },
  { muscle: "panturrilha", mev: 6, mav: 12, mrv: 20 },
  { muscle: "abdominal", mev: 0, mav: 10, mrv: 20 },
  { muscle: "lombar", mev: 0, mav: 6, mrv: 12 },
];

export function landmarkFor(muscle: MuscleGroup): VolumeLandmark {
  const found = VOLUME_LANDMARKS.find((l) => l.muscle === muscle);
  if (!found) throw new Error(`Sem landmark de volume pra ${muscle}`);
  return found;
}

export type VolumeStatus = "abaixo_mev" | "faixa_produtiva" | "acima_mrv";

export interface VolumeReading {
  muscle: MuscleGroup;
  muscleLabel: string;
  effectiveSets: number;
  landmark: VolumeLandmark;
  status: VolumeStatus;
  note: string;
}

/** Séries efetivas contam Work + Top set apenas — feeder/warmup são aproximação, não estímulo
 * equivalente (mesma separação que o protocolo do educador já usa via reserveType). */
function isEffective(set: LoggedSet): boolean {
  return set.reserveType === "work" || set.reserveType === "topset";
}

/** Soma o volume semanal efetivo por grupo muscular a partir dos sets logados + o catálogo de
 * exercícios (pra saber qual grupo cada exercício alvo). Só conta o grupo PRIMÁRIO do exercício — o
 * estímulo em grupos secundários existe mas é indireto/parcial, contá-lo por igual infla o volume real. */
export function weeklyVolumeByMuscle(
  loggedSets: LoggedSet[],
  muscleOf: (exerciseId: string) => MuscleGroup | undefined
): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  for (const set of loggedSets) {
    if (!isEffective(set)) continue;
    const muscle = muscleOf(set.exerciseId);
    if (!muscle) continue;
    totals.set(muscle, (totals.get(muscle) ?? 0) + set.sets);
  }
  return totals;
}

function statusFor(effectiveSets: number, landmark: VolumeLandmark): VolumeStatus {
  if (effectiveSets < landmark.mev) return "abaixo_mev";
  if (effectiveSets > landmark.mrv) return "acima_mrv";
  return "faixa_produtiva";
}

/** Classifica o volume semanal atual de cada grupo contra MEV/MAV/MRV, pra decidir onde subir/segurar
 * volume. Não decide sozinho — é o insumo determinístico que cruza com a leitura visual das fotos
 * (ver ajuste por prioridade abaixo) antes de virar recomendação final. */
export function readVolumeStatus(weeklyVolume: Map<MuscleGroup, number>): VolumeReading[] {
  return VOLUME_LANDMARKS.map((landmark) => {
    const effectiveSets = weeklyVolume.get(landmark.muscle) ?? 0;
    const status = statusFor(effectiveSets, landmark);
    const note =
      status === "abaixo_mev"
        ? `${effectiveSets} séries/semana está abaixo do mínimo (${landmark.mev}) pra manter progresso nesse grupo.`
        : status === "acima_mrv"
          ? `${effectiveSets} séries/semana passou do teto recuperável (${landmark.mrv}) — risco de recuperação virar o fator limitante, não o estímulo.`
          : `${effectiveSets} séries/semana está na faixa produtiva (${landmark.mev}-${landmark.mrv}).`;
    return { muscle: landmark.muscle, muscleLabel: MUSCLE_GROUP_LABEL[landmark.muscle], effectiveSets, landmark, status, note };
  });
}

/**
 * Atrofia por desuso não é uniforme entre grupos musculares nem constante ao longo do tempo — a taxa é
 * maior nos primeiros dias e desacelera depois, e grupos diferentes atrofiam em velocidades diferentes.
 * Base: Hardy, Inns, Hatt, Doleman, Bass, Atherton, Lund & Phillips 2022, J Cachexia Sarcopenia Muscle,
 * DOI 10.1002/jcsm.13067 — revisão sistemática do curso temporal de atrofia por desuso em membro
 * inferior: tríceps sural (panturrilha) atrofia mais rápido (~-11,2% em 28 dias), depois quadríceps
 * (~-9,2%), isquiotibiais/posterior de coxa (~-6,5%), dorsiflexores/tibial anterior (~-3,2%), com queda
 * mais acentuada nos primeiros 14 dias do que depois. Os dados são de membro inferior (não há mapeamento
 * publicado equivalente pra tronco/membro superior) — os multiplicadores de peito/costas/ombro/braço
 * abaixo são uma extrapolação prudente (mais lenta que perna, já que o estudo mostra desuso de perna
 * atrofiando mais rápido que o esperado por ser a musculatura mais dependente de sustentar peso), não
 * um número medido.
 */
const ATROPHY_RATE_PER_WEEK: Record<MuscleGroup, number> = {
  panturrilha: 0.028, // ~-11%/4 semanas, extrapolado linear pra semana isolada
  quadriceps: 0.023,
  posterior_coxa: 0.016,
  gluteo: 0.016,
  lombar: 0.012,
  costas: 0.012,
  peito: 0.012,
  ombro: 0.012,
  biceps: 0.01,
  triceps: 0.01,
  antebraco: 0.008,
  abdominal: 0.008,
};

export interface InjuryContext {
  muscle: MuscleGroup;
  weeksOut: number;
}

/** Quando um grupo ficou de fora (lesão/dor) por N semanas, não trata "voltou com volume baixo" como
 * estagnação — desconta a expectativa de MEV/MAV proporcionalmente à atrofia estimada nesse período, e
 * recomenda reentrada gradual (retomar em ~MEV, não já em MAV/MRV) em vez de tentar recuperar o volume
 * perdido de uma vez. */
export function adjustLandmarkForInjury(landmark: VolumeLandmark, injury: InjuryContext): VolumeLandmark & { reentryNote: string } {
  const rate = ATROPHY_RATE_PER_WEEK[injury.muscle];
  const estimatedLossFraction = Math.min(0.35, rate * injury.weeksOut);
  const reentryMev = Math.round(landmark.mev * (1 - estimatedLossFraction * 0.5));
  return {
    ...landmark,
    mev: Math.max(0, reentryMev),
    reentryNote: `Fora ${injury.weeksOut} semana(s) — perda estimada de ~${(estimatedLossFraction * 100).toFixed(0)}% de massa/capacidade nesse grupo (Hardy et al. 2022). Reentrada recomendada perto do MEV ajustado (${reentryMev} séries/semana), subindo gradualmente ao longo de 2-3 semanas antes de mirar o MAV normal — não retomar direto no volume pré-lesão.`,
  };
}
