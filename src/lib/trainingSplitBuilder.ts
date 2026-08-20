import { MuscleGroup, MUSCLE_GROUP_LABEL, exercisesByMuscle } from "./exerciseLibrary";
import { VOLUME_LANDMARKS, landmarkFor } from "./trainingVolume";
import { TrainingItem, TrainingSession } from "./trainingBuilder";

export type RelativeDevelopment = "atras_dos_outros" | "proporcional" | "destaque";
export type AssessmentConfidence = "baixa" | "media" | "alta";

export interface MuscleAssessmentInput {
  muscle: MuscleGroup;
  relativeDevelopment: RelativeDevelopment;
  confidence: AssessmentConfidence;
}

export interface MuscleTarget {
  muscle: MuscleGroup;
  muscleLabel: string;
  weeklySets: number;
  reason: string;
  /** prioridade declarada (ex: consultoria real) — pesa mais que a leitura visual da foto, porque um
   * coach humano enxerga sinais que uma foto não capta (força estagnada, medidas, etc.) */
  isPriority?: boolean;
}

// grupo lido como "atrás dos outros" na foto puxa a meta pra cima do MAV padrão (mais estímulo pra
// fechar a diferença); "destaque" relaxa pra mais perto do meio-termo MEV-MAV (não precisa priorizar);
// "proporcional" ou sem leitura confiável fica no MAV puro — melhor custo-benefício documentado
// (Schoenfeld, Ogborn & Krieger 2016; Pelland et al. 2025 — ver trainingVolume.ts). Sempre limitado ao
// MRV pra não sugerir volume acima do teto recuperável.
const DEVELOPMENT_ADJUSTMENT: Record<RelativeDevelopment, number> = {
  atras_dos_outros: 1.15,
  proporcional: 1.0,
  destaque: 0.85,
};

export interface TrainingAdherenceSignals {
  /** sessões de treino completadas de verdade desde o último ciclo — fato contável */
  completedSessions?: number;
  /** sessões previstas no período (dias/semana × semanas decorridas) — calculado, não perguntado */
  plannedSessions?: number;
  keptExercisesAndLoads?: "seguiu_de_perto" | "trocou_mas_manteve_volume" | "reduziu_bastante";
}

/** Pontua adesão ao treino do ciclo anterior — fatos observáveis (sessões completadas vs. previstas,
 * se manteve exercícios/cargas ou precisou reduzir), não autoavaliação de "quão disciplinado" foi.
 * Score > 0 significa que o volume-alvo do próximo mesociclo deve ficar mais conservador: não faz
 * sentido ramping até o MRV se a pessoa não está completando nem o volume atual — mesmo raciocínio do
 * recoveryScore em bodyComposition.ts, aplicado ao lado do treino. */
export function scoreTrainingAdherence(signals: TrainingAdherenceSignals): number {
  let score = 0;
  if (signals.plannedSessions && signals.plannedSessions > 0) {
    const rate = (signals.completedSessions ?? 0) / signals.plannedSessions;
    if (rate < 0.5) score += 1;
  }
  if (signals.keptExercisesAndLoads === "reduziu_bastante") score += 1;
  return score;
}

/** Orçamento de séries efetivas por SESSÃO. É o que limita tudo: uma sessão real de musculação
 * comporta ~20-25 séries de trabalho antes de virar duas horas de academia. Não é um número da
 * literatura — é uma restrição de execução, e é justamente a restrição que faltava.
 *
 * Sem ela, `computeMuscleTargets` somava os MAVs dos 12 grupos de forma independente e devolvia 140
 * séries/semana sem saber em quantos dias aquilo precisaria caber. O resultado era uma meta que a
 * divisão nunca conseguia entregar (93 séries de 140, com ombro e lombar em zero) e, pior, um número
 * exibido pro usuário que não descrevia nenhum treino existente. Priorizar todos os grupos ao mesmo
 * tempo não é priorizar. */
const SETS_PER_SESSION_BUDGET = 22;

/** Frequência semanal de cada grupo no template de N dias — precisa ser conhecida ANTES de definir a
 * meta, porque um grupo que aparece 1x/semana tem teto físico de
 * (exercícios/dia × séries/exercício) séries, por mais alto que o MAV seja. */
