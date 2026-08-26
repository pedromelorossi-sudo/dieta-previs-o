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
  // "Ombro" agora é anterior + medial. O anterior já recebe ~16 séries indiretas
  // por semana de supino/desenvolvimento, então o MEV direto pode ser menor.
  { muscle: "ombro", mev: 6, mav: 12, mrv: 20 },
  { muscle: "deltoide_posterior", mev: 6, mav: 12, mrv: 20 },
  { muscle: "biceps", mev: 6, mav: 12, mrv: 20 },
  { muscle: "triceps", mev: 6, mav: 12, mrv: 20 },
  { muscle: "antebraco", mev: 0, mav: 6, mrv: 16 },
  { muscle: "quadriceps", mev: 8, mav: 14, mrv: 22 },
  { muscle: "posterior_coxa", mev: 6, mav: 12, mrv: 20 },
  { muscle: "gluteo", mev: 4, mav: 10, mrv: 18 },
  { muscle: "panturrilha", mev: 6, mav: 12, mrv: 20 },
  /* Adutor: o programa real prescreve 2 séries em cada dia de inferior, 4 na
   * semana. MEV 2 e não 0: com MEV 0 o grupo só recebe do excedente do dia, e
   * o excedente acabava antes — o adutor não aparecia em nenhum arranjo, que é
   * o mesmo defeito que zerava o abdominal. O piso 2 é o que o programa real
   * prescreve de fato em cada dia de inferior. */
  { muscle: "adutor", mev: 4, mav: 6, mrv: 8 },
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
/** Peso do estímulo INDIRETO na contagem de volume.
 *
 * `secondaryMuscles` existia no modelo de dados desde o início e nunca era lido
 * por ninguém. A consequência aparecia na simulação: um bíceps com 12 séries
 * diretas recebia mais 14 séries de puxada e remada — todas com bíceps
 * secundário. Contando indireto a 0,5 isso dá ~19 séries, com o MRV do bíceps
 * em 20. Ou seja, o grupo que o algoritmo queria priorizar já estava no teto
 * recuperável, e somar série ali não é ineficaz: é contraproducente, e é
 * exatamente onde tendinopatia de cotovelo aparece em natural.
 *
 * 0,5 e não 1,0 porque o secundário trabalha em amplitude e tensão menores que
 * o primário no mesmo movimento. É uma ponderação prudente, não medida — mesma
 * classe de premissa explícita que o resto do arquivo já assume. */
export const PESO_INDIRETO = 0.5;

export function weeklyVolumeByMuscle(
  loggedSets: LoggedSet[],
  muscleOf: (exerciseId: string) => MuscleGroup | undefined,
  /** grupos secundários do exercício — quando informado, entram a `PESO_INDIRETO` */
  secondaryOf?: (exerciseId: string) => MuscleGroup[]
): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  for (const set of loggedSets) {
    if (!isEffective(set)) continue;
    const muscle = muscleOf(set.exerciseId);
    if (!muscle) continue;
    totals.set(muscle, (totals.get(muscle) ?? 0) + set.sets);
    for (const sec of secondaryOf?.(set.exerciseId) ?? []) {
      totals.set(sec, (totals.get(sec) ?? 0) + set.sets * PESO_INDIRETO);
    }
  }
  // arredonda no fim: meia série não existe como prescrição, mas a soma
  // intermediária precisa dela pra não perder o indireto de sessões curtas
  for (const [m, v] of totals) totals.set(m, Math.round(v * 10) / 10);
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
    /* Grupo de MEV 0 (antebraço, abdominal, lombar) recebe estímulo indireto
       de outros movimentos — a mesma leitura que o `reason` do gerador de
       treino já usa para esses grupos. "0 séries está na faixa produtiva"
       era tecnicamente certo (0 não é menor que o mínimo de 0) e soava como
       elogio a não fazer nada. */
    const note =
      landmark.mev === 0 && effectiveSets === 0
        ? `Sem série direta registrada — esperado para este grupo, que recebe estímulo indireto de outros movimentos.`
        : status === "abaixo_mev"
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
  adutor: 0.016, // mesma ordem do glúteo — musculatura de quadril, sustenta peso
  lombar: 0.012,
  costas: 0.012,
  peito: 0.012,
  ombro: 0.012,
  deltoide_posterior: 0.012,
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


/** Compara a META de volume prescrita com o volume EFETIVAMENTE logado, por grupo muscular.
 *
 * Os dois números sempre existiram no app e nunca se encontravam: `computeMuscleTargets` produzia a meta,
 * `weeklyVolumeByMuscle` produzia o realizado, e `readVolumeStatus` só rodava o realizado contra os
 * landmarks genéricos (MEV/MAV/MRV). Ninguém perguntava "prescrevi 10 séries de peito, ele fez 4, por
 * quê?". Sem isso, adesão baixa a um grupo específico era invisível — aparecia só no agregado de
 * sessões completadas, que não distingue quem pulou o dia de perna de quem pulou tudo.
 */
export interface VolumeAdherence {
  muscle: MuscleGroup;
  muscleLabel: string;
  targetSets: number;
  actualSets: number;
  /** realizado / prescrito; 1 = executou exatamente a meta */
  ratio: number;
  note: string;
}

export function compareVolumeToTarget(
  targets: { muscle: MuscleGroup; weeklySets: number }[],
  loggedWeeklyVolume: Map<MuscleGroup, number>
): { perMuscle: VolumeAdherence[]; overallRatio: number; summary: string } {
  const perMuscle: VolumeAdherence[] = targets
    .filter((t) => t.weeklySets > 0)
    .map((t) => {
      const actualSets = loggedWeeklyVolume.get(t.muscle) ?? 0;
      const ratio = t.weeklySets > 0 ? actualSets / t.weeklySets : 1;
      const note =
        ratio >= 0.9
          ? `${actualSets} de ${t.weeklySets} séries/semana — meta cumprida.`
          : ratio >= 0.6
            ? `${actualSets} de ${t.weeklySets} séries/semana (${(ratio * 100).toFixed(0)}%) — abaixo da meta, mas dentro do que dá pra recuperar ajustando a sessão.`
            : `${actualSets} de ${t.weeklySets} séries/semana (${(ratio * 100).toFixed(0)}%) — bem abaixo da meta. Se isso se repetir, a meta é que está irreal pra sua rotina, não a execução que está errada.`;
      return { muscle: t.muscle, muscleLabel: MUSCLE_GROUP_LABEL[t.muscle], targetSets: t.weeklySets, actualSets, ratio, note };
    });

  const totalTarget = perMuscle.reduce((sum, m) => sum + m.targetSets, 0);
  const totalActual = perMuscle.reduce((sum, m) => sum + m.actualSets, 0);
  const overallRatio = totalTarget > 0 ? totalActual / totalTarget : 1;

  const atrasados = perMuscle.filter((m) => m.ratio < 0.6).map((m) => m.muscleLabel);
  const summary =
    totalTarget === 0
      ? "Sem meta de volume registrada para comparar."
      : `Volume executado: ${totalActual} de ${totalTarget} séries/semana (${(overallRatio * 100).toFixed(0)}% da meta).` +
        (atrasados.length > 0
          ? ` Bem abaixo da meta em: ${atrasados.join(", ")}. Grupo específico ficando pra trás é diferente de treinar menos no geral — vale olhar se é o dia da semana, o exercício ou a ordem na sessão.`
          : "");

  return { perMuscle, overallRatio, summary };
}
