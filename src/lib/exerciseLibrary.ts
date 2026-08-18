export type MuscleGroup =
  | "peito"
  | "costas"
  | "ombro"
  | "biceps"
  | "triceps"
  | "antebraco"
  | "quadriceps"
  | "posterior_coxa"
  | "gluteo"
  | "panturrilha"
  | "abdominal"
  | "lombar";

export const MUSCLE_GROUP_LABEL: Record<MuscleGroup, string> = {
  peito: "Peito",
  costas: "Costas",
  ombro: "Ombro",
  biceps: "Bíceps",
  triceps: "Tríceps",
  antebraco: "Antebraço",
  quadriceps: "Quadríceps",
  posterior_coxa: "Posterior de coxa",
  gluteo: "Glúteo",
  panturrilha: "Panturrilha",
  abdominal: "Abdominal",
  lombar: "Lombar",
};

export type MovementPattern = "composto" | "isolado";

export interface Exercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  /** grupos que recebem estímulo relevante mas não são o alvo principal — não contam pro volume
   * efetivo do grupo primário, mas ajudam a explicar fadiga acumulada entre sessões */
  secondaryMuscles: MuscleGroup[];
  pattern: MovementPattern;
  equipment: string;
  /** true pra exercícios unilaterais (uma perna/braço por vez) — relevante pra volume real por lado */
  unilateral?: boolean;
}

/** Catálogo extraído do programa real do educador físico do usuário (MFIT Personal, prints de
 * 13/10/2023 e 17/10/2023) — não é uma lista genérica de academia, é o vocabulário de exercícios que
 * ele efetivamente usa, o que importa pra reconhecer sessões e pra sugerir substituições que soem como
 * o estilo dele (ex: preferência por unilateral em puxadas/remadas, ângulos específicos de supino). */