function frequencyByMuscleFor(daysPerWeek: number, priorityMuscles: MuscleGroup[]): Map<MuscleGroup, number> {
  const days = Math.max(1, Math.min(6, Math.round(daysPerWeek)));
  const template = ensurePriorityFrequency(SPLIT_TEMPLATES[days], priorityMuscles);
  const freq = new Map<MuscleGroup, number>();
  for (const day of template) {
    for (const m of day.muscles) freq.set(m, (freq.get(m) ?? 0) + 1);
  }
  return freq;
}

/** Meta de séries/semana por grupo pro mesociclo atual — agora limitada pelo que é EXECUTÁVEL, não só
 * pelo que seria desejável.
 *
 * O procedimento é: (1) todo grupo treinável começa no MEV, o mínimo pra não regredir; (2) o que sobra
 * do orçamento semanal (`daysPerWeek × SETS_PER_SESSION_BUDGET`) é distribuído em direção ao ideal de
 * cada grupo — MAV por padrão, MRV se for prioridade declarada, ajustado pela leitura visual —, com
 * peso dobrado pra prioridades; (3) nada passa do teto físico da frequência daquele grupo no template.
 *
 * Prioridade declarada (`priorityMuscles`, ex: "a consultoria pediu foco em costas e braço") continua
 * valendo mais que leitura de foto, mas agora disputa um orçamento finito em vez de todo mundo receber
 * o teto ao mesmo tempo. `adherenceScore` e `recoveryScore` cortam o orçamento em vez de mexer só no
 * teto: se o ciclo anterior não foi executado, ou se veio com sinal de recuperação ruim, o problema não
 * é a meta de um grupo, é o volume total. */
