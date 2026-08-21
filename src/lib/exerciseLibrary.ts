export type MuscleGroup =
  | "peito"
  | "costas"
  | "ombro"
  | "deltoide_posterior"
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
  deltoide_posterior: "Deltoide posterior",
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
  /** família de movimento — exercícios da mesma família treinam o grupo pelo mesmo padrão e não contam
   * como variedade real. Existe porque o seletor de exercícios escolhia "compostos primeiro" na ordem
   * do catálogo e acabava prescrevendo Supino Inclinado 15° + Supino Inclinado 30° (o mesmo movimento
   * duas vezes) ou duas puxadas verticais sem nenhuma remada no dia de costas. */
  movementFamily: string;
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
  { id: "supino-inclinado-halteres-15", name: "Supino Inclinado com Halteres (15°)", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", movementFamily: "supino-inclinado", equipment: "halteres" },
  { id: "supino-inclinado-halteres-30", name: "Supino Inclinado com Halteres (30°)", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", movementFamily: "supino-inclinado", equipment: "halteres" },
  { id: "supino-reto-smith", name: "Supino Reto no Smith", primaryMuscle: "peito", secondaryMuscles: ["triceps", "ombro"], pattern: "composto", movementFamily: "supino-reto", equipment: "smith" },
  { id: "crucifixo-maquina", name: "Crucifixo Máquina", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", movementFamily: "crucifixo", equipment: "maquina" },
  { id: "crucifixo-inclinado-halteres-15", name: "Crucifixo Inclinado com Halteres (15°)", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", movementFamily: "crucifixo", equipment: "halteres" },
  { id: "crossover-polia-alta-ajoelhado", name: "Crossover Polia Alta Ajoelhado", primaryMuscle: "peito", secondaryMuscles: [], pattern: "isolado", movementFamily: "crossover", equipment: "polia" },

  // ombro
  { id: "desenvolvimento-halteres-75", name: "Desenvolvimento com Halteres (75°)", primaryMuscle: "ombro", secondaryMuscles: ["triceps"], pattern: "composto", movementFamily: "desenvolvimento", equipment: "halteres" },
  { id: "elevacao-lateral-halteres", name: "Elevação Lateral com Halteres", primaryMuscle: "ombro", secondaryMuscles: [], pattern: "isolado", movementFamily: "elevacao-lateral", equipment: "halteres" },
  { id: "elevacao-lateral-unilateral-polia-90", name: "Elevação Lateral Unilateral na Polia (90°)", primaryMuscle: "ombro", secondaryMuscles: [], pattern: "isolado", movementFamily: "elevacao-lateral", equipment: "polia", unilateral: true },
  { id: "crucifixo-inverso-maquina", name: "Crucifixo Inverso Máquina", primaryMuscle: "deltoide_posterior", secondaryMuscles: ["costas"], pattern: "isolado", movementFamily: "deltoide-posterior", equipment: "maquina" },
  { id: "peck-deck-invertido-pronado", name: "Peck Deck Invertido Pegada Pronada", primaryMuscle: "deltoide_posterior", secondaryMuscles: ["costas"], pattern: "isolado", movementFamily: "deltoide-posterior", equipment: "maquina" },

  // tríceps
  { id: "triceps-polia-barra-w", name: "Tríceps na Polia Barra W", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-polia", equipment: "polia" },
  { id: "triceps-frances-polia-corda", name: "Tríceps Francês na Polia com Corda", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-overhead", equipment: "polia" },
  { id: "triceps-unilateral-polia-alta-pronada", name: "Tríceps Unilateral na Polia Alta (Pegada Pronada)", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-polia", equipment: "polia", unilateral: true },
  { id: "triceps-frances-halter", name: "Tríceps Francês com Halter", primaryMuscle: "triceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-acima-cabeca", equipment: "halteres" },
  { id: "mergulho-banco", name: "Mergulho no Banco", primaryMuscle: "triceps", secondaryMuscles: ["peito", "ombro"], pattern: "isolado", movementFamily: "mergulho", equipment: "peso-corporal" },
  // Supino fechado é o composto de tríceps que faltava. Sem ele, o único
  // "composto" do grupo era o mergulho no banco, e a ordenação composto-primeiro
  // o prescrevia com 5 séries de 6-10 a RIR 2 — extensão + rotação interna
  // máxima de ombro sob carga, a pior posição de cápsula anterior da musculação.
  { id: "supino-fechado-barra", name: "Supino Fechado com Barra", primaryMuscle: "triceps", secondaryMuscles: ["peito", "ombro"], pattern: "composto", movementFamily: "supino-fechado", equipment: "barra" },

  // costas
  { id: "puxada-aberta-barra-reta", name: "Puxada Aberta Barra Reta", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", movementFamily: "puxada-vertical", equipment: "polia" },
  { id: "puxada-neutra-triangulo", name: "Puxada Neutra Triângulo", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", movementFamily: "puxada-vertical", equipment: "polia" },
  { id: "remada-curvada-barra-pronada", name: "Remada Curvada com Barra Pegada Pronada", primaryMuscle: "costas", secondaryMuscles: ["biceps", "lombar"], pattern: "composto", movementFamily: "remada-horizontal", equipment: "barra" },
  { id: "remada-unilateral-serrote", name: "Remada Unilateral Base Ipsilateral (Serrote)", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", movementFamily: "remada-horizontal", equipment: "halter", unilateral: true },
  { id: "remada-unilateral-polia", name: "Remada Unilateral na Polia", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", movementFamily: "remada-horizontal", equipment: "polia", unilateral: true },
  { id: "remada-neutra-halteres-peito-apoiado", name: "Remada Neutra com Halteres, Peito Apoiado no Banco", primaryMuscle: "costas", secondaryMuscles: ["biceps"], pattern: "composto", movementFamily: "remada-horizontal", equipment: "halteres" },

  // bíceps / antebraço
  { id: "rosca-direta-barra-w", name: "Rosca Direta com a Barra W", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "rosca-direta", equipment: "barra" },
  { id: "rosca-scott-unilateral-halter", name: "Rosca Scott Unilateral com Halter", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "rosca-scott", equipment: "halter", unilateral: true },
  { id: "rosca-direta-polia-baixa-corda", name: "Rosca Direta na Polia Baixa com Corda", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "rosca-direta", equipment: "polia" },
  { id: "rosca-martelo-halteres", name: "Rosca Martelo com Halteres", primaryMuscle: "biceps", secondaryMuscles: ["antebraco"], pattern: "isolado", movementFamily: "rosca-neutra", equipment: "halteres" },
  { id: "rosca-scott-barra-w", name: "Rosca Scott na Barra W", primaryMuscle: "biceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "rosca-apoiada", equipment: "barra" },
  { id: "rosca-inversa-livre-barra-w", name: "Rosca Inversa Livre com Barra W", primaryMuscle: "antebraco", secondaryMuscles: ["biceps"], pattern: "isolado", movementFamily: "rosca-inversa", equipment: "barra" },
  { id: "extensao-punho-halteres", name: "Extensão de Punho com Halteres", primaryMuscle: "antebraco", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-punho", equipment: "halteres" },

  // quadríceps
  { id: "agachamento-livre", name: "Agachamento Livre", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo", "lombar"], pattern: "composto", movementFamily: "agachamento", equipment: "barra" },
  { id: "leg-press-45-unilateral", name: "Leg Press 45° Unilateral", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo"], pattern: "composto", movementFamily: "leg-press", equipment: "maquina", unilateral: true },
  { id: "agachamento-bulgaro", name: "Agachamento Búlgaro", primaryMuscle: "quadriceps", secondaryMuscles: ["gluteo"], pattern: "composto", movementFamily: "unilateral-perna", equipment: "halteres", unilateral: true },
  { id: "cadeira-extensora-unilateral", name: "Cadeira Extensora Unilateral", primaryMuscle: "quadriceps", secondaryMuscles: [], pattern: "isolado", movementFamily: "extensao-joelho", equipment: "maquina", unilateral: true },

  // posterior de coxa / glúteo
  { id: "stiff-barra", name: "Stiff com Barra", primaryMuscle: "posterior_coxa", secondaryMuscles: ["gluteo", "lombar"], pattern: "composto", movementFamily: "quadril-dominante", equipment: "barra" },
  { id: "levantamento-terra", name: "Levantamento Terra", primaryMuscle: "posterior_coxa", secondaryMuscles: ["gluteo", "lombar", "costas"], pattern: "composto", movementFamily: "quadril-dominante", equipment: "barra" },
  { id: "mesa-flexora", name: "Mesa Flexora", primaryMuscle: "posterior_coxa", secondaryMuscles: [], pattern: "isolado", movementFamily: "flexao-joelho", equipment: "maquina" },
  { id: "cadeira-flexora", name: "Cadeira Flexora", primaryMuscle: "posterior_coxa", secondaryMuscles: [], pattern: "isolado", movementFamily: "flexao-joelho", equipment: "maquina" },
  { id: "elevacao-pelvica-barra-livre", name: "Elevação Pélvica com Barra Livre", primaryMuscle: "gluteo", secondaryMuscles: ["posterior_coxa"], pattern: "composto", movementFamily: "extensao-quadril", equipment: "barra" },
  { id: "cadeira-abdutora", name: "Cadeira Abdutora", primaryMuscle: "gluteo", secondaryMuscles: [], pattern: "isolado", movementFamily: "abducao-quadril", equipment: "maquina" },
  { id: "coice-polia", name: "Coice na Polia", primaryMuscle: "gluteo", secondaryMuscles: ["posterior_coxa"], pattern: "isolado", movementFamily: "extensao-quadril-unilateral", equipment: "polia", unilateral: true },
  { id: "afundo-passada-halteres", name: "Afundo com Passada (Halteres)", primaryMuscle: "gluteo", secondaryMuscles: ["quadriceps", "posterior_coxa"], pattern: "composto", movementFamily: "afundo", equipment: "halteres", unilateral: true },

  // panturrilha
  { id: "panturrilha-leg-press-45", name: "Panturrilha no Leg Press 45°", primaryMuscle: "panturrilha", secondaryMuscles: [], pattern: "isolado", movementFamily: "panturrilha-em-pe", equipment: "maquina" },
  { id: "panturrilha-sentado", name: "Panturrilha Sentado", primaryMuscle: "panturrilha", secondaryMuscles: [], pattern: "isolado", movementFamily: "panturrilha-sentado", equipment: "maquina" },
  { id: "panturrilha-unilateral-halter", name: "Panturrilha Unilateral com Halter", primaryMuscle: "panturrilha", secondaryMuscles: [], pattern: "isolado", movementFamily: "panturrilha-unilateral", equipment: "halteres", unilateral: true },

  // abdominal
  // deltoide posterior — separado de "ombro" porque "ombro atrasado" num
  // fisiculturista quase nunca é anterior: o anterior já recebe ~16 séries
  // indiretas por semana de todo supino e desenvolvimento. Tratar os três como
  // um bucket só fazia o algoritmo reforçar justamente a cabeça saturada.
  { id: "face-pull-polia", name: "Face Pull na Polia", primaryMuscle: "deltoide_posterior", secondaryMuscles: ["costas"], pattern: "isolado", movementFamily: "face-pull", equipment: "polia" },
  { id: "rotacao-externa-polia", name: "Rotação Externa na Polia", primaryMuscle: "deltoide_posterior", secondaryMuscles: [], pattern: "isolado", movementFamily: "rotacao-externa", equipment: "polia" },
  { id: "remada-alta-cotovelo-aberto", name: "Remada Alta com Cotovelo Aberto", primaryMuscle: "deltoide_posterior", secondaryMuscles: ["ombro"], pattern: "composto", movementFamily: "remada-alta", equipment: "halteres" },

  { id: "abdominal-banco-declinado", name: "Abdominal no Banco Declinado", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", movementFamily: "flexao-tronco", equipment: "banco" },
  { id: "abdominal-reto-solo", name: "Abdominal Reto Solo", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", movementFamily: "flexao-tronco", equipment: "solo" },
  { id: "abdominal-prancha-isometrica", name: "Abdominal Prancha Isométrica", primaryMuscle: "abdominal", secondaryMuscles: ["lombar"], pattern: "isolado", movementFamily: "isometria-core", equipment: "solo" },
  { id: "abdominal-infra-paralelas-pernas-estendidas", name: "Abdominal Infra Paralelas com Pernas Estendidas", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", movementFamily: "elevacao-pernas", equipment: "maquina" },
  { id: "abdominal-polia-corda", name: "Abdominal na Polia com Corda", primaryMuscle: "abdominal", secondaryMuscles: [], pattern: "isolado", movementFamily: "flexao-tronco", equipment: "polia" },

  // lombar — o grupo aparecia nos templates Pull e Lower e o catálogo não tinha
  // NENHUM exercício com ele como primário, então a prescrição saía vazia
  { id: "extensao-lombar-banco-45", name: "Extensão Lombar no Banco 45°", primaryMuscle: "lombar", secondaryMuscles: ["gluteo", "posterior_coxa"], pattern: "isolado", movementFamily: "extensao-lombar", equipment: "banco" },
  // Good Morning saiu do catálogo automático. Ele era o único composto de lombar,
  // então a ordenação composto-primeiro o escolhia SEMPRE — e como `lombar` é o
  // último grupo do array do Pull, ele caía depois de puxada, remada e 6 séries
  // de rosca, com os eretores já cozinhados. Barra alta + flexão de quadril
  // carregada + coluna pré-fatigada é a pior relação estímulo/risco do catálogo.
  // Lombar direto agora é só a extensão no banco, que é o movimento seguro.
];

export function exerciseById(id: string): Exercise | undefined {
  return EXERCISE_LIBRARY.find((e) => e.id === id);
}

export function exercisesByMuscle(muscle: MuscleGroup): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.primaryMuscle === muscle);
}

/** Exercícios de um grupo, agrupados por família de movimento — usado pelo seletor pra garantir que
 * dois exercícios do mesmo grupo no mesmo dia sejam padrões diferentes (uma puxada e uma remada, não
 * duas puxadas). */
export function exerciseFamilies(muscle: MuscleGroup): Map<string, Exercise[]> {
  const byFamily = new Map<string, Exercise[]>();
  for (const ex of exercisesByMuscle(muscle)) {
    const list = byFamily.get(ex.movementFamily) ?? [];
    list.push(ex);
    byFamily.set(ex.movementFamily, list);
  }
  return byFamily;
}
