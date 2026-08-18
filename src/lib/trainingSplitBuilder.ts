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

/** Meta de séries/semana por grupo pro mesociclo atual. Prioridade declarada (`priorityMuscles`, ex:
 * "consultoria real disse pra focar costas e braço") vence qualquer leitura de foto e vai direto pro
 * teto recuperável (MRV) — é informação mais confiável que um algoritmo lendo ângulo de câmera. Sem
 * prioridade declarada, cai na leitura visual: MAV como padrão, puxado pra cima quando a foto marca o
 * grupo "atrás dos outros", relaxado quando "destaque" (confidence "baixa" é ignorada, chute demais pra
 * virar meta de volume). */
export function computeMuscleTargets(
  assessment: MuscleAssessmentInput[] = [],
  priorityMuscles: MuscleGroup[] = []
): MuscleTarget[] {
  return VOLUME_LANDMARKS.map((landmark) => {
    const muscleLabel = MUSCLE_GROUP_LABEL[landmark.muscle];

    if (priorityMuscles.includes(landmark.muscle)) {
      return {
        muscle: landmark.muscle,
        muscleLabel,
        weeklySets: landmark.mrv,
        reason: `Prioridade declarada (consultoria) — meta no teto recuperável (MRV: ${landmark.mrv} séries/semana) em vez do MAV padrão, exercícios desse grupo entram primeiro na sessão e a frequência semanal sobe quando possível.`,
        isPriority: true,
      };
    }

    const a = assessment.find((x) => x.muscle === landmark.muscle && x.confidence !== "baixa");
    const adjustment = a ? DEVELOPMENT_ADJUSTMENT[a.relativeDevelopment] : 1.0;
    const weeklySets = Math.round(Math.min(landmark.mrv, Math.max(landmark.mev, landmark.mav * adjustment)));
    const reason =
      a && a.relativeDevelopment !== "proporcional"
        ? `Leitura visual marcou esse grupo como "${a.relativeDevelopment === "atras_dos_outros" ? "atrás dos outros" : "destaque"}" — meta ajustada do MAV padrão (${landmark.mav}) pra ${weeklySets} séries/semana.`
        : `Meta padrão: MAV (${landmark.mav} séries/semana) — melhor custo-benefício da dose-resposta volume→hipertrofia.`;
    return { muscle: landmark.muscle, muscleLabel, weeklySets, reason };
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
    // ombro fica de fora do alvo explícito aqui — já recebe estímulo indireto relevante do supino/
    // desenvolvimento como secondaryMuscle, igual o dia 1 real do educador (peito/tríceps/panturrilha)
    // não tem exercício de ombro dedicado
    { label: "Peito/Tríceps/Panturrilha", muscles: ["peito", "triceps", "panturrilha", "abdominal"] },
    { label: "Costas/Bíceps", muscles: ["costas", "biceps", "antebraco", "abdominal"] },
    { label: "Pernas", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
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
function pickExercisesForMuscle(muscle: MuscleGroup, setsNeeded: number, rotation: number, isPriority: boolean): TrainingItem[] {
  const candidates = exercisesByMuscle(muscle);
  if (candidates.length === 0 || setsNeeded <= 0) return [];

  const maxExercises = isPriority ? MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY : MAX_EXERCISES_PER_MUSCLE_PER_DAY;
  const ordered = [...candidates].sort((a, b) => {
    if (a.pattern === b.pattern) return 0;
    return a.pattern === "composto" ? -1 : 1;
  });
  const offset = rotation % ordered.length;
  const rotated = [...ordered.slice(offset), ...ordered.slice(0, offset)];

  const numExercises = Math.max(1, Math.min(rotated.length, maxExercises, Math.ceil(setsNeeded / MAX_SETS_PER_EXERCISE)));
  const chosen = rotated.slice(0, numExercises);
  const base = Math.min(MAX_SETS_PER_EXERCISE, Math.floor(setsNeeded / numExercises));
  const remainder = Math.min(numExercises, setsNeeded - base * numExercises);

  return chosen.map((ex, i) => ({
    exerciseId: ex.id,
    blocks: [
      {
        reserveType: "work" as const,
        sets: Math.min(MAX_SETS_PER_EXERCISE, base + (i < remainder ? 1 : 0)),
        repRange: ex.pattern === "composto" ? "6-10" : "10-15",
        loadKg: null,
      },
    ],
  }));
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
export function buildSplit(daysPerWeek: number, muscleTargets: MuscleTarget[]): TrainingSession[] {
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
      items.push(...pickExercisesForMuscle(muscle, setsThisDay, rotation, priorityByMuscle.has(muscle)));
    }
    return { label: day.label, items };
  });
}

export interface WeekVolumePlan {
  weekIndex: number;
  label: string;
  isDeload: boolean;
  totalWeeklySets: number;
  muscles: { muscle: MuscleGroup; muscleLabel: string; weeklySets: number }[];
}

// Mesociclo de 5 semanas (4 de acúmulo progressivo + 1 de deload) — convenção prática de periodização,
// não um esquema com superioridade comprovada: diferentes modelos de periodização (linear vs. ondulatória
// diária) produzem hipertrofia semelhante quando o volume total é equalizado (Grgic, Mikulic, Podnar &
// Pedisic 2017, PeerJ, DOI 10.7717/peerj.3695). O que importa, segundo a literatura de dose-resposta já
// citada (Schoenfeld 2016; Pelland et al. 2025), é progredir o volume em direção ao MAV e não ficar
// tempo demais perto do MRV sem descanso — o esquema abaixo faz isso de forma simples e previsível.
const MESOCYCLE_WEEKS = 5;

/** Projeta a progressão de volume por grupo ao longo de várias semanas: rampa de MEV até a meta
 * (MAV, ajustado pela leitura visual) ao longo de 4 semanas, com a 5ª semana em deload (~50% do volume)
 * antes de reiniciar o ciclo — evita empilhar semanas seguidas perto do MRV, mesmo raciocínio de
 * "recuperação virando fator limitante" já usado em trainingVolume.ts/trainingPeriodization.ts. */
export function planTrainingPeriodization(muscleTargets: MuscleTarget[], weeksAhead: number): WeekVolumePlan[] {
  const plan: WeekVolumePlan[] = [];

  for (let w = 1; w <= weeksAhead; w++) {
    const cyclePosition = ((w - 1) % MESOCYCLE_WEEKS) + 1;
    const isDeload = cyclePosition === MESOCYCLE_WEEKS;
    const progressFraction = Math.min(1, cyclePosition / (MESOCYCLE_WEEKS - 1));

    const muscles = muscleTargets.map((t) => {
      const landmark = landmarkFor(t.muscle);
      const rampedTarget = isDeload
        ? Math.round(t.weeklySets * 0.5)
        : Math.round(landmark.mev + (t.weeklySets - landmark.mev) * progressFraction);
      return { muscle: t.muscle, muscleLabel: t.muscleLabel, weeklySets: Math.max(0, rampedTarget) };
    });

    plan.push({
      weekIndex: w,
      label: `Semana ${w}`,
      isDeload,
      totalWeeklySets: muscles.reduce((sum, m) => sum + m.weeklySets, 0),
      muscles,
    });
  }

  return plan;
}