export function computeMuscleTargets(
  assessment: MuscleAssessmentInput[] = [],
  priorityMuscles: MuscleGroup[] = [],
  adherenceScore = 0,
  daysPerWeek = 3,
  recoveryScore = 0
): MuscleTarget[] {
  const freqByMuscle = frequencyByMuscleFor(daysPerWeek, priorityMuscles);

  // Corte de orçamento por adesão e por recuperação. Antes, adesão baixa "travava o teto no MAV" — o
  // que era no-op no caminho padrão, porque sem prioridade declarada o alvo já era o MAV.
  const adherenceFactor = adherenceScore >= 1 ? 0.85 : 1;
  const recoveryFactor = recoveryScore >= 4 ? 0.6 : recoveryScore >= 2 ? 0.8 : 1;
  const budget = Math.round(
    Math.max(1, Math.min(6, Math.round(daysPerWeek))) * SETS_PER_SESSION_BUDGET * adherenceFactor * recoveryFactor
  );

  interface Slot {
    landmark: (typeof VOLUME_LANDMARKS)[number];
    isPriority: boolean;
    assessed?: MuscleAssessmentInput;
    ceiling: number;
    ideal: number;
    sets: number;
  }

  const slots: Slot[] = VOLUME_LANDMARKS.map((landmark) => {
    const isPriority = priorityMuscles.includes(landmark.muscle);
    const assessed = assessment.find((x) => x.muscle === landmark.muscle && x.confidence !== "baixa");
    const catalogSize = exercisesByMuscle(landmark.muscle).length;
    const freq = freqByMuscle.get(landmark.muscle) ?? 0;
    const maxPerDay = isPriority ? MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY : MAX_EXERCISES_PER_MUSCLE_PER_DAY;

    // teto físico: não adianta pedir mais séries do que cabem na frequência × exercícios × séries
    const ceiling =
      catalogSize === 0 || freq === 0 ? 0 : Math.min(landmark.mrv, freq * Math.min(maxPerDay, catalogSize) * MAX_SETS_PER_EXERCISE);

    const adjustment = assessed ? DEVELOPMENT_ADJUSTMENT[assessed.relativeDevelopment] : 1.0;
    const desired = isPriority ? landmark.mrv : landmark.mav * adjustment;
    const ideal = Math.min(ceiling, Math.round(desired));

    return { landmark, isPriority, assessed, ceiling, ideal, sets: Math.min(ceiling, landmark.mev) };
  });

  // distribui o que sobra do orçamento em direção ao ideal, priorizando quem foi declarado prioridade
  let remaining = budget - slots.reduce((sum, sl) => sum + sl.sets, 0);
  while (remaining > 0) {
    // ordena pelo quão LONGE do ideal o grupo está (fração), não pela ordem da lista — senão o saldo do
    // orçamento cai sempre nos primeiros grupos de VOLUME_LANDMARKS e grupos de MEV 0 (abdominal,
    // antebraço) nunca recebiam uma série sequer
    const hungry = slots
      .filter((sl) => sl.sets < sl.ideal)
      .sort((a, b) => a.sets / a.ideal - b.sets / b.ideal);
    if (hungry.length === 0) break;
    const totalWeight = hungry.reduce((sum, sl) => sum + (sl.isPriority ? 2 : 1), 0);
    let gaveAny = false;
    for (const sl of hungry) {
      if (remaining <= 0) break;
      const share = Math.max(1, Math.round((remaining * (sl.isPriority ? 2 : 1)) / totalWeight));
      const give = Math.min(share, sl.ideal - sl.sets, remaining);
      if (give <= 0) continue;
      sl.sets += give;
      remaining -= give;
      gaveAny = true;
    }
    if (!gaveAny) break;
  }

  // se o orçamento não cobre nem os MEVs (pouquíssimos dias), corta proporcionalmente e diz isso
  const allocated = slots.reduce((sum, sl) => sum + sl.sets, 0);
  const overBudget = allocated > budget;
  if (overBudget) {
    const scale = budget / allocated;
    for (const sl of slots) sl.sets = Math.max(0, Math.round(sl.sets * scale));
  }

  const budgetNote =
    adherenceFactor < 1 || recoveryFactor < 1
      ? ` Orçamento semanal reduzido${adherenceFactor < 1 ? " por adesão baixa no ciclo anterior" : ""}${
          recoveryFactor < 1 ? `${adherenceFactor < 1 ? " e" : ""} por sinais de recuperação ruim` : ""
        } — o ajuste é no volume total, não em um grupo isolado.`
      : "";

  return slots.map((sl) => {
    const muscleLabel = MUSCLE_GROUP_LABEL[sl.landmark.muscle];
    const freq = freqByMuscle.get(sl.landmark.muscle) ?? 0;

    let reason: string;
    if (sl.ceiling === 0) {
      reason =
        exercisesByMuscle(sl.landmark.muscle).length === 0
          ? `Sem exercício desse grupo no catálogo — o estímulo vem indireto de outros movimentos (ex: lombar em stiff, terra e agachamento). Meta direta zerada de propósito, em vez de exibir um alvo que nenhuma sessão pode cumprir.`
          : `Grupo não aparece na divisão de ${daysPerWeek} dias — meta zerada em vez de prometer volume que a divisão não entrega.`;
    } else if (sl.isPriority) {
      reason = `Prioridade declarada (consultoria) — ${sl.sets} séries/semana, com peso dobrado na disputa pelo orçamento e entrada primeiro na sessão.${
        sl.sets < sl.landmark.mrv ? ` Abaixo do MRV (${sl.landmark.mrv}) porque ${sl.sets >= sl.ceiling ? `a frequência de ${freq}x/semana tem teto de ${sl.ceiling} séries` : "o orçamento semanal não comporta mais"}.` : ""
      }${budgetNote}`;
    } else if (sl.sets >= sl.landmark.mav) {
      reason = `Meta no MAV (${sl.landmark.mav} séries/semana) — melhor custo-benefício da dose-resposta volume→hipertrofia.${budgetNote}`;
    } else if (sl.assessed && sl.assessed.relativeDevelopment !== "proporcional") {
      reason = `Leitura visual marcou como "${sl.assessed.relativeDevelopment === "atras_dos_outros" ? "atrás dos outros" : "destaque"}" — ${sl.sets} séries/semana dentro do orçamento de ${daysPerWeek} dias.${budgetNote}`;
    } else {
      reason = `${sl.sets} séries/semana: perto do mínimo produtivo (MEV ${sl.landmark.mev}), porque ${daysPerWeek} dias/semana dão um orçamento de ~${budget} séries e ele não cobre o MAV de todos os grupos. Mirar MAV em tudo exige mais dias de treino, não uma meta maior no papel.${budgetNote}`;
    }

    return { muscle: sl.landmark.muscle, muscleLabel, weeklySets: sl.sets, reason, isPriority: sl.isPriority || undefined };
  });
}