export const EXERCISE_LIBRARY: Exercise[] = [
  // peito
  { id: "supino-inclinado-halteres-15", name: "Supino Inclinado com Halteres (15°)", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", equipment: "halteres" },
  { id: "supino-inclinado-halteres-30", name: "Supino Inclinado com Halteres (30°)", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", equipment: "halteres" },
  { id: "supino-reto-smith", name: "Supino Reto no Smith", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", equipment: "smith" },
  { id: "crucifixo-maquina", name: "Crucifixo Máquina", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },
  { id: "crucifixo-inclinado-halteres-15", name: "Crucifixo Inclinado com Halteres (15°)", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", equipment: "halteres" },
  { id: "crossover-polia-alta-ajoelhado", name: "Crossover Polia Alta Ajoelhado", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", equipment: "polia" },

  // ombro
  { id: "desenvolvimento-halteres-75", name: "Desenvolvimento com Halteres (75°)", primaryMuscle: "ombro", secondaryMuscles: ["triceps"], pattern: "composto", equipment: "halteres" },
  { id: "elevacao-lateral-halteres", name: "Elevação Lateral com Halteres", primaryMuscle: "ombro", secondaryMuscles: [], pattern: "isolado", equipment: "halteres" },
  { id: "elevacao-lateral-unilateral-polia-90", name: "Elevação Lateral Unilateral na Polia (90°)", primaryMuscle: "ombro", secondaryMuscles: [], pattern: "isolado", equipment: "polia", unilateral: true },
  { id: "crucifixo-inverso-maquina", name: "Crucifixo Inverso Máquina", primaryMuscle: "ombro", secondaryMuscles: ["costas"], pattern: "isolado", equipment: "maquina" },
  { id: "peck-deck-invertido-pronado", name: "Peck Deck Invertido Pegada Pronada", primaryMuscle: "ombro", secondaryMuscles: ["costas"], pattern: "isolado", equipment: "maquina" },

  // tríceps
  { id: "triceps-polia-barra-w", name: "Tríceps na Polia Barra W", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", equipment: "polia" },
  { id: "triceps-frances-polia-corda", name: "Tríceps Francês na Polia com Corda", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", equipment: "polia" },
  { id: "triceps-unilateral-polia-alta-pronada", name: "Tríceps Unilateral na Polia Alta (Pegada Pronada)", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", equipment: "polia", unilateral: true },

  // costas
  { id: "puxada-aberta-barra-reta", name: "Puxada Aberta Barra Reta", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", equipment: "polia" },
  { id: "puxada-neutra-triangulo", name: "Puxada Neutra Triângulo", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", equipment: "polia" },
  { id: "remada-curvada-barra-pronada", name: "Remada Curvada com Barra Pegada Pronada", primaryMuscle: "costas", secondaryMuscles: ["biceps", "lombar"], pattern: "composto", equipment: "barra" },
  { id: "remada-unilateral-serrote", name: "Remada Unilateral Base Ipsilateral (Serrote)", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", equipment: "halter", unilateral: true },
  { id: "remada-unilateral-polia", name: "Remada Unilateral na Polia", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", equipment: "polia", unilateral: true },
  { id: "remada-neutra-halteres-peito-apoiado", name: "Remada Neutra com Halteres, Peito Apoiado no Banco", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", equipment: "halteres" },

  // bíceps / antebraço
  { id: "rosca-direta-barra-w", name: "Rosca Direta com a Barra W", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", equipment: "barra" },
  { id: "rosca-scott-unilateral-halter", name: "Rosca Scott Unilateral com Halter", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", equipment: "halter", unilateral: true },
  { id: "rosca-direta-polia-baixa-corda", name: "Rosca Direta na Polia Baixa com Corda", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", equipment: "polia" },
  { id: "rosca-inversa-livre-barra-w", name: "Rosca Inversa Livre com Barra W", primaryMuscle: "antebraco", secondaryMuscles: ["biceps"], pattern: "isolado", equipment: "barra" },
  { id: "extensao-punho-halteres", name: "Extensão de Punho com Halteres", primaryMuscle: "antebraco", secondaryMuscles: [], pattern: "isolado", equipment: "halteres" },

  // quadríceps
  { id: "agachamento-livre", name: "Agachamento Livre", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo", "lombar"], pattern: "composto", equipment: "barra" },
  { id: "leg-press-45-unilateral", name: "Leg Press 45° Unilateral", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo"], pattern: "composto", equipment: "maquina", unilateral: true },
  { id: "agachamento-bulgaro", name: "Agachamento Búlgaro", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo"], pattern: "composto", equipment: "halteres", unilateral: true },
  { id: "cadeira-extensora-unilateral", name: "Cadeira Extensora Unilateral", primaryMuscle: "quadriceps", secondaryMuscles: [], pattern: "isolado", equipment: "maquina", unilateral: true },

  // posterior de coxa / glúteo
  { id: "stiff-barra", name: "Stiff com Barra", primaryMuscle: "posterior_coxa", secondaryMuscles: ["gluteo", "lombar"], pattern: "composto", equipment: "barra" },
  { id: "levantamento-terra", name: "Levantamento Terra", primaryMuscle: "posterior_coxa", secondaryMuscles: ["gluteo", "lombar", "costas"], pattern: "composto", equipment: "barra" },
  { id: "mesa-flexora", name: "Mesa Flexora", primaryMuscle: "posterior_coxa", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },
  { id: "cadeira-flexora", name: "Cadeira Flexora", primaryMuscle: "posterior_coxa", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },
  { id: "elevacao-pelvica-barra-livre", name: "Elevação Pélvica com Barra Livre", primaryMuscle: "gluteo", secondaryMuscles: ["posterior_coxa"], pattern: "composto", equipment: "barra" },

  // panturrilha
  { id: "panturrilha-leg-press-45", name: "Panturrilha no Leg Press 45°", primaryMuscle: "panturrilha", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },
  { id: "panturrilha-sentado", name: "Panturrilha Sentado", primaryMuscle: "panturrilha", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },

  // abdominal
  { id: "abdominal-banco-declinado", name: "Abdominal no Banco Declinado", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", equipment: "banco" },
  { id: "abdominal-reto-solo", name: "Abdominal Reto Solo", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", equipment: "solo" },
  { id: "abdominal-prancha-isometrica", name: "Abdominal Prancha Isométrica", primaryMuscle: "abdominal", secondaryMuscles: ["lombar"], pattern: "isolado", equipment: "solo" },
  { id: "abdominal-infra-paralelas-pernas-estendidas", name: "Abdominal Infra Paralelas com Pernas Estendidas", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", equipment: "maquina" },
  { id: "abdominal-polia-corda", name: "Abdominal na Polia com Corda", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", equipment: "polia" },
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

export function exercisesByMuscle(muscle: MuscleGroup): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.primaryMuscle === muscle);
}