interface SplitDayTemplate {
  label: string;
  muscles: MuscleGroup[];
}

// Templates por dias/semana. O de 3 dias replica a divisão real do educador físico do usuário (peito+
// tríceps+panturrilha / costas+bíceps / pernas, ver exerciseLibrary.ts) — não é um template genérico
// pra esse caso específico. Os demais seguem convenções padrão de divisão (full body, upper/lower,
// push/pull/legs) amplamente usadas na prática, já que frequência de treino por si não muda hipertrofia
// com volume equalizado (Schoenfeld, Grgic & Krieger 2018, DOI 10.1080/02640414.2018.1555906) — o que
// importa é encaixar o volume-alvo de cada grupo em sessões de tamanho razoável.
const SPLIT_TEMPLATES: Record<number, SplitDayTemplate[]> = {
  1: [
    {
      label: "Corpo inteiro",
      muscles: ["peito", "costas", "ombro", "biceps", "triceps", "quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"],
    },
  ],
  2: [
    { label: "Corpo inteiro A", muscles: ["peito", "costas", "ombro", "biceps", "triceps", "quadriceps", "posterior_coxa", "abdominal"] },
    { label: "Corpo inteiro B", muscles: ["peito", "costas", "ombro", "quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
  ],
  3: [
    // Ombro entrou no dia 1. O template original replicava o print do educador (peito/tríceps/
    // panturrilha), que não tinha exercício de ombro dedicado, sob a justificativa de "estímulo
    // indireto do supino". Só que o app conta apenas o grupo PRIMÁRIO no volume efetivo (ver
    // trainingVolume.ts), então na prática o ombro recebia ZERO séries por semana — e como este é o
    // único template com 3 dias, ficava zero o ano inteiro. Panturrilha saiu do dia 1 e ficou só no dia
    // de perna, que é onde ela já aparecia, pra o dia 1 não estourar o orçamento de séries por sessão.
    { label: "Peito/Ombro/Tríceps", muscles: ["peito", "ombro", "triceps"] },
    { label: "Costas/Bíceps", muscles: ["costas", "biceps", "antebraco", "abdominal"] },
    { label: "Pernas", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
  ],
  4: [
    { label: "Superior A", muscles: ["peito", "ombro", "triceps"] },
    { label: "Inferior A", muscles: ["quadriceps", "gluteo", "posterior_coxa", "panturrilha"] },
    { label: "Superior B", muscles: ["costas", "biceps", "antebraco", "abdominal"] },
    { label: "Inferior B", muscles: ["posterior_coxa", "gluteo", "quadriceps", "panturrilha", "lombar"] },
  ],
  5: [
    { label: "Peito/Ombro/Tríceps A", muscles: ["peito", "ombro", "triceps"] },
    { label: "Costas/Bíceps A", muscles: ["costas", "biceps", "antebraco"] },
    { label: "Pernas", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
    { label: "Peito/Ombro/Tríceps B", muscles: ["peito", "ombro", "triceps", "abdominal"] },
    { label: "Costas/Bíceps B", muscles: ["costas", "biceps", "antebraco", "lombar", "abdominal"] },
  ],
  6: [
    { label: "Push A", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull A", muscles: ["costas", "biceps", "antebraco"] },
    { label: "Legs A", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
    { label: "Push B", muscles: ["peito", "ombro", "triceps", "abdominal"] },
    { label: "Pull B", muscles: ["costas", "biceps", "antebraco", "lombar"] },
    { label: "Legs B", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
  ],
};

// tetos pra manter a sessão gerada dentro do que uma pessoa consegue treinar de verdade num dia — sem
// isso, um grupo com poucos exercícios no catálogo (ex: glúteo, só 1 opção) acabava recebendo todas as
// séries da meta semanal empilhadas num exercício só (10+ séries seguidas), e um dia com vários grupos
// virava uma sessão de 15+ exercícios. Nenhum dos dois é um treino real. Grupo prioritário ganha 1
// exercício a mais de teto — meta maior (MRV) precisa de mais variedade pra caber sem virar 1 exercício
// gigante.
const MAX_SETS_PER_EXERCISE = 5;
const MAX_EXERCISES_PER_MUSCLE_PER_DAY = 2;
const MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY = 3;

/** Escolhe exercícios do catálogo pra cobrir `setsNeeded` séries desse grupo num dia — compostos
 * primeiro (mais retorno por série, faz sentido fazer com a pessoa fresca), isolados completam o
 * resto, sem passar de `MAX_SETS_PER_EXERCISE` por exercício nem do teto de exercícios/dia pro mesmo
 * grupo (quando o catálogo não sustenta a meta inteira nesses limites, a sessão fica com menos volume
 * do que a meta semanal — é a frequência que precisa subir, não a sessão virar interminável).
 * `rotation` desloca o ponto de partida da lista pra variar o exercício entre a variante A e B do mesmo
 * grupo na semana (mesmo raciocínio do suggestExerciseSwap em trainingPeriodization.ts). */
function pickExercisesForMuscle(
  muscle: MuscleGroup,
  setsNeeded: number,
  rotation: number,
  isPriority: boolean,
  loadByExercise?: Map<string, number>
): TrainingItem[] {
  const candidates = exercisesByMuscle(muscle);
  if (candidates.length === 0 || setsNeeded <= 0) return [];

  const maxExercises = isPriority ? MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY : MAX_EXERCISES_PER_MUSCLE_PER_DAY;

  // compostos primeiro (mais retorno por série, faz sentido com a pessoa fresca)
  const ordered = [...candidates].sort((a, b) => {
    if (a.pattern === b.pattern) return 0;
    return a.pattern === "composto" ? -1 : 1;
  });
  const offset = rotation % ordered.length;
  const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];

  const numExercises = Math.max(1, Math.min(rotated.length, maxExercises, Math.ceil(setsNeeded / MAX_SETS_PER_EXERCISE)));

  // Diversidade de padrão: escolhe no máximo um exercício por família de movimento antes de aceitar um
  // segundo da mesma família. Sem isso a ordenação "compostos primeiro" produzia Supino Inclinado 15° +
  // Supino Inclinado 30° no peito, e duas puxadas verticais sem nenhuma remada nas costas.
  const chosen: typeof rotated = [];
  const usedFamilies = new Set<string>();
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (usedFamilies.has(ex.movementFamily)) continue;
    chosen.push(ex);
    usedFamilies.add(ex.movementFamily);
  }
  // se as famílias disponíveis não bastarem, completa repetindo família (grupo com catálogo pequeno)
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (!chosen.includes(ex)) chosen.push(ex);
  }

  const base = Math.min(MAX_SETS_PER_EXERCISE, Math.floor(setsNeeded / chosen.length));
  const remainder = Math.min(chosen.length, setsNeeded - base * chosen.length);

  return chosen.map((ex, i) => {
    const workSets = Math.min(MAX_SETS_PER_EXERCISE, base + (i < remainder ? 1 : 0));
    const suggestedLoad = loadByExercise?.get(ex.id) ?? null;
    const blocks: TrainingItem["blocks"] = [];

    // Aquecimento no PRIMEIRO exercício composto do grupo. O tipo `warmup` já existia no modelo de
    // dados e no protocolo do educador (a contagem de volume efetivo em trainingVolume.ts o exclui de
    // propósito), mas a divisão gerada nunca prescrevia nenhum — as sessões saíam com a pessoa entrando
    // direto na série pesada. Não entra em isolado nem no segundo exercício do mesmo grupo: a
    // articulação já está aquecida a essa altura.
    if (i === 0 && ex.pattern === "composto") {
      blocks.push({
        reserveType: "warmup" as const,
        sets: 2,
        repRange: "8-12",
        rirTarget: 5,
        // ~50% e ~70% da carga de trabalho é a progressão de aproximação usual; sem carga registrada
        // ainda, fica em aberto pra pessoa ajustar
        loadKg: suggestedLoad != null ? Math.round(suggestedLoad * 0.5 * 2) / 2 : null,
      });
    }

    blocks.push({
      reserveType: "work" as const,
      sets: workSets,
      repRange: ex.pattern === "composto" ? "6-10" : "10-15",
      // Composto pesado fica 1-2 reps da falha (o custo de falhar num agachamento é alto); isolado
      // pode ir mais perto. É o alvo que a pergunta de adesão ("chegou perto da falha?") cobra.
      rirTarget: ex.pattern === "composto" ? 2 : 1,
      // carga sugerida a partir do histórico logado (ver suggestLoadProgression em
      // trainingPeriodization.ts); null quando ainda não há log desse exercício
      loadKg: suggestedLoad,
    });

    return { exerciseId: ex.id, blocks };
  });
}

/** Garante 2ª exposição semanal pra grupo prioritário que só aparece 1x no template — treinar um grupo
 * prioritário 2x/semana em vez de empilhar tudo numa sessão só é o que torna a meta em MRV recuperável
 * (mesma lógica de "recuperação virando fator limitante" de trainingVolume.ts). Adiciona o grupo ao dia
 * que ainda não o tem e tem menos grupos (o "mais vago"), como uma sessão complementar mais curta. */
function ensurePriorityFrequency(template: SplitDayTemplate[], priorityMuscles: MuscleGroup[]): SplitDayTemplate[] {
  if (priorityMuscles.length === 0) return template;
  const days = template.map((d) => ({ label: d.label, muscles: [...d.muscles] }));

  for (const muscle of priorityMuscles) {
    const appearances = days.filter((d) => d.muscles.includes(muscle)).length;
    if (appearances >= 2 || days.length < 2) continue;
    const candidate = days
      .filter((d) => !d.muscles.includes(muscle))
      .sort((a, b) => a.muscles.length - b.muscles.length)[0];
    candidate?.muscles.push(muscle);
  }

  return days;
}

/** Monta a divisão de treino automaticamente a partir dos dias/semana disponíveis e da meta de volume
 * por grupo — distribui o volume semanal de cada músculo entre as sessões em que ele aparece no template
 * e escolhe os exercícios do catálogo. `daysPerWeek` fora de 1-6 é limitado a esse intervalo. Grupos
 * prioritários entram primeiro em cada sessão (treinados com a pessoa fresca) e ganham uma 2ª exposição
 * semanal quando o template só previa 1x. */
export function buildSplit(
  daysPerWeek: number,
  muscleTargets: MuscleTarget[],
  loadByExercise?: Map<string, number>
): TrainingSession[] {
  const days = Math.max(1, Math.min(6, Math.round(daysPerWeek)));
  const priorityMuscles = muscleTargets.filter((t) => t.isPriority).map((t) => t.muscle);
  const template = ensurePriorityFrequency(SPLIT_TEMPLATES[days], priorityMuscles);
  const targetByMuscle = new Map(muscleTargets.map((t) => [t.muscle, t.weeklySets]));
  const priorityByMuscle = new Set(priorityMuscles);

  const frequencyByMuscle = new Map<MuscleGroup, number>();
  for (const day of template) {
    for (const m of day.muscles) frequencyByMuscle.set(m, (frequencyByMuscle.get(m) ?? 0) + 1);
  }

  const rotationByMuscle = new Map<MuscleGroup, number>();

  return template.map((day) => {
    // grupos prioritários primeiro na lista — treinados enquanto a pessoa ainda está fresca na sessão
    const orderedMuscles = [...day.muscles].sort((a, b) => {
      const pa = priorityByMuscle.has(a) ? 0 : 1;
      const pb = priorityByMuscle.has(b) ? 0 : 1;
      return pa - pb;
    });

    const items: TrainingItem[] = [];
    for (const muscle of orderedMuscles) {
      const weeklySets = targetByMuscle.get(muscle) ?? landmarkFor(muscle).mav;
      const freq = frequencyByMuscle.get(muscle) ?? 1;
      const setsThisDay = Math.round(weeklySets / freq);
      const rotation = rotationByMuscle.get(muscle) ?? 0;
      rotationByMuscle.set(muscle, rotation + 1);
      items.push(...pickExercisesForMuscle(muscle, setsThisDay, rotation, priorityByMuscle.has(muscle), loadByExercise));
    }
    return { label: day.label, items };
  });
}

export interface WeekVolumePlan {
  weekIndex: number;
  label: string;
  isDeload: boolean;
  /** o que fazer nessa semana e por quê — não uma lista de números por grupo, uma frase acionável */
  focusNote: string;
  /** exercícios, séries e repetições prontos pra treinar nessa semana (já com o volume rampado) */
  sessions: TrainingSession[];
}

// Mesociclo de 5 semanas (4 de acúmulo progressivo + 1 de deload) — convenção prática de periodização,
// não um esquema com superioridade comprovada: diferentes modelos de periodização (linear vs. ondulatória
// diária) produzem hipertrofia semelhante quando o volume total é equalizado (Grgic, Mikulic, Podnar &
// Pedisic 2017, PeerJ, DOI 10.7717/peerj.3695). O que importa, segundo a literatura de dose-resposta já
// citada (Schoenfeld 2016; Pelland et al. 2025), é progredir o volume em direção ao MAV e não ficar
// tempo demais perto do MRV sem descanso — o esquema abaixo faz isso de forma simples e previsível.
const MESOCYCLE_WEEKS = 5;

/** Projeta a progressão de volume por grupo ao longo de várias semanas e já monta os exercícios/séries/
 * repetições de cada semana (não só o número-alvo): rampa de MEV até a meta ao longo de 4 semanas, com
 * a 5ª semana em deload (~50% do volume) antes de reiniciar o ciclo — evita empilhar semanas seguidas
 * perto do MRV, mesmo raciocínio de "recuperação virando fator limitante" já usado em
 * trainingVolume.ts/trainingPeriodization.ts. */
export function planTrainingPeriodization(
  muscleTargets: MuscleTarget[],
  daysPerWeek: number,
  weeksAhead: number,
  loadByExercise?: Map<string, number>
): WeekVolumePlan[] {
  const plan: WeekVolumePlan[] = [];

  for (let w = 1; w <= weeksAhead; w++) {
    const cyclePosition = ((w - 1) % MESOCYCLE_WEEKS) + 1;
    const isDeload = cyclePosition === MESOCYCLE_WEEKS;
    const progressFraction = Math.min(1, cyclePosition / (MESOCYCLE_WEEKS - 1));

    const rampedTargets: MuscleTarget[] = muscleTargets.map((t) => {
      const landmark = landmarkFor(t.muscle);
      const rampedSets = isDeload
        ? Math.round(t.weeklySets * 0.5)
        : Math.round(landmark.mev + (t.weeklySets - landmark.mev) * progressFraction);
      return { ...t, weeklySets: Math.max(0, rampedSets) };
    });

    // Quando o orçamento semanal mal cobre o MEV (caso típico de 3 dias/semana), a "rampa" de volume é
    // degenerada — sai 62/67/67/67 e a progressão de volume simplesmente não existe. Antes isso ficava
    // escondido atrás de um texto que prometia "volume subindo progressivamente". Agora o plano diz a
    // verdade e aponta pra onde a progressão realmente está nesse cenário: a carga (ver
    // suggestLoadProgression em trainingPeriodization.ts).
    const totalTarget = muscleTargets.reduce((sum, t) => sum + t.weeklySets, 0);
    const totalMev = muscleTargets.reduce((sum, t) => sum + (t.weeklySets > 0 ? landmarkFor(t.muscle).mev : 0), 0);
    const rampIsFlat = totalTarget <= totalMev * 1.15;

    const focusNote = isDeload
      ? "Semana de deload — volume reduzido de propósito (~metade) pra recuperar antes do próximo bloco de acúmulo."
      : rampIsFlat
        ? "Volume praticamente constante nesta semana: com os dias de treino disponíveis, o orçamento semanal já fica perto do mínimo produtivo e não sobra margem pra rampa de volume. A progressão deste mesociclo é de CARGA — repetir a mesma série com mais peso —, não de séries. Pra ter rampa de volume, é preciso mais dias de treino."
        : cyclePosition === 1
          ? "Início do mesociclo — volume mais perto do mínimo produtivo, pra entrar aos poucos."
          : cyclePosition >= MESOCYCLE_WEEKS - 1
            ? "Última semana de acúmulo antes do deload — volume no pico da meta do mesociclo."
            : "Semana de acúmulo — volume subindo progressivamente rumo à meta.";

    plan.push({
      weekIndex: w,
      label: `Semana ${w}`,
      isDeload,
      focusNote,
      sessions: buildSplit(daysPerWeek, rampedTargets, loadByExercise),
    });
  }

  return plan;
}
