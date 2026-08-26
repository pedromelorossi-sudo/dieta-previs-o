import { MuscleGroup, MUSCLE_GROUP_LABEL, exercisesByMuscle, exerciseById } from "./exerciseLibrary";
import { VOLUME_LANDMARKS, landmarkFor, PESO_INDIRETO } from "./trainingVolume";
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
  /** Quantas séries em CADA dia, por rótulo do dia ("Push", "Upper"…).
   *
   * Existe porque a divisão igual entre os dias do músculo era o que desperdiçava
   * o orçamento. `computeMuscleTargets` calcula fatias assimétricas — o Push tem
   * folga, o Upper não — e antes elas eram descartadas duas vezes: a meta semanal
   * virava `min(fatias) × frequência` e o `buildSplit` redividia igualmente. O
   * peito recebia 4+4 quando o Push comportava 7.
   *
   * Chaveado por RÓTULO e não por índice de propósito: se o template mudar entre
   * o cálculo da meta e a montagem, um índice desalinhado atribuiria a fatia ao
   * dia errado em silêncio, enquanto um rótulo ausente simplesmente cai de volta
   * na divisão igual. */
  perDayByLabel?: Record<string, number>;
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
/* 24, não 22.
 *
 * O número existia como palpite ("~20-25 antes de virar duas horas"), sem
 * intervalo parametrizado — não dava para afirmar duração. Agora `restSeconds`
 * está prescrito (180 s composto, 90 s isolado), então dá para contar: uma
 * sessão típica de 24 séries sai com ~7 exercícios a ~3,4 séries cada, o que dá
 * 75-80 min contando execução, descanso e troca de estação.
 *
 * O que forçou a subida foi o arranjo de 3 dias: o dia de Legs concentra os
 * quatro grupos de perna, cuja soma de MEVs é 8+6+4+6 = 24. Com teto em 22 o
 * PPL de 3 dias era ESTRUTURALMENTE incapaz de entregar o mínimo das pernas —
 * nenhum ajuste de distribuição resolveria, porque não cabia. */
/* 18, não 24.
 *
 * O número anterior foi calibrado por tempo de academia. O programa real do
 * Pedro (10º mesociclo, montado pelo educador físico dele) entrega 14 a 19
 * séries efetivas por sessão — média 16,8 em cinco sessões — e é o que ele
 * executa de fato. 24 era um teto que descrevia uma sessão que ninguém treina.
 *
 * Consequência declarada: o volume semanal cai de ~100 para perto de 84 séries
 * em 5 dias, que é o total do documento. Menos séries com top set à falha e
 * faixa de 5-7 não é menos estímulo — é estímulo por intensidade em vez de por
 * acúmulo, que é a metodologia que o documento descreve. */
const SETS_PER_SESSION_BUDGET = 18;

/* FAIXA DE REPETIÇÕES ÚNICA: 5-7.
 *
 * O app usava 6-10 para composto e 10-15 para isolado. O programa real usa
 * 5-7 em TODOS os exercícios — agachamento livre, crucifixo máquina, elevação
 * lateral, abdominal na polia —, com uma única exceção documentada (supino reto
 * com halteres a 9-11). Não é a faixa "de força": com top set à falha, 5-7 é
 * onde a carga é alta o suficiente para a progressão ser mensurável série a
 * série, que é o que a periodização do app precisa para decidir aumento. */
const REP_RANGE_PADRAO = "5-7";

/** Multiplicador do piso e do alvo de glúteo quando o sexo declarado é
 * feminino: 2×. MEV 4 → 8 e MAV 10 → 20, limitado depois pelo MRV de 18.
 *
 * O 8 de piso é o número que importa: com frequência 2 ele vira 4 séries por
 * dia de perna, que é o mínimo para caberem DOIS exercícios (2+2). Com um
 * exercício só o gerador escolhe o composto — elevação pélvica ou afundo — e o
 * isolado nunca entra. Com 1,5× o piso dava 3 por dia e era exatamente isso que
 * acontecia: 1 isolado na semana inteira. */
const AJUSTE_GLUTEO_FEMININO = 2;
/** Séries de trabalho: 1-2 repetições na reserva. */
const RIR_WORK = 1;
/** Top set: falha dentro da faixa. */
const RIR_TOPSET = 0;

/** Frequência semanal de cada grupo no template de N dias — precisa ser conhecida ANTES de definir a
 * meta, porque um grupo que aparece 1x/semana tem teto físico de
 * (exercícios/dia × séries/exercício) séries, por mais alto que o MAV seja. */
function frequencyByMuscleFor(daysPerWeek: number, priorityMuscles: MuscleGroup[]): Map<MuscleGroup, number> {
  const days = clampDays(daysPerWeek);
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
/** Traduz o sinal de recuperação no ajuste de fadiga da prescrição.
 *
 * Antes, `recoveryScore >= 4` só encolhia o orçamento em 40%. O que a simulação
 * mostrou é que isso resolvia o número e piorava a prática: no cenário de fim de
 * cutting agressivo, o Push virava 100% composto (a elevação lateral, o item
 * mais barato em fadiga sistêmica, era o primeiro a sair), o Levantamento Terra
 * e o Agachamento continuavam a RIR 2, e a pessoa seguia indo 5 dias para ficar
 * abaixo do MEV em 9 de 12 grupos — pagando o custo de deslocamento e sono de
 * cinco sessões para receber menos que o mínimo produtivo.
 *
 * Numa semana dessas o objetivo é MANTER, e manter é MEV com fadiga baixa, não
 * sub-MEV com fadiga alta. */
export function ajusteDeFadigaPara(recoveryScore: number): AjusteDeFadiga {
  if (recoveryScore >= 4) return { rirExtra: 2, semCargaAxialPesada: true };
  if (recoveryScore >= 2) return { rirExtra: 1, semCargaAxialPesada: false };
  return { rirExtra: 0, semCargaAxialPesada: false };
}

/** Dias efetivos de treino: com recuperação ruim, concentrar em menos sessões
 * mantém cada uma acima do mínimo produtivo em vez de espalhar migalhas. */
export function diasEfetivosPara(daysPerWeek: number, recoveryScore: number): number {
  return recoveryScore >= 4 ? Math.min(3, clampDays(daysPerWeek)) : clampDays(daysPerWeek);
}

/* Coeficiente de estímulo INDIRETO entre grupos, derivado do próprio catálogo.
 *
 * Para cada grupo P, que fração dos exercícios de P tem M como secundário. Ex:
 * todas as puxadas e remadas listam bíceps em `secondaryMuscles`, então o
 * coeficiente costas→bíceps fica perto de 1. Multiplicado pela meta de P e pelo
 * `PESO_INDIRETO`, dá quanto estímulo M recebe sem que ninguém prescreva uma
 * série direta para ele.
 *
 * Isso existe porque `secondaryMuscles` estava no modelo desde o começo e só
 * era lido no RELATÓRIO de volume logado, nunca na PRESCRIÇÃO. O efeito
 * prático: um bíceps com 12 séries diretas mais ~14 séries indiretas de
 * puxada já encosta no MRV de 20 — e o algoritmo, sem enxergar isso, tratava
 * "bíceps atrasado" somando mais série direta. Não é ineficaz: é
 * contraproducente, e é onde tendinopatia de cotovelo aparece em natural.
 *
 * O coeficiente é calculado uma vez, não por chamada. */
const COEF_INDIRETO: Map<MuscleGroup, Map<MuscleGroup, number>> = (() => {
  const mapa = new Map<MuscleGroup, Map<MuscleGroup, number>>();
  for (const lm of VOLUME_LANDMARKS) {
    const doGrupo = exercisesByMuscle(lm.muscle);
    if (doGrupo.length === 0) continue;
    const porSecundario = new Map<MuscleGroup, number>();
    for (const ex of doGrupo) {
      for (const sec of ex.secondaryMuscles) {
        porSecundario.set(sec, (porSecundario.get(sec) ?? 0) + 1);
      }
    }
    const fracoes = new Map<MuscleGroup, number>();
    for (const [sec, n] of porSecundario) fracoes.set(sec, n / doGrupo.length);
    mapa.set(lm.muscle, fracoes);
  }
  return mapa;
})();

/** Estimativa de séries indiretas por semana que cada grupo recebe, dadas as
 * metas DIRETAS dos outros. Já ponderada por `PESO_INDIRETO`. */
export function estimarVolumeIndireto(metasDiretas: Map<MuscleGroup, number>): Map<MuscleGroup, number> {
  const indireto = new Map<MuscleGroup, number>();
  for (const [primario, metaP] of metasDiretas) {
    if (metaP <= 0) continue;
    for (const [secundario, fracao] of COEF_INDIRETO.get(primario) ?? []) {
      indireto.set(secundario, (indireto.get(secundario) ?? 0) + metaP * fracao * PESO_INDIRETO);
    }
  }
  return indireto;
}

/** Reparte `total` séries entre os dias, mantendo a proporção que a alocação
 * calculou e fazendo a soma bater EXATAMENTE com o total.
 *
 * Maior resto, e não arredondamento independente: arredondar cada dia por conta
 * própria faz a soma dos dias divergir da meta anunciada — o mesmo vazamento
 * que o `floor` + distribuição de resto já corrigia na divisão igual. */
function distribuirPorDia(total: number, fatias: { label: string; sets: number }[]): Record<string, number> {
  const saida: Record<string, number> = {};
  if (fatias.length === 0 || total <= 0) return saida;

  const soma = fatias.reduce((n, f) => n + f.sets, 0);
  // sem proporção utilizável (tudo zero): cai na divisão igual de sempre
  const exatos =
    soma > 0
      ? fatias.map((f) => ({ label: f.label, exato: (f.sets / soma) * total }))
      : fatias.map((f) => ({ label: f.label, exato: total / fatias.length }));

  let atribuido = 0;
  for (const e of exatos) {
    const piso = Math.floor(e.exato);
    saida[e.label] = piso;
    atribuido += piso;
  }

  const porResto = [...exatos].sort((a, b) => (b.exato % 1) - (a.exato % 1));
  for (let sobra = total - atribuido, i = 0; sobra > 0 && i < porResto.length; sobra--, i++) {
    saida[porResto[i].label] += 1;
  }
  return saida;
}

export function computeMuscleTargets(
  assessment: MuscleAssessmentInput[] = [],
  priorityMuscles: MuscleGroup[] = [],
  adherenceScore = 0,
  daysPerWeek = 3,
  recoveryScore = 0,
  /** `true` quando o chamador JÁ reduziu os dias por recuperação ruim (ver
   * `diasEfetivosPara`). Precisa ser explícito: inferir a partir de
   * `daysPerWeek <= 3` puniria de menos quem genuinamente treina 3 dias e está
   * mal recuperado — a pessoa não concentrou nada, sempre foi 3. */
  diasJaConcentrados = false,
  /** Sexo declarado no questionário. Só muda a meta de GLÚTEO — ver
   * `AJUSTE_GLUTEO_FEMININO`. `null` quando ainda não foi respondido: nesse
   * caso vale o padrão, sem inferir nada. */
  sexo: "masculino" | "feminino" | null = null
): MuscleTarget[] {
  const freqByMuscle = frequencyByMuscleFor(daysPerWeek, priorityMuscles);

  // Corte de orçamento por adesão e por recuperação. Antes, adesão baixa "travava o teto no MAV" — o
  // que era no-op no caminho padrão, porque sem prioridade declarada o alvo já era o MAV.
  const adherenceFactor = adherenceScore >= 1 ? 0.85 : 1;
  /* CORTE ÚNICO, não duplo.
   *
   * Quando `recoveryScore >= 4`, a rota já concentra a semana de 5 para 3
   * sessões (`diasEfetivosPara`). Aplicar TAMBÉM o fator de 0,6 sobre o
   * orçamento por sessão multiplicava os dois cortes: a simulação caía para 32
   * séries semanais, com 11 de 13 grupos abaixo do MEV e nenhum composto de
   * perna na semana inteira. Numa semana de recuperação ruim o objetivo é
   * MANTER, e manter é MEV com fadiga baixa — não sub-MEV com fadiga baixa,
   * que custa músculo justamente quando o natural não tem margem.
   *
   * A concentração de dias JÁ é o corte de volume. O alívio de fadiga vem do
   * RIR e da retirada do axial pesado, que atuam por outro caminho. */
  const recoveryFactor = diasJaConcentrados ? 0.9 : recoveryScore >= 4 ? 0.6 : recoveryScore >= 2 ? 0.8 : 1;
  const budget = Math.round(
    clampDays(daysPerWeek) * SETS_PER_SESSION_BUDGET * adherenceFactor * recoveryFactor
  );

  interface Slot {
    landmark: (typeof VOLUME_LANDMARKS)[number];
    isPriority: boolean;
    isDeclared: boolean;
    assessed?: MuscleAssessmentInput;
    ceiling: number;
    ideal: number;
    sets: number;
    /** séries/semana que este grupo recebe como secundário de outros exercícios */
    indiretoEstimado?: number;
  }

  const slots: Slot[] = VOLUME_LANDMARKS.map((landmarkOriginal) => {
    /* GLÚTEO COM PISO MAIOR QUANDO O SEXO DECLARADO É FEMININO.
     *
     * Elevar só o `ideal` não muda nada: o `ideal` disputa o EXCEDENTE do
     * orçamento e o glúteo perde essa disputa — a meta continuava em 6 séries,
     * atendidas por elevação pélvica e afundo, sem nenhum isolado. Quem decide
     * é o PISO, que é distribuído antes de tudo. Mesma lição que o adutor e o
     * abdominal já tinham dado neste arquivo.
     *
     * MEV 4 → 8 e MAV 10 → 15, ainda abaixo do MRV de 18. Com 8 séries de piso
     * repartidas em 2 dias, cabem 2 exercícios por dia — e aí o isolado entra,
     * porque a regra de uma família por dia impede dois compostos de quadril. */
    const landmark =
      sexo === "feminino" && landmarkOriginal.muscle === "gluteo"
        ? {
            ...landmarkOriginal,
            mev: Math.round(landmarkOriginal.mev * AJUSTE_GLUTEO_FEMININO),
            mav: Math.round(landmarkOriginal.mav * AJUSTE_GLUTEO_FEMININO),
          }
        : landmarkOriginal;
    const isDeclared = priorityMuscles.includes(landmark.muscle);
    const assessed = assessment.find((x) => x.muscle === landmark.muscle && x.confidence !== "baixa");

    /* PONTO FRACO LIDO NA FOTO VIRA PRIORIDADE DE PRIMEIRA CLASSE.
     *
     * Antes, "atrás dos outros" só multiplicava o alvo por 1,15 — e o laço de
     * distribuição abaixo, que ordena por FRAÇÃO do ideal, normalizava de volta
     * exatamente a diferença que o multiplicador tinha criado. Na simulação, um
     * peito lido como "destaque" e um bíceps lido como "atrasado" saíam com o
     * MESMO número de séries (11), e o atrasado terminava mais longe do próprio
     * ideal (79%) que o destaque (92%). O ajuste se invertia.
     *
     * E mesmo funcionando, ±2 séries é a alavanca errada: um grupo atrasado em
     * alguém treinado não fecha com 14 em vez de 12 séries. Fecha com
     * frequência, posição fresca na sessão e cobertura de ângulos — que são
     * exatamente os três mecanismos que o código já tem (`ensurePriorityFrequency`,
     * a ordenação por prioridade em `buildSplit` e `alvoSeriesPorExercicio`) e que
     * estavam todos presos ao `isPriority`. */
    const lidoAtrasado = assessed?.relativeDevelopment === "atras_dos_outros";
    const isPriority = isDeclared || lidoAtrasado;
    const catalogSize = exercisesByMuscle(landmark.muscle).length;
    const freq = freqByMuscle.get(landmark.muscle) ?? 0;
    const maxPerDay = isDeclared || lidoAtrasado ? MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY : MAX_EXERCISES_PER_MUSCLE_PER_DAY;

    /* Teto físico, agora com DOIS limites.
     *
     * O primeiro sempre existiu: não adianta pedir mais séries do que cabem na
     * frequência × exercícios/dia × séries/exercício.
     *
     * O segundo é novo e fecha uma incoerência que a auditoria expôs: a sessão
     * tem teto de `SETS_PER_SESSION_BUDGET` séries, e um dia com 7 grupos não
     * consegue entregar a fatia de todos. Sem este limite, a meta anunciava 44
     * séries e a divisão entregava 38 — o app exibia um alvo que ele mesmo se
     * recusava a cumprir. A capacidade real de um grupo é a fatia que ele tem
     * do orçamento do dia mais cheio em que aparece, vezes a frequência. */
    const ceiling =
      catalogSize === 0 || freq === 0
        ? 0
        : Math.min(landmark.mrv, freq * Math.min(maxPerDay, catalogSize) * MAX_SETS_PER_EXERCISE);

    const adjustment = assessed ? DEVELOPMENT_ADJUSTMENT[assessed.relativeDevelopment] : 1.0;
    /* Prioridade declarada por humano mira o MRV; ponto fraco lido na foto mira
     * 1,25× o MAV — mais que o 1,15 de antes, e ainda abaixo do MRV, porque a
     * foto é um sinal mais fraco que um coach olhando a pessoa. */
    const desiredBase = isDeclared ? landmark.mrv : lidoAtrasado ? landmark.mav * 1.25 : landmark.mav * adjustment;
    /* GLÚTEO RECEBE TRABALHO ISOLADO QUANDO O USUÁRIO É MULHER.
     *
     * Não é ajuste fisiológico: a resposta ao volume não difere por sexo de
     * forma que justifique um multiplicador. É de OBJETIVO — glúteo costuma ser
     * grupo-alvo declarado no público feminino, e o padrão do app (MAV 10,
     * atendido quase todo por agachamento, afundo e elevação pélvica) entrega
     * quadril como subproduto de perna, quase sem isolamento.
     *
     * Fica visível no `reason` do grupo, para a pessoa saber por que a meta
     * dela difere — meta que muda sem explicação é o que o app evita em todo o
     * resto. E vale só com sexo DECLARADO: sem resposta no questionário, o
     * padrão continua valendo, sem inferir. */
    const ideal = Math.min(ceiling, Math.round(desiredBase));

    return { landmark, isPriority, isDeclared, assessed, ceiling, ideal, sets: Math.min(ceiling, landmark.mev) };
  });

  /* ALOCAÇÃO POR DIA, não global.
   *
   * O laço anterior distribuía um orçamento semanal único ordenando por FRAÇÃO
   * do ideal — o que normalizava todo mundo para a mesma fração e apagava a
   * diferença entre um grupo em destaque e um atrasado (achado 4 da auditoria).
   * E como ele ignorava o teto de séries POR SESSÃO, a meta semanal prometia um
   * total que a divisão depois se recusava a entregar (achado 3).
   *
   * Agora o orçamento é o da SESSÃO, e cada dia reparte as suas ~22 séries
   * entre os grupos daquele dia, proporcionalmente ao desejo de cada um e com
   * peso dobrado para prioridade. A meta semanal de um músculo é a soma das
   * fatias que ele recebeu nos dias em que aparece — então meta e entrega
   * batem por construção, e um dia cheio comprime só os grupos daquele dia em
   * vez de contaminar a semana inteira. */
  const templateParaMeta = ensurePriorityFrequency(SPLIT_TEMPLATES[clampDays(daysPerWeek)], priorityMuscles);
  const orcamentoPorSessao = SETS_PER_SESSION_BUDGET * adherenceFactor * recoveryFactor;
  const slotPorMusculo = new Map(slots.map((sl) => [sl.landmark.muscle, sl]));
  for (const sl of slots) sl.sets = 0;

  /* Fatias por dia, guardadas separadamente.
   *
   * A meta não pode ser a SOMA das fatias diárias: `buildSplit` redivide o
   * total semanal IGUALMENTE entre os dias do músculo, e a alocação aqui é
   * assimétrica (o Push tem folga, o Upper não). O peito ganhava 5 no Push e 4
   * no Upper, somava 9, e o `buildSplit` devolvia 4,5 → 5 no Upper, que não
   * cabia — e a entrega ficava abaixo da meta anunciada.
   *
   * A meta usa a fatia do dia MAIS APERTADO vezes a frequência. É conservador
   * de propósito: garante que todo dia consegue entregar o que foi prometido,
   * que é a única forma de meta e entrega baterem por construção. */
  const fatiasPorMusculo = new Map<MuscleGroup, { label: string; sets: number }[]>();

  for (const dia of templateParaMeta) {
    const noDia = dia.muscles.map((m) => slotPorMusculo.get(m)).filter((sl): sl is Slot => !!sl && sl.ceiling > 0);
    if (noDia.length === 0) continue;

    // desejo diário de cada grupo = ideal semanal repartido pela frequência dele
    const desejo = new Map<Slot, number>();
    for (const sl of noDia) {
      const freq = freqByMuscle.get(sl.landmark.muscle) ?? 1;
      desejo.set(sl, sl.ideal / Math.max(1, freq));
    }
    /* O MEV VEM PRIMEIRO. Só o excedente é repartido proporcionalmente.
     *
     * A repartição puramente proporcional ao ideal (=MAV) não distinguia quem
     * tem piso de quem não tem — e grupos com MEV 0 (antebraço, abdominal,
     * lombar) entravam na fila com o mesmo direito de quem estava abaixo do
     * mínimo. No arranjo de 3 dias isso tirava séries do quadríceps e das
     * costas para dar rosca inversa e extensão lombar. Prescrever antebraço
     * enquanto o quadríceps está abaixo do mínimo é uma troca ruim para
     * qualquer fisiculturista: MEV 0 quer dizer "o indireto já basta", não
     * "tem a mesma urgência". */
    const freqDe = (sl: Slot) => Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
    const tetoDoDia = (sl: Slot) =>
      Math.min(MAX_SETS_PER_MUSCLE_PER_SESSION, sl.ceiling / freqDe(sl));

    let disponivel = orcamentoPorSessao;

    // 1ª rodada: o mínimo efetivo de quem tem mínimo
    for (const sl of noDia) {
      if (sl.landmark.mev <= 0) continue;
      const pisoDia = Math.min(sl.landmark.mev / freqDe(sl), tetoDoDia(sl), desejo.get(sl) ?? 0);
      const dar = Math.min(pisoDia, disponivel);
      if (dar <= 0) continue;
      sl.sets += dar;
      disponivel -= dar;
    }

    // 2ª rodada: o que sobra vai proporcional ao que ainda falta para o ideal,
    // com peso dobrado para prioridade. Aqui os grupos de MEV 0 entram.
    const faltaDe = (sl: Slot) => Math.max(0, Math.min(desejo.get(sl) ?? 0, tetoDoDia(sl)) - sl.sets / freqDe(sl));
    const somaPeso = noDia.reduce((n, sl) => n + faltaDe(sl) * (sl.isPriority ? 2 : 1), 0);

    /* Era `continue` aqui, e o `continue` pulava o REGISTRO DA FATIA logo
     * abaixo — não só a segunda rodada. Quando o orçamento do dia acabava já na
     * primeira (arranjo de 1 e 2 dias, onde os pisos de MEV consomem a sessão
     * inteira), o dia inteiro saía sem fatia registrada. Isso passou
     * despercebido enquanto a meta era `min(fatias) × frequência`, porque o
     * piso de MEV depois restaurava o valor; assim que a fatia passou a ser a
     * fonte da meta, o mesmo caminho zerava o quadríceps. */
    if (somaPeso > 0 && disponivel > 0) {
      for (const sl of noDia) {
        const peso = faltaDe(sl) * (sl.isPriority ? 2 : 1);
        if (peso <= 0) continue;
        sl.sets += Math.min(faltaDe(sl), (disponivel * peso) / somaPeso);
      }
    }

    // registra a fatia deste dia (o `sl.sets` acumulado menos o que já havia)
    for (const sl of noDia) {
      const lista = fatiasPorMusculo.get(sl.landmark.muscle) ?? [];
      const jaSomado = lista.reduce((n, v) => n + v.sets, 0);
      lista.push({ label: dia.label, sets: Math.max(0, sl.sets - jaSomado) });
      fatiasPorMusculo.set(sl.landmark.muscle, lista);
    }
  }

  /* A meta é a SOMA das fatias — não mais `min(fatias) × frequência`.
   *
   * O `min` existia porque o `buildSplit` redividia o total igualmente entre os
   * dias do músculo: prometer a soma de uma alocação assimétrica gerava um alvo
   * que o dia apertado não entregava. Achatar tudo pelo dia mais apertado
   * resolvia a coerência e pagava caro por ela — em 6 dias sobravam 39 séries
   * de orçamento sem uso, com 7 grupos abaixo do MAV. Quem treinava 6 dias
   * desperdiçava MAIS orçamento que quem treinava 5.
   *
   * Agora a fatia de cada dia atravessa até a montagem (`perDayByLabel`), então
   * a assimetria é entregue em vez de descartada, e a soma é honesta. O teto
   * por sessão continua sendo aplicado depois, nos dois lados. */
  for (const sl of slots) {
    const fatias = fatiasPorMusculo.get(sl.landmark.muscle) ?? [];
    if (fatias.length === 0) {
      sl.sets = 0;
      continue;
    }
    sl.sets = fatias.reduce((n, f) => n + f.sets, 0);
  }

  /* Arredonda e garante o piso de MEV onde o teto físico permite.
   *
   * Era `Math.round(sets / freq) * freq`, um múltiplo da frequência, porque a
   * divisão igual precisava dividir exato. Com fatia por dia isso deixou de ser
   * necessário — e forçar o múltiplo agora só arredondaria a meta para longe do
   * que as sessões realmente comportam. */
  for (const sl of slots) {
    const alvo = Math.round(sl.sets);
    sl.sets = sl.ceiling === 0 ? 0 : Math.max(Math.min(sl.landmark.mev, sl.ceiling), alvo);
  }

  /* O piso de MEV não pode prometer mais do que as sessões cabem.
   *
   * Com 1 dia/semana, forçar o MEV de todos os grupos elevava a meta a 68
   * séries — e uma sessão só comporta ~22. O app voltaria a exibir um alvo que
   * ele mesmo se recusa a cumprir, que é a incoerência que esta rodada inteira
   * existe para fechar. Quando o piso estoura a capacidade, ele cede: a meta
   * volta ao que cabe, e o `reason` abaixo diz que faltam dias de treino. */
  /* O piso de MEV é verificado POR DIA, não no total da semana — mas cada
   * MÚSCULO só pode ser cortado UMA VEZ, pelo dia mais restritivo em que
   * aparece, nunca uma vez por OCORRÊNCIA do mesmo tipo de dia.
   *
   * Verificar no total escondia o desequilíbrio do template: com 2 dias, o
   * Upper tem 7 grupos e o Lower 4, então a soma semanal cabia em 2×22 = 44
   * enquanto o Upper sozinho pedia 29 para uma sessão de 22. A meta prometia o
   * que só o dia mais cheio se recusaria a entregar.
   *
   * MAS a correção original processava cada `dia` do template SEQUENCIALMENTE
   * e mutava `sl.sets` (o total SEMANAL, compartilhado) a cada iteração. Upper
   * A e Upper B têm o mesmo elenco de músculos e o mesmo orçamento — dois
   * `dia` diferentes — então o corte rodava DUAS VEZES sobre o mesmo total,
   * a segunda vez agindo sobre o resultado já cortado da primeira.
   *
   * Confirmado rodando (varredura de invariantes): 4 dias, prioridade
   * declarada em bíceps, recuperação 2, adesão 1 — bíceps cortado de 6 para 3
   * no Upper A, e cortado DE NOVO no Upper B a partir do 3 já reduzido. A
   * prioridade que o round anterior tinha dado (peso dobrado no excedente)
   * desaparecia na composição dos dois cortes.
   *
   * Agora cada dia calcula seu corte a partir de um SNAPSHOT do valor antes
   * deste bloco (não do valor já mutado por outro dia), e cada músculo fica
   * com o MENOR resultado entre todos os dias em que aparece — o dia mais
   * apertado decide, sem compor cortes. */
  const snapshotPorSlot = new Map<Slot, number>();
  for (const sl of slots) snapshotPorSlot.set(sl, sl.sets);

  const PISO_MINIMO_PRESCRITIVEL = 2;
  const candidatosPorMusculo = new Map<MuscleGroup, number[]>();
  const registrarCandidato = (muscle: MuscleGroup, valorSemanal: number) => {
    const lista = candidatosPorMusculo.get(muscle) ?? [];
    lista.push(valorSemanal);
    candidatosPorMusculo.set(muscle, lista);
  };

  for (const dia of templateParaMeta) {
    const freqDe = (sl: Slot) => Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
    const porDiaOriginal = (sl: Slot) => (snapshotPorSlot.get(sl) ?? 0) / freqDe(sl);

    const noDia = dia.muscles
      .map((m) => slotPorMusculo.get(m))
      .filter((sl): sl is Slot => !!sl && (snapshotPorSlot.get(sl) ?? 0) > 0);
    if (noDia.length === 0) continue;

    const somaDoDia = noDia.reduce((n, sl) => n + porDiaOriginal(sl), 0);

    // este dia não aperta: cada músculo tem o valor original como candidato
    // (se outro dia for mais restritivo, o Math.min no final decide por ele)
    if (somaDoDia <= orcamentoPorSessao) {
      for (const sl of noDia) registrarCandidato(sl.landmark.muscle, snapshotPorSlot.get(sl) ?? 0);
      continue;
    }

    /* NIVELAMENTO A 2 SÉRIES/DIA PRIMEIRO, não corte proporcional cego a
     * partir do MEV.
     *
     * A versão anterior partia direto para "escala tudo pra caber, com o MEV
     * como piso intocável" — mas um corte proporcional cego a partir do MEV
     * ainda podia derrubar um grupo de 3/dia para 1,75/dia (abaixo do piso de
     * prescrição de 2/dia — `pickExercisesForMuscle` não desce disso), sem
     * proteger especificamente essa fronteira. Medido: Upper com 6 grupos,
     * pisos de MEV somando 21 contra orçamento de 12,24 — ombro, deltoide
     * posterior, bíceps e tríceps saíam TODOS zerados, enquanto peito e
     * costas (MEV maior) ficavam com o piso inteiro.
     *
     * Nivelar a 2 primeiro gasta o orçamento em COBERTURA (todo grupo
     * aparece) antes de gastar em PROFUNDIDADE (um grupo perto do ideal). */
    const nivelamento = new Map<Slot, number>();
    for (const sl of noDia) nivelamento.set(sl, Math.min(porDiaOriginal(sl), PISO_MINIMO_PRESCRITIVEL));
    const somaNivelamento = [...nivelamento.values()].reduce((n, v) => n + v, 0);
    const escalaNivelamento =
      somaNivelamento > orcamentoPorSessao && somaNivelamento > 0 ? orcamentoPorSessao / somaNivelamento : 1;

    const resultadoDoDia = new Map<Slot, number>();
    let usado = 0;
    for (const sl of noDia) {
      const v = nivelamento.get(sl)! * escalaNivelamento;
      resultadoDoDia.set(sl, v);
      usado += v;
    }

    /* O que sobra do orçamento vai, proporcional, em direção ao valor
     * ORIGINAL de cada músculo — não ao MEV. O valor original já reflete a
     * prioridade (peso dobrado no excedente, calculado antes deste bloco);
     * mirar nele em vez do MEV é o que propaga a prioridade para dentro de um
     * dia apertado, em vez de descartá-la. */
    const sobra = orcamentoPorSessao - usado;
    if (sobra > 0) {
      const faltaParaOriginal = new Map<Slot, number>();
      for (const sl of noDia) {
        const falta = Math.max(0, porDiaOriginal(sl) - resultadoDoDia.get(sl)!);
        if (falta > 0) faltaParaOriginal.set(sl, falta);
      }
      const somaFalta = [...faltaParaOriginal.values()].reduce((n, v) => n + v, 0);
      if (somaFalta > 0) {
        const escalaFalta = Math.min(1, sobra / somaFalta);
        for (const [sl, falta] of faltaParaOriginal) {
          resultadoDoDia.set(sl, resultadoDoDia.get(sl)! + falta * escalaFalta);
        }
      }
    }

    for (const [sl, v] of resultadoDoDia) registrarCandidato(sl.landmark.muscle, Math.round(v * freqDe(sl)));
  }

  for (const sl of slots) {
    const candidatos = candidatosPorMusculo.get(sl.landmark.muscle);
    if (candidatos && candidatos.length > 0) sl.sets = Math.min(...candidatos);
  }

  /* TETO CORRIGIDO PELO ESTÍMULO INDIRETO.
   *
   * Duas passadas, porque o cálculo é circular: o indireto depende das metas, e
   * as metas do indireto. A primeira passada acima já produziu metas diretas
   * plausíveis; aqui elas servem de base para estimar o indireto e, com ele,
   * baixar o teto de quem já está saturado. É aproximação declarada, não
   * medição — mesma classe de premissa do resto do arquivo.
   *
   * A regra: `direto + indireto <= MRV`. O piso continua sendo o MEV, porque
   * estímulo indireto não substitui trabalho direto por completo (amplitude e
   * tensão menores no secundário — é o próprio motivo de `PESO_INDIRETO` ser
   * 0,5 e não 1,0). Um grupo saturado indiretamente NÃO recebe mais série
   * direta; recebe exercício e posição diferentes, que é o que a prioridade já
   * faz por outro caminho. */
  const indiretoEstimado = estimarVolumeIndireto(new Map(slots.map((sl) => [sl.landmark.muscle, sl.sets])));
  for (const sl of slots) {
    if (sl.sets <= 0) continue;
    const indireto = indiretoEstimado.get(sl.landmark.muscle) ?? 0;
    const tetoCorrigido = Math.max(Math.min(sl.landmark.mev, sl.ceiling), Math.round(sl.landmark.mrv - indireto));
    sl.indiretoEstimado = Math.round(indireto * 10) / 10;
    sl.sets = Math.min(sl.sets, tetoCorrigido);
  }

  /* Meta abaixo do piso de prescrição vira zero.
   *
   * `pickExercisesForMuscle` não prescreve exercício com menos de 2 séries —
   * série solta é ruído. Então uma meta de 1 série é um número que a divisão
   * nunca vai entregar, e exibi-lo recria a divergência meta × entrega numa
   * escala menor. Zerar é mais honesto: o `reason` diz que o grupo não coube
   * nesse número de dias. */
  const freqPorMusculo = freqByMuscle;
  /* O QUE A ZERAGEM LIBERA VOLTA PARA A MESA.
   *
   * Antes, zerar um grupo simplesmente descartava as séries dele. Medido numa
   * varredura de 5.170 casos: no arranjo de 4 dias com recuperação ruim e
   * adesão baixa, o orçamento era de 49 séries, a entrega ficava em 28 — 21
   * séries jogadas fora — e SEIS grupos saíam zerados (ombro, deltoide
   * posterior, bíceps, tríceps, glúteo, adutor). O braço e o ombro inteiros
   * desapareciam da semana enquanto 43% do orçamento não era usado.
   *
   * Não era falta de capacidade: o mesmo arranjo com 3 dias e recuperação
   * PÉSSIMA entregava 30 de 32 sem zerar ninguém. Era a zeragem sangrando
   * orçamento em silêncio.
   *
   * A política continua a mesma — é melhor cobrir menos grupos direito do que
   * todos abaixo do mínimo. O que muda é que o excedente liberado vai para quem
   * ainda está abaixo do MEV, na ordem de quem está mais longe dele. */
  let liberadoPelaZeragem = 0;
  for (const sl of slots) {
    const porDia = sl.sets / Math.max(1, freqPorMusculo.get(sl.landmark.muscle) ?? 1);
    if (porDia < 2 && sl.sets > 0) liberadoPelaZeragem += sl.sets;
    if (porDia < 2) sl.sets = 0;
  }

  /* Redistribui o que a zeragem liberou.
   *
   * Vai primeiro para quem está proporcionalmente MAIS LONGE do próprio ideal —
   * não para quem tem o maior número absoluto. Em múltiplos da frequência,
   * porque sobra que não divide pelos dias do grupo não vira série na montagem
   * e voltaria a ser desperdício por outro caminho. */
  if (liberadoPelaZeragem > 0) {
    const candidatos = slots
      .filter((sl) => sl.sets > 0 && sl.sets < Math.min(sl.ideal, sl.ceiling))
      .sort((a, b) => a.sets / Math.max(1, a.ideal) - b.sets / Math.max(1, b.ideal));
    for (const sl of candidatos) {
      if (liberadoPelaZeragem < 1) break;
      const freq = Math.max(1, freqPorMusculo.get(sl.landmark.muscle) ?? 1);
      const espaco = Math.min(sl.ideal, sl.ceiling) - sl.sets;
      const emMultiplos = Math.floor(Math.min(espaco, liberadoPelaZeragem) / freq) * freq;
      if (emMultiplos <= 0) continue;
      sl.sets += emMultiplos;
      liberadoPelaZeragem -= emMultiplos;
    }
  }

  const budgetNote =
    adherenceFactor < 1 || recoveryFactor < 1
      ? ` Orçamento semanal reduzido${adherenceFactor < 1 ? " por adesão baixa no ciclo anterior" : ""}${
          recoveryFactor < 1 ? `${adherenceFactor < 1 ? " e" : ""} por sinais de recuperação ruim` : ""
        } — o ajuste é no volume total, não em um grupo isolado.`
      : "";

  /* RECONCILIAÇÃO FINAL: nenhum dia promete mais do que cabe nele.
   *
   * Esta passada existe para preservar a propriedade que o antigo
   * `min(fatias) × frequência` garantia de graça — meta e entrega batendo por
   * construção — sem pagar o preço dele, que era achatar todos os dias pelo
   * mais apertado e desperdiçar o orçamento dos outros.
   *
   * É necessária porque as etapas entre o cálculo das fatias e aqui (piso de
   * MEV, teto corrigido pelo indireto, zeragem abaixo de 2/dia) mexem no total
   * semanal sem saber como ele se reparte pelos dias. Sem reconciliar, o
   * arranjo de 2 dias prometia 50 séries e entregava 46: o piso de MEV de sete
   * grupos no Upper somava mais do que uma sessão de 24 comporta.
   *
   * A meta passa a ser a SOMA das fatias já ajustadas — o número anunciado é o
   * número que as sessões conseguem entregar. */
  const fatiaFinalPorMusculo = new Map<MuscleGroup, Record<string, number>>();
  for (const sl of slots) {
    let fatias = fatiasPorMusculo.get(sl.landmark.muscle) ?? [];
    /* Sem fatia registrada, mas com meta: o grupo recebeu o piso de MEV depois
       da alocação, ou o dia dele estourou o orçamento antes de chegar nele.
       Divide igual pelos dias do template em vez de zerar — zerar aqui apagaria
       justamente o piso de MEV que a etapa anterior acabou de garantir. */
    if (fatias.length === 0) {
      fatias = templateParaMeta
        .filter((d) => d.muscles.includes(sl.landmark.muscle))
        .map((d) => ({ label: d.label, sets: 1 }));
    }
    /* Ombro reparte IGUAL entre os dias, não proporcional.
     *
     * O par fixo exige no mínimo 2+2 séries no dia para caber. A repartição
     * assimétrica dava 5 no Push e 3 no Upper, e com 3 séries só cabe um
     * exercício — o Upper ficava com metade do par. Peso igual devolve 4+4,
     * que é o arranjo pedido. */
    if (sl.landmark.muscle === "ombro") {
      fatias = fatias.map((f) => ({ label: f.label, sets: 1 }));
    }
    fatiaFinalPorMusculo.set(sl.landmark.muscle, distribuirPorDia(sl.sets, fatias));
  }

  for (const dia of templateParaMeta) {
    const noDia = dia.muscles
      .map((m) => ({ muscle: m, fatia: fatiaFinalPorMusculo.get(m) }))
      .filter((e): e is { muscle: MuscleGroup; fatia: Record<string, number> } => !!e.fatia && e.fatia[dia.label] > 0);

    let soma = noDia.reduce((n, e) => n + e.fatia[dia.label], 0);
    if (soma <= orcamentoPorSessao) continue;

    /* Corta do MAIOR primeiro, uma série por vez — enquanto alguém está ACIMA
     * do piso de prescrição. É o corte que menos desequilibra: tirar
     * proporcionalmente de todos pode derrubar um grupo pequeno para 1 série,
     * que a montagem não prescreve e vira zero.
     *
     * O bug estava no que acontecia DEPOIS de todo mundo já estar EXATAMENTE
     * no piso (2, empatados): o código caía no segundo `find` — "alguém com
     * fatia > 0" — que, com tudo empatado, pega o primeiro do array ORDENADO,
     * cujo desempate é a ORDEM ORIGINAL do template. Cortava 1 de cada um dos
     * primeiros grupos do array até o orçamento fechar — e um corte de 2→1
     * cruza o piso sem proteção nenhuma: a montagem descarta esse grupo por
     * inteiro, e a série "1" que sobrou nunca foi usada por ninguém.
     *
     * Medido: 1 dia, 11 grupos empatados em 2 (soma 22, orçamento 18) — os 4
     * primeiros do array (peito, costas, ombro, deltoide posterior) cortados
     * para 1 e descartados pela montagem, SEM ligação com prioridade ou MEV,
     * só com a posição no array.
     *
     * Quando ninguém mais está acima do piso, a escolha certa não é espalhar
     * o corte em pedaços que viram lixo — é tirar um grupo INTEIRO da lista
     * (fatia 0), para os que sobram manterem o piso de verdade. Sai o de MENOR
     * MEV: quem tem menos necessidade fisiológica de volume direto. */
    const ordenado = [...noDia].sort((a, b) => b.fatia[dia.label] - a.fatia[dia.label]);
    while (soma > orcamentoPorSessao) {
      const acimaDoPiso = ordenado.find((e) => e.fatia[dia.label] > PISO_MINIMO_PRESCRITIVEL);
      if (acimaDoPiso) {
        acimaDoPiso.fatia[dia.label] -= 1;
        soma -= 1;
        ordenado.sort((a, b) => b.fatia[dia.label] - a.fatia[dia.label]);
        continue;
      }
      /* Prioridade declarada protege do descarte: entre os candidatos, primeiro
       * tenta achar um SEM prioridade para sacrificar; só desce para um
       * prioritário se todos os que sobraram forem prioritários (aí não tem
       * como preservar todos, e o de menor MEV cede). Sem isso, um grupo
       * priorizado com MEV baixo (glúteo, adutor) podia ser o primeiro
       * descartado nesta última rodada — a prioridade valia nas rodadas
       * anteriores e desaparecia bem aqui, no fim. */
      const candidatosNoPiso = noDia.filter((e) => e.fatia[dia.label] > 0);
      if (candidatosNoPiso.length === 0) break;
      const semPrioridade = candidatosNoPiso.filter((e) => !slotPorMusculo.get(e.muscle)?.isPriority);
      const pool = semPrioridade.length > 0 ? semPrioridade : candidatosNoPiso;
      const menorMev = pool.reduce((menor, e) =>
        (landmarkFor(e.muscle)?.mev ?? 0) < (landmarkFor(menor.muscle)?.mev ?? 0) ? e : menor
      );
      soma -= menorMev.fatia[dia.label];
      menorMev.fatia[dia.label] = 0;
    }
  }

  // a meta semanal passa a ser a soma das fatias reconciliadas
  for (const sl of slots) {
    const fatia = fatiaFinalPorMusculo.get(sl.landmark.muscle) ?? {};
    sl.sets = Object.values(fatia).reduce((n, v) => n + v, 0);
  }

  return slots.map((sl) => {
    const muscleLabel = MUSCLE_GROUP_LABEL[sl.landmark.muscle];
    const freq = freqByMuscle.get(sl.landmark.muscle) ?? 0;

    let reason: string;
    if (sl.landmark.muscle === "gluteo" && sexo === "feminino") {
      reason = `${sl.sets} séries/semana, o dobro do piso padrão — com trabalho ISOLADO de quadril (abdução, coice, extensão na máquina) e não só agachamento, afundo e elevação pélvica. O ajuste vale porque o sexo declarado é feminino e glúteo costuma ser grupo-alvo; a meta continua abaixo do teto recuperável (MRV ${sl.landmark.mrv}).${budgetNote}`;
    } else if (sl.landmark.muscle === "abdominal") {
      /* Meta zero aqui NÃO quer dizer "não treina" — quer dizer "não entra na
         contabilidade". O bloco fixo é anexado em `adicionarAbdominal`, depois
         que as sessões estão montadas. Sem esta frase, a tela mostraria
         abdominal com 0 séries ao lado da mensagem genérica de grupo que não
         cabe na divisão, que descreveria errado o que está acontecendo. */
      reason = `Fora da contabilidade de volume, por decisão de projeto. Prescrito como bloco fixo — ${ABDOMINAL_SESSOES_POR_SEMANA} sessões por semana de ${ABDOMINAL_SERIES}×${ABDOMINAL_REPS} — que não disputa o orçamento de séries com os outros grupos.`;
    } else if (sl.ceiling === 0) {
      reason =
        exercisesByMuscle(sl.landmark.muscle).length === 0
          ? `Sem exercício desse grupo no catálogo — o estímulo vem indireto de outros movimentos (ex: lombar em stiff, terra e agachamento). Meta direta zerada de propósito, em vez de exibir um alvo que nenhuma sessão pode cumprir.`
          : `Grupo não aparece na divisão de ${daysPerWeek} dias — meta zerada em vez de prometer volume que a divisão não entrega.`;
    } else if (sl.isPriority && !sl.isDeclared) {
      reason = `Lido nas fotos como atrás dos outros — tratado como ponto fraco: ${sl.sets} séries/semana, entrada primeiro na sessão, frequência extra e volume espalhado em mais exercícios (mais ângulos, não mais séries do mesmo movimento).${budgetNote}`;
    } else if (sl.isPriority) {
      reason = `Prioridade declarada (consultoria) — ${sl.sets} séries/semana, com peso dobrado na disputa pelo orçamento e entrada primeiro na sessão.${
        sl.sets < sl.landmark.mrv ? ` Abaixo do MRV (${sl.landmark.mrv}) porque ${sl.sets >= sl.ceiling ? `a frequência de ${freq}x/semana tem teto de ${sl.ceiling} séries` : "o orçamento semanal não comporta mais"}.` : ""
      }${budgetNote}`;
    } else if ((sl.indiretoEstimado ?? 0) > 0 && sl.sets + (sl.indiretoEstimado ?? 0) >= sl.landmark.mrv - 0.5) {
      reason = `${sl.sets} séries diretas/semana. O grupo ainda recebe ~${sl.indiretoEstimado} séries indiretas de outros exercícios (contadas a meio peso), o que soma perto do teto recuperável de ${sl.landmark.mrv}. Somar série direta aqui não acelera nada — o que fecha diferença neste ponto é trocar exercício e posição na sessão, não volume.${budgetNote}`;
    } else if (sl.sets >= sl.landmark.mav) {
      reason = `Meta no MAV (${sl.landmark.mav} séries/semana) — melhor custo-benefício da dose-resposta volume→hipertrofia.${budgetNote}`;
    } else if (sl.assessed && sl.assessed.relativeDevelopment !== "proporcional") {
      reason = `Leitura visual marcou como "${sl.assessed.relativeDevelopment === "atras_dos_outros" ? "atrás dos outros" : "destaque"}" — ${sl.sets} séries/semana dentro do orçamento de ${daysPerWeek} dias.${budgetNote}`;
    } else {
      reason = `${sl.sets} séries/semana: perto do mínimo produtivo (MEV ${sl.landmark.mev}), porque ${daysPerWeek} dias/semana dão um orçamento de ~${budget} séries e ele não cobre o MAV de todos os grupos. Mirar MAV em tudo exige mais dias de treino, não uma meta maior no papel.${budgetNote}`;
    }

    /* Não anuncia prioridade que o orçamento não financia. Numa semana de
     * recuperação ruim, exibir "★ prioridade" num grupo abaixo do MEV
     * desinforma: a prioridade está suspensa, não em vigor. */
    const prioridadeEmVigor = sl.isPriority && sl.sets >= sl.landmark.mev;
    const perDayByLabel = fatiaFinalPorMusculo.get(sl.landmark.muscle) ?? {};
    return {
      muscle: sl.landmark.muscle,
      muscleLabel,
      weeklySets: sl.sets,
      reason,
      isPriority: prioridadeEmVigor || undefined,
      perDayByLabel,
    };
  });
}

interface SplitDayTemplate {
  label: string;
  muscles: MuscleGroup[];
}

/* Templates por dias/semana — modelo PUSH / PULL / LEGS / UPPER / LOWER.
 *
 * Substituiu a divisão anterior, que nomeava os dias por grupamento ("Peito/
 * Ombro/Tríceps", "Costas/Bíceps"). Nomear por grupamento tem dois problemas:
 * o dia não diz o PADRÃO de movimento que a pessoa vai executar, e a lista de
 * grupos vira um convite a esquecer algum. Push/Pull/Legs particiona por padrão
 * (empurrar, puxar, perna) e não deixa buraco: todo músculo do tronco pertence
 * a exatamente um dos dois padrões.
 *
 * A escada por dias disponíveis:
 *   1 → Corpo inteiro
 *   2 → Upper / Lower
 *   3 → Push / Pull / Legs
 *   4 → Upper / Lower / Push / Pull   (perna coberta pelo Lower + acessório)
 *   5 → Push / Pull / Legs / Upper / Lower   ← o pedido, e o arranjo clássico
 *   6 → Push / Pull / Legs ×2
 *
 * Frequência por si não muda hipertrofia com volume equalizado (Schoenfeld,
 * Grgic & Krieger 2018, DOI 10.1080/02640414.2018.1555906) — o que importa é
 * encaixar o volume-alvo de cada grupo em sessões de tamanho treinável. Por
 * isso a escolha do template é sobre PARTICIONAMENTO, não sobre estímulo.
 *
 * `assertCoberturaSemanal` abaixo garante em teste que todo template cobre
 * todos os grupos que têm MEV > 0 — a regra que o usuário pediu explicitamente
 * ("um treino completo que contemple todos os grupos ao final da semana").
 */
const SPLIT_TEMPLATES: Record<number, SplitDayTemplate[]> = {
  1: [
    {
      label: "Corpo inteiro",
      muscles: [
        "peito",
        "costas",
        "ombro",
        "deltoide_posterior",
        "biceps",
        "triceps",
        "quadriceps",
        "posterior_coxa",
        "gluteo",
        "adutor",
        "panturrilha",
      ],
    },
  ],
  2: [
    {
      label: "Upper",
      muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps"],
    },
    {
      label: "Lower",
      muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha", "lombar"],
    },
  ],
  3: [
    { label: "Push", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull", muscles: ["costas", "deltoide_posterior", "biceps", "lombar"] },
    { label: "Legs", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
  ],
  4: [
    // Upper/Lower ×2. O arranjo anterior (Upper/Lower/Push/Pull) deixava PERNA
    // 1×/semana enquanto o tronco ficava 2× — desequilíbrio que o comentário
    // antigo disfarçava com "perna coberta pelo Lower + acessório", e acessório
    // nenhum existia no código.
    { label: "Upper A", muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps"] },
    { label: "Lower A", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
    { label: "Upper B", muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps"] },
    { label: "Lower B", muscles: ["posterior_coxa", "quadriceps", "gluteo", "adutor", "panturrilha", "lombar"] },
  ],
  5: [
    // O arranjo pedido: PPL cobrindo a semana inteira uma vez, e Upper/Lower
    // devolvendo a segunda exposição semanal a todo mundo. Nenhum grupo fica
    // com frequência 1 — que é o que sustenta metas perto do MAV/MRV.
    { label: "Push", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull", muscles: ["costas", "deltoide_posterior", "biceps", "lombar"] },
    { label: "Legs", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
    /* Upper e Lower do arranjo de 5 dias são SUPLEMENTARES: devolvem a segunda
     * exposição semanal, não repetem o dia inteiro. O Upper carregava 7 grupos
     * contra 3 do Push, e com o teto de ~22 séries por sessão os pisos de MEV
     * consumiam a sessão inteira — sobrava ~1 série de folga para diferenciar
     * ponto fraco de grupo em destaque, o que recriava o achado 4 por outro
     * caminho. Tríceps saiu daqui (recebe volume indireto de todo o Push) e
     * abdominal também (já está no Lower). Cinco grupos em cada um. */
    /* Tríceps aqui, bíceps não. Enxugar o Upper de 7 para 5 grupos derrubou
     * tríceps e abdominal para 1×/semana, e 7-8 séries de tríceps numa sessão
     * só, sempre depois de peito e ombro, é pior que 2× menores. A troca é
     * possível porque o bíceps recebe estímulo indireto das 5 séries de puxada
     * do próprio Upper, e o tríceps não recebe nada aqui — o Push dele fica
     * longe. Quando o bíceps for ponto fraco, `ensurePriorityFrequency`
     * devolve a segunda exposição a ele automaticamente. */
    { label: "Upper", muscles: ["peito", "costas", "ombro", "deltoide_posterior", "triceps"] },
    { label: "Lower", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
  ],
  6: [
    { label: "Push A", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull A", muscles: ["costas", "deltoide_posterior", "biceps"] },
    { label: "Legs A", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
    { label: "Push B", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull B", muscles: ["costas", "deltoide_posterior", "biceps", "lombar"] },
    { label: "Legs B", muscles: ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"] },
  ],
};

/** Grupos que TÊM de aparecer na semana, em qualquer template: todos os que o
 * `VOLUME_LANDMARKS` marca com MEV > 0. Os de MEV 0 (antebraço, abdominal,
 * lombar) recebem estímulo indireto suficiente e são opcionais por definição.
 * Exportado para o teste travar a regra. */
export function musclesCoveredBy(daysPerWeek: number): MuscleGroup[] {
  const template = SPLIT_TEMPLATES[clampDays(daysPerWeek)];
  return [...new Set(template.flatMap((d) => d.muscles))];
}

function clampDays(daysPerWeek: number): number {
  return Math.max(1, Math.min(6, Math.round(daysPerWeek)));
}

// tetos pra manter a sessão gerada dentro do que uma pessoa consegue treinar de verdade num dia — sem
// isso, um grupo com poucos exercícios no catálogo (ex: glúteo, só 1 opção) acabava recebendo todas as
// séries da meta semanal empilhadas num exercício só (10+ séries seguidas), e um dia com vários grupos
// virava uma sessão de 15+ exercícios. Nenhum dos dois é um treino real. Grupo prioritário ganha 1
// exercício a mais de teto — meta maior (MRV) precisa de mais variedade pra caber sem virar 1 exercício
// gigante.
/* Famílias de movimento que carregam a coluna sob flexão de quadril com barra.
 * O modelo só contava o músculo PRIMÁRIO, então a simulação produzia 15 séries
 * de hinge com barra a RIR 2 numa semana — Good Morning no Pull, Stiff no Legs,
 * Levantamento Terra no Lower — enquanto exibia "meta de lombar: 5 séries" com
 * cara de controle. Eretor e tecido conjuntivo do quadril recuperam mais devagar
 * que músculo apendicular e não avisam antes de falhar: é a lesão que tira 8-12
 * semanas de um natural, e 2 séries a mais de posterior não pagam esse risco. */
const FAMILIAS_AXIAIS = new Set(["quadril-dominante", "quadril-dominante-barra", "agachamento"]);
const MAX_EXERCICIOS_AXIAIS_PESADOS_POR_SEMANA = 2;
/* ...e no máximo UM por sessão. O teto só semanal permitia gastar os dois no
 * mesmo dia: a simulação produziu Stiff 3× seguido de Levantamento Terra 2×
 * na mesma sessão de perna, o segundo com isquiotibiais e eretores já
 * fatigados. Dois hinges pesados num dia é pior que dois em dias separados. */
const MAX_AXIAIS_PESADOS_POR_SESSAO = 1;

/* Teto de séries por GRUPO por sessão.
 *
 * Sem ele, um grupo que aparece 1×/semana (caso do tríceps no arranjo de 3
 * dias) recebia a meta semanal inteira num dia só — 10 séries espremidas em 2
 * exercícios, virando dois blocos de 5×. A curva dose-resposta que sustenta o
 * MEV/MAV/MRV é SEMANAL; empilhar a semana toda numa sessão não entrega o mesmo
 * estímulo, porque as últimas séries são limitadas por fadiga local. Passando
 * daqui, o excedente simplesmente não é prescrito e o `reason` aponta o que
 * resolve de verdade: mais dias de treino. */
const MAX_SETS_PER_MUSCLE_PER_SESSION = 8;

/* Quatro, não cinco. Consolidar as séries em menos exercícios (para a sessão não
 * virar dez estações) reintroduziu blocos de 5× — e cinco séries seguidas do
 * mesmo movimento a RIR 1 são limitadas por fadiga local, não por estímulo. Com
 * o teto em 4 as duas coisas convivem: sessão enxuta E bloco treinável. */
/* 3 séries efetivas por exercício = 2 work + 1 top set.
 *
 * É o padrão do programa real: de 29 blocos no documento, 24 são exatamente
 * 2 work + 1 top. Os poucos com 4 são exceção pontual (crucifixo máquina no
 * dia de superiores), e os com 2 são o primeiro exercício da sessão, que
 * cede uma série para o warm-up.
 *
 * Era 4, e o efeito colateral aparecia na tela: blocos de "3×5-7 + top" viram
 * 4 séries válidas do mesmo movimento, que é acúmulo — o oposto da lógica de
 * intensidade que o top set à falha implementa. */
const MAX_SETS_PER_EXERCISE = 3;
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
  loadByExercise?: Map<string, number>,
  familiasDaSemana?: Set<string>,
  exerciciosDaSemana?: Set<string>,
  axiaisNaSemana?: { n: number },
  axiaisNaSessao?: { n: number },
  familiasAquecidasNaSessao?: Set<string>,
  fadiga: AjusteDeFadiga = { rirExtra: 0, semCargaAxialPesada: false }
): TrainingItem[] {
  const candidates = exercisesByMuscle(muscle);
  if (candidates.length === 0 || setsNeeded <= 0) return [];

  const maxExercises = isPriority ? MAX_EXERCISES_PER_PRIORITY_MUSCLE_PER_DAY : MAX_EXERCISES_PER_MUSCLE_PER_DAY;

  /* SELEÇÃO POR FUNÇÃO: 1 COMPOSTO + N ISOLADOS (achado 9 da auditoria).
   *
   * A ordenação anterior era "compostos primeiro" e o número de exercícios saía
   * de `ceil(séries / 5)` — quase sempre 2. Resultado: peito ganhava sempre
   * Supino Inclinado + Supino Reto, e Crucifixo, Crucifixo Inclinado e Crossover
   * NUNCA eram escolhidos. Em nenhum cenário, em nenhuma das 5 semanas. Um
   * programa de fisiculturismo sem uma única crucifixo. O mesmo acontecia com
   * Cadeira Extensora, Cadeira Flexora e Extensão Lombar — de 51 exercícios
   * catalogados o gerador usava ~20, e o corte era enviesado exatamente contra
   * o trabalho de isolamento, que é o que compra hipertrofia regional e tem a
   * melhor relação estímulo/fadiga.
   *
   * Agora: o primeiro slot é composto (pessoa fresca, mais retorno por série) e
   * os demais são isolados de famílias diferentes. */
  const compostos = candidates.filter((e) => e.pattern === "composto");
  const isolados = candidates.filter((e) => e.pattern === "isolado");

  const giraLista = <T,>(lista: T[], n: number) =>
    lista.length === 0 ? lista : [...lista.slice(n % lista.length), ...lista.slice(0, n % lista.length)];

  /* INTERCALADO composto → isolado → composto → isolado…
   *
   * A primeira tentativa foi "só 1 composto, o resto isolado". Isso corrigiu o
   * viés contra isolamento mas quebrou as costas: sobrava uma puxada vertical
   * e nenhuma remada, porque o 2º slot virava isolado obrigatoriamente. Um
   * teste que já existia pegou (`o dia de costas tem remada, não só puxada`).
   *
   * Intercalar preserva as duas coisas: o composto abre a sessão do grupo, o
   * isolado entra em seguida (o que antes nunca acontecia), e um 2º composto de
   * outra família ainda cabe no 3º slot quando o volume justifica. */
  const c = giraLista(compostos, rotation);
  const iso = giraLista(isolados, rotation);
  const rotated: typeof candidates = [];
  for (let k = 0; k < Math.max(c.length, iso.length); k++) {
    if (c[k]) rotated.push(c[k]);
    if (iso[k]) rotated.push(iso[k]);
  }

  /* Ponto fraco espalha o MESMO volume por MAIS exercícios, em vez de empilhar
   * séries em poucos. O gargalo aqui era `ceil(séries / 5)`: com ele, o teto
   * maior de exercícios do grupo prioritário nunca chegava a valer, e priorizar
   * um grupo só engordava as séries dos mesmos 2 exercícios. Baixar o alvo de
   * séries por exercício é o que efetivamente acrescenta movimento novo.
   *
   * O porquê fisiológico: um grupo atrasado se beneficia de cobrir mais ângulos
   * e mais regiões do músculo, não de repetir o mesmo padrão com mais séries —
   * hipertrofia tem componente regional, e o catálogo já separa por
   * `movementFamily`, que a seleção abaixo usa para não repetir família. */
  /* 3 séries por exercício para TODO MUNDO, não só para prioridade (achado 13).
   * Com o alvo em 5, o gerador empilhava até 5 séries antes de acrescentar
   * movimento: "Tríceps na Polia 5×10-15 RIR1", "Panturrilha 5×10-15 RIR1".
   * As séries 4 e 5 de um isolado a RIR 1 são limitadas por fadiga local, não
   * por estímulo. Três é o valor que o próprio comentário da prioridade já
   * defendia — não havia razão para o resto ficar em cinco. */
  const alvoSeriesPorExercicio = 3;
  /* CONSOLIDA quem não é ponto fraco, ESPALHA quem é.
   *
   * Com `ceil` para todos, um grupo com 4 séries no dia virava dois exercícios
   * de 2 — e uma sessão com 5 grupos saía com 9-10 estações para 21 séries,
   * 2,3 por exercício. Tempo de montagem e deslocamento dominava o treino, e
   * duas séries de um movimento não constroem quase nada.
   *
   * `floor` consolida: 4 séries viram um exercício de 4, 6 viram dois de 3. O
   * ponto fraco continua no `ceil`, porque para ele mais ângulos É o objetivo —
   * é a mesma assimetria que faz a prioridade valer alguma coisa. */
  /* OMBRO É PAR FIXO: elevação lateral com halteres + elevação lateral na polia,
   * as duas em TODO dia em que o ombro aparece (Push e Upper).
   *
   * Por decisão do Pedro, e ele autorizou repetir exercício na semana — que era
   * o que impedia o arranjo: a regra de variedade semanal reservava o segundo
   * exercício para o outro dia, e cada dia acabava com um só.
   *
   * Fica como exceção declarada em vez de emergir da divisão de séries porque é
   * uma escolha de prescrição, não um resultado do cálculo: com 3 séries no dia,
   * `ceil(3/4)` daria 1 exercício e o par não aconteceria. */
  const numExercises = Math.max(
    // piso: o par fixo de ombro acontece mesmo quando a divisão de séries pediria 1
    muscle === "ombro" ? Math.min(2, rotated.length, Math.floor(setsNeeded / 2)) : 1,
    Math.min(
      rotated.length,
      maxExercises,
      /* Ponto fraco divide por 3 (mais exercícios, mais ângulos); o resto
       * divide por 4 (menos estações, blocos maiores). `ceil` nos dois, senão
       * um grupo com 5 séries no dia caía num bloco único de 5. */
      isPriority
        ? Math.ceil(setsNeeded / alvoSeriesPorExercicio)
        : Math.ceil(setsNeeded / MAX_SETS_PER_EXERCISE)
    )
  );

  // Diversidade de padrão: escolhe no máximo um exercício por família de movimento antes de aceitar um
  // segundo da mesma família. Sem isso a ordenação "compostos primeiro" produzia Supino Inclinado 15° +
  // Supino Inclinado 30° no peito, e duas puxadas verticais sem nenhuma remada nas costas.
  const chosen: typeof rotated = [];
  const usedFamilies = new Set<string>();

  /* Quando o grupo leva UM exercício só no dia, ele tem de ser composto.
   *
   * O filtro de família da semana bloqueava `supino-inclinado` no Upper, sobrava
   * um slot, e o primeiro candidato livre era a crucifixo — resultado: peito com
   * um único movimento de empurrar na semana inteira, e metade do volume dele em
   * isolamento. Para um fisiculturista isso é um grupo abandonado. Com um slot,
   * o composto é o que tem melhor retorno por série; a variedade de família
   * cede, porque repetir padrão é menos grave que não treinar o padrão. */
  const soUmSlot = numExercises === 1;
  /* A preferência por composto no slot único vale enquanto houver um composto
   * AINDA NÃO usado na semana. Sem essa ressalva, um grupo com um só composto
   * no catálogo (tríceps, depois que o mergulho virou isolado) recebia
   * literalmente o mesmo exercício nos dois dias — Supino Fechado 4× e depois
   * Supino Fechado 3×. Repetir o movimento idêntico é pior que trocar por um
   * isolado: some a variedade E o segundo dia não acrescenta padrão nenhum. */
  const compostoInedito = rotated.some((e) => e.pattern === "composto" && !familiasDaSemana?.has(e.movementFamily));
  const temComposto = rotated.some((e) => e.pattern === "composto");
  const elegivelNoSlotUnico = (ex: (typeof rotated)[number]) =>
    !soUmSlot || !temComposto || (compostoInedito ? ex.pattern === "composto" : true);

  // 1ª volta: famílias inéditas NA SEMANA — evita repetir o mesmo movimento nos
  // dois dias em que o grupo aparece (achado 16)
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (!elegivelNoSlotUnico(ex)) continue;
    if (usedFamilies.has(ex.movementFamily) || familiasDaSemana?.has(ex.movementFamily)) continue;
    chosen.push(ex);
    usedFamilies.add(ex.movementFamily);
  }
  /* 2ª volta: relaxa a FAMÍLIA da semana, mas ainda evita o exercício idêntico.
   *
   * Antes ela relaxava tudo de uma vez, e o resultado era Desenvolvimento com
   * Halteres e Remada Curvada aparecendo nos dois dias do grupo. Repetir a
   * família é aceitável quando o catálogo aperta; repetir o mesmo exercício não
   * acrescenta padrão nenhum ao segundo dia. */
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (!elegivelNoSlotUnico(ex)) continue;
    if (usedFamilies.has(ex.movementFamily) || exerciciosDaSemana?.has(ex.id)) continue;
    chosen.push(ex);
    usedFamilies.add(ex.movementFamily);
  }

  // 3ª volta: último recurso, aceita repetir o exercício (catálogo pequeno)
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (!elegivelNoSlotUnico(ex)) continue;
    if (usedFamilies.has(ex.movementFamily)) continue;
    chosen.push(ex);
    usedFamilies.add(ex.movementFamily);
  }

  // se as famílias disponíveis não bastarem, completa repetindo família (grupo com catálogo pequeno)
  for (const ex of rotated) {
    if (chosen.length >= numExercises) break;
    if (!chosen.includes(ex)) chosen.push(ex);
  }

  /* Teto de carga axial: no máximo 2 exercícios de hinge/agachamento com barra
   * por semana. Passando disso, o exercício é trocado por uma alternativa do
   * mesmo grupo que não carrega a coluna (mesa/cadeira flexora, leg press) —
   * ou simplesmente sai, se não houver. */
  if (axiaisNaSemana) {
    for (let k = 0; k < chosen.length; k++) {
      const ex = chosen[k];
      const pesado = FAMILIAS_AXIAIS.has(ex.movementFamily) && ex.equipment === "barra";
      if (!pesado) continue;
      const cabeNaSemana = axiaisNaSemana.n < MAX_EXERCICIOS_AXIAIS_PESADOS_POR_SEMANA;
      const cabeNaSessao = (axiaisNaSessao?.n ?? 0) < MAX_AXIAIS_PESADOS_POR_SESSAO;
      if (cabeNaSemana && cabeNaSessao) {
        axiaisNaSemana.n += 1;
        if (axiaisNaSessao) axiaisNaSessao.n += 1;
        continue;
      }
      // a alternativa também respeita a regra de uma família por dia — senão a
      // troca reintroduz Mesa Flexora + Cadeira Flexora no mesmo posterior
      /* Prefere COMPOSTO na substituição. A busca ingênua pegava o primeiro da
       * lista intercalada, que é sempre um isolado — barrado o agachamento, a
       * troca caía em Cadeira Extensora e o Leg Press, que é a substituição
       * óbvia e não carrega a coluna, ficava logo atrás sem ser alcançado. Na
       * semana de recuperação ruim isso apagava todo composto de perna. */
      const elegivel = (o: (typeof rotated)[number]) =>
        !chosen.includes(o) &&
        !usedFamilies.has(o.movementFamily) &&
        !(FAMILIAS_AXIAIS.has(o.movementFamily) && o.equipment === "barra");
      const alternativa = rotated.find((o) => elegivel(o) && o.pattern === "composto") ?? rotated.find(elegivel);
      if (alternativa) {
        usedFamilies.delete(ex.movementFamily);
        usedFamilies.add(alternativa.movementFamily);
        chosen[k] = alternativa;
      } else {
        usedFamilies.delete(ex.movementFamily);
        chosen.splice(k--, 1);
      }
    }
  }

  /* O alvo de 3 séries por exercício vale TAMBÉM depois da substituição axial.
   * Quando a troca colapsava a lista para um exercício só, `floor(5/1) = 5`
   * recriava o bloco de 5 séries que o piso de 3 existe para evitar — a
   * simulação produziu "Cadeira Flexora 5×10-15 RIR1". */
  /* Quando sobrou UM exercício só, o teto sobe para 4.
   *
   * A guarda de carga axial pode remover um exercício sem achar substituto de
   * família inédita — e aí o grupo fica com um item só. Com teto de 3, uma meta
   * de 5 entregava 3: o app prometendo o que ele mesmo não cumpre, que é o
   * defeito que a reconciliação de metas existe para fechar.
   *
   * 4 não é número inventado para o teste passar: o próprio programa do Pedro
   * tem um bloco de 4 (crucifixo máquina no dia de superiores). A exceção é
   * estreita de propósito — só quando não há outro exercício para dividir. */
  const tetoDesteGrupo = chosen.length === 1 ? MAX_SETS_PER_EXERCISE + 1 : MAX_SETS_PER_EXERCISE;
  const tetoPorExercicio = Math.min(tetoDesteGrupo, Math.max(alvoSeriesPorExercicio, Math.ceil(setsNeeded / chosen.length)));
  const base = Math.min(tetoPorExercicio, Math.floor(setsNeeded / chosen.length));
  const remainder = Math.min(chosen.length, setsNeeded - base * chosen.length);

  return chosen.flatMap((ex, i) => {
    const workSets = Math.min(tetoPorExercicio, base + (i < remainder ? 1 : 0));
    /* Piso de 2 séries: prescrição de 1 série é ruído — não estimula e ocupa
     * linha no plano. A simulação produzia "Good Morning — warmup 2×8-12 | work
     * 1×6-10", duas séries de aquecimento para fazer UMA série de trabalho. */
    if (workSets < 2) return [];
    const suggestedLoad = loadByExercise?.get(ex.id) ?? null;
    const blocks: TrainingItem["blocks"] = [];

    // Aquecimento no PRIMEIRO exercício composto do grupo. O tipo `warmup` já existia no modelo de
    // dados e no protocolo do educador (a contagem de volume efetivo em trainingVolume.ts o exclui de
    // propósito), mas a divisão gerada nunca prescrevia nenhum — as sessões saíam com a pessoa entrando
    // direto na série pesada. Não entra em isolado nem no segundo exercício do mesmo grupo: a
    // articulação já está aquecida a essa altura.
    /* AQUECIMENTO — rampa de verdade, e só no que precisa (achado 12).
     *
     * Dois erros conviviam. O comentário prometia "~50% e ~70% da carga" e o
     * código emitia UM bloco de 2 séries, as duas a 50% — a rampa descrita não
     * existia. E o escopo era por grupo muscular, o que produzia os dois
     * extremos na mesma sessão: agachamento pesado entrando com 2×8-12 a 50%
     * (insuficiente para uma série de 6-10) e elevação pélvica ganhando
     * aquecimento como 3º movimento de quadril do dia, com o quadril quente há
     * 40 minutos.
     *
     * Agora: rampa de duas séries com repetições DESCENDENTES (50% × 8, 70% × 4)
     * só no primeiro movimento pesado com barra/composto da sessão. */
    /* Todo movimento axial pesado com barra ganha rampa PRÓPRIA, mesmo sendo o
     * 3º exercício do dia. A regra `i === 0` deixava o Levantamento Terra
     * entrar a RIR 2 sem nenhuma aproximação, porque o Stiff já tinha
     * consumido o aquecimento da família. Barra na coluna não usa aquecimento
     * de outro exercício. */
    /* WARM-UP 1×15, uma vez por sessão — no formato do programa real.
     *
     * A versão anterior emitia uma rampa de duas séries (50%×8 e 70%×4) em todo
     * primeiro composto E em todo axial pesado. O documento do Pedro faz
     * diferente: UMA série de 15 repetições longe da falha, só no primeiro
     * exercício da sessão, e o resto do preparo fica por conta do feeder set de
     * cada exercício — que agora existe.
     *
     * Faz sentido com a mudança de faixa: com 5-7 e feeder em todo exercício, a
     * aproximação acontece exercício a exercício, e a rampa longa vira volume
     * de aquecimento repetido sem função. */
    const axialPesado = FAMILIAS_AXIAIS.has(ex.movementFamily) && ex.equipment === "barra";
    const primeiroDaSessao = i === 0 && (familiasAquecidasNaSessao?.size ?? 0) === 0;
    if ((primeiroDaSessao || axialPesado) && !familiasAquecidasNaSessao?.has(ex.movementFamily)) {
      familiasAquecidasNaSessao?.add(ex.movementFamily);
      blocks.push({
        reserveType: "warmup" as const,
        sets: 1,
        repRange: "15",
        rirTarget: 6,
        restSeconds: 60,
        loadKg: suggestedLoad != null ? Math.round(suggestedLoad * 0.5 * 2) / 2 : null,
      });
    }

    /* FEEDER SET — a série de aproximação que faltava.
     *
     * No programa real do Pedro (10º mesociclo) TODO exercício tem feeder: uma
     * série com ~5 repetições na reserva, na faixa de trabalho, antes das
     * séries válidas. Não é aquecimento articular (isso é o warm-up 1×15 que
     * abre a sessão) — é ensaio do padrão com a carga do dia, e é o que permite
     * a primeira série de trabalho já sair cheia.
     *
     * Não conta como volume: `trainingVolume.ts` só soma `work` e `topset`. */
    blocks.push({
      reserveType: "feeder" as const,
      sets: 1,
      repRange: REP_RANGE_PADRAO,
      rirTarget: 5,
      restSeconds: 90,
      loadKg: suggestedLoad != null ? Math.round(suggestedLoad * 0.85 * 2) / 2 : null,
    });

    /* WORK SETS + TOP SET.
     *
     * A metodologia do programa real separa as séries válidas em duas classes:
     * as `work` ficam a 1-2 repetições da falha, e a ÚLTIMA do exercício é um
     * `topset` levado à falha dentro da faixa. O app já tinha os dois tipos no
     * modelo de dados, mas nunca emitia `topset` — todas as séries saíam
     * iguais, e a progressão perdia o ponto de referência que o top set dá.
     *
     * Divisão: n-1 séries de trabalho + 1 top set. Com o padrão de 3 séries por
     * exercício isso reproduz exatamente o "2 work + 1 top" do documento. */
    const topSets = 1;
    const workPuros = Math.max(1, workSets - topSets);

    blocks.push({
      reserveType: "work" as const,
      sets: workPuros,
      repRange: REP_RANGE_PADRAO,
      // Composto pesado fica 1-2 reps da falha (o custo de falhar num agachamento é alto); isolado
      // pode ir mais perto. É o alvo que a pergunta de adesão ("chegou perto da falha?") cobra.
      /* RIR base + o extra de fadiga. Sem o extra, "recuperação ruim" cortava
       * volume e mandava ir a 1-2 reps da falha do mesmo jeito — que é o pior
       * dos dois mundos num fim de cutting: menos estímulo total e a mesma
       * demanda neural e articular por série. */
      rirTarget: RIR_WORK + fadiga.rirExtra,
      // composto grande pede 3 min; isolado recupera em ~90 s. É o que torna o
      // teto de séries/sessão traduzível em tempo real de academia.
      restSeconds: ex.pattern === "composto" ? 180 : 90,
      // carga sugerida a partir do histórico logado (ver suggestLoadProgression em
      // trainingPeriodization.ts); null quando ainda não há log desse exercício
      loadKg: suggestedLoad,
    });

    /* TOP SET — falha dentro da faixa.
     *
     * RIR 0: é a série que define se a carga sobe na semana seguinte. Numa
     * semana de fadiga alta o `rirExtra` afasta ela da falha junto com o
     * resto — top set com recuperação ruim é exatamente o que não se quer. */
    blocks.push({
      reserveType: "topset" as const,
      sets: topSets,
      repRange: REP_RANGE_PADRAO,
      rirTarget: RIR_TOPSET + fadiga.rirExtra,
      restSeconds: ex.pattern === "composto" ? 180 : 90,
      loadKg: suggestedLoad,
    });

    return { exerciseId: ex.id, blocks };
  });
}

/** Um dia só aceita músculo do seu padrão de movimento. `Upper`, `Lower` e
 * `Corpo inteiro` aceitam o que couber na metade do corpo que nomeiam. */
function diaAceita(label: string, muscle: MuscleGroup): boolean {
  const PUSH: MuscleGroup[] = ["peito", "ombro", "triceps"];
  const PULL: MuscleGroup[] = ["costas", "deltoide_posterior", "biceps", "lombar"];
  const LEGS: MuscleGroup[] = ["quadriceps", "posterior_coxa", "gluteo", "adutor", "panturrilha"];
  const base = label.replace(/ [AB]$/, "");
  if (base === "Push") return PUSH.includes(muscle);
  if (base === "Pull") return PULL.includes(muscle);
  if (base === "Legs" || base === "Lower") return LEGS.includes(muscle) || muscle === "lombar" || muscle === "abdominal";
  if (base === "Upper") return PUSH.includes(muscle) || PULL.includes(muscle) || muscle === "abdominal";
  return true; // Corpo inteiro
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

    /* O destino tem de ser COMPATÍVEL com o padrão de movimento do músculo.
     *
     * Antes o critério era só "o dia com menos grupos", e isso quebrava
     * exatamente a partição que dá sentido ao modelo: com prioridade em costas
     * e 3 dias, o resultado era **costas dentro do dia de Push** — remada
     * pesada no mesmo dia do supino. Nenhum cenário da simulação exercitava
     * esse caminho, então passou despercebido até a auditoria ler o código. */
    const compativeis = days.filter((d) => !d.muscles.includes(muscle) && diaAceita(d.label, muscle));
    if (compativeis.length === 0) continue; // sem dia compatível: sobe volume no dia que já existe
    const candidate = [...compativeis].sort((a, b) => a.muscles.length - b.muscles.length)[0];
    candidate.muscles.push(muscle);
  }

  return days;
}

/** Monta a divisão de treino automaticamente a partir dos dias/semana disponíveis e da meta de volume
 * por grupo — distribui o volume semanal de cada músculo entre as sessões em que ele aparece no template
 * e escolhe os exercícios do catálogo. `daysPerWeek` fora de 1-6 é limitado a esse intervalo. Grupos
 * prioritários entram primeiro em cada sessão (treinados com a pessoa fresca) e ganham uma 2ª exposição
 * semanal quando o template só previa 1x. */
/** Quanto afastar da falha. `0` é o padrão; valores maiores somam RIR em tudo e
 * são usados quando recuperação está ruim ou na semana de deload — cortar volume
 * mantendo RIR 1-2 não é recuperar, é fazer uma semana normal mais curta. */
export interface AjusteDeFadiga {
  /** somado ao rirTarget de todo bloco de trabalho */
  rirExtra: number;
  /** proíbe hinge/agachamento com barra — usado em deload e recuperação ruim */
  semCargaAxialPesada: boolean;
}

/* ── ABDOMINAL: bloco fixo, fora da contabilidade de volume ──────────────────
 *
 * Decisão do Pedro (24/08/2026): abdominal não entra no volume de treino e é
 * prescrito como bloco fixo — 2 sessões por semana, 3 séries de 12.
 *
 * Por que FORA do orçamento e não só com meta própria: enquanto abdominal
 * disputava as 24 séries da sessão, ele perdia sempre. Grupos de MEV 0 só
 * recebem do excedente, e nos arranjos de 3 e 4 dias o excedente acabava antes
 * — o abdominal saía com ZERO. Tirar da disputa é o que faz a prescrição
 * acontecer de verdade; deixá-lo competindo com uma meta pequena só recriaria o
 * mesmo zero por outro caminho.
 *
 * A consequência aceita: as séries de abdominal não contam no teto de 24 nem
 * nas metas por grupo. É intencional — é isso que "não contabilizar no volume"
 * quer dizer. Trabalho de core a 12 repetições custa pouca fadiga sistêmica
 * perto de um agachamento, então não competir pelo mesmo orçamento é defensável
 * além de ser o que foi pedido. */
const ABDOMINAL_SESSOES_POR_SEMANA = 2;
/** Um exercício só, sempre o mesmo: abdominal na polia com corda. */
const ABDOMINAL_EXERCICIO_ID = "abdominal-polia-corda";
const ABDOMINAL_SERIES = 3;
const ABDOMINAL_REPS = "12";
const ABDOMINAL_DESCANSO_S = 60;

/* ── AGONISTA ↔ ANTAGONISTA ─────────────────────────────────────────────────
 *
 * Pares de ação oposta na mesma articulação. Intercalar os dois lados deixa o
 * grupo anterior descansando enquanto o oposto trabalha: a sessão fica mais
 * curta com o MESMO descanso por grupo, e o antagonista fresco costuma render
 * mais força no exercício seguinte.
 *
 * O par ombro↔deltoide posterior é aproximado — elevação lateral é abdução, não
 * flexão —, mas na prática são as duas faces do deltoide e alternar entre elas
 * dá o mesmo efeito de rodízio. */
const ANTAGONISTA: Partial<Record<MuscleGroup, MuscleGroup>> = {
  peito: "costas",
  costas: "peito",
  biceps: "triceps",
  triceps: "biceps",
  quadriceps: "posterior_coxa",
  posterior_coxa: "quadriceps",
  ombro: "deltoide_posterior",
  deltoide_posterior: "ombro",
  abdominal: "lombar",
  lombar: "abdominal",
};

/** Reordena mantendo o primeiro item onde está e, a cada passo, preferindo o
 * antagonista do anterior. Quando não há antagonista disponível, segue a ordem
 * original — a intercalação é uma preferência, não uma regra que possa
 * reprovar um exercício ou mudar o volume de alguém. */
function intercalarAntagonistas(itens: TrainingItem[]): TrainingItem[] {
  if (itens.length <= 2) return itens;

  const restantes = [...itens];
  const saida: TrainingItem[] = [restantes.shift() as TrainingItem];

  while (restantes.length > 0) {
    const anterior = exerciseById(saida[saida.length - 1].exerciseId)?.primaryMuscle;
    const alvo = anterior ? ANTAGONISTA[anterior] : undefined;
    const i = alvo ? restantes.findIndex((it) => exerciseById(it.exerciseId)?.primaryMuscle === alvo) : -1;
    saida.push(restantes.splice(i >= 0 ? i : 0, 1)[0]);
  }
  return saida;
}

function adicionarAbdominal(sessoes: TrainingSession[]): TrainingSession[] {
  if (sessoes.length === 0) return sessoes;

  /* SEMPRE abdominal na polia com corda, por decisão do Pedro — e nunca
     prancha. A prancha é isometria de anti-extensão: sustenta posição, não
     carrega progressão. Num programa de hipertrofia o abdominal precisa de
     carga que sobe, e a polia é o único item do catálogo em que dá para somar
     peso semana a semana. Antes o bloco rodava o catálogo e caía em prancha e
     abdominal no solo. */
  const exercicio = exerciseById(ABDOMINAL_EXERCICIO_ID);
  if (!exercicio) return sessoes;

  /* Espalha as sessões de abdominal pela semana em vez de empilhar nos
     primeiros dias: com 5 dias, cai no 1º e no 3º, não no 1º e no 2º. */
  const quantas = Math.min(ABDOMINAL_SESSOES_POR_SEMANA, sessoes.length);
  const diasComAbdominal = new Set<number>();
  for (let i = 0; i < quantas; i++) {
    diasComAbdominal.add(Math.round((i * sessoes.length) / quantas));
  }

  return sessoes.map((sessao, i) => {
    if (!diasComAbdominal.has(i)) return sessao;
    return {
      ...sessao,
      items: [
        ...sessao.items,
        {
          exerciseId: exercicio.id,
          blocks: [
            {
              reserveType: "work" as const,
              sets: ABDOMINAL_SERIES,
              repRange: ABDOMINAL_REPS,
              rirTarget: 1,
              restSeconds: ABDOMINAL_DESCANSO_S,
            },
          ],
        },
      ],
    };
  });
}

export function buildSplit(
  daysPerWeek: number,
  muscleTargets: MuscleTarget[],
  loadByExercise?: Map<string, number>,
  fadiga: AjusteDeFadiga = { rirExtra: 0, semCargaAxialPesada: false }
): TrainingSession[] {
  const days = clampDays(daysPerWeek);
  const priorityMuscles = muscleTargets.filter((t) => t.isPriority).map((t) => t.muscle);
  const template = ensurePriorityFrequency(SPLIT_TEMPLATES[days], priorityMuscles);
  const targetByMuscle = new Map(muscleTargets.map((t) => [t.muscle, t.weeklySets]));
  /* A FATIA SÓ VALE SE FOR COERENTE COM A META.
   *
   * `perDayByLabel` tem precedência sobre `weeklySets` — e essa precedência já
   * matou a rampa do mesociclo e o deload inteiro, porque a periodização
   * escalava a meta e a fatia sobrevivia intacta. O bug foi corrigido na
   * origem, mas a armadilha continuava: qualquer código futuro que ajuste
   * `weeklySets` sem reescrever a fatia é ignorado EM SILÊNCIO.
   *
   * Agora a fatia é aceita apenas quando soma exatamente a meta. Divergiu,
   * cai na divisão igual — que respeita `weeklySets`. Falha ruidosa em vez de
   * silenciosa: o pior caso passa a ser perder a assimetria por dia, não
   * perder o ajuste inteiro. */
  const rotulosDoTemplate = new Set(template.map((d) => d.label));
  const perDayByMuscle = new Map<MuscleGroup, Record<string, number>>();
  for (const t of muscleTargets) {
    if (!t.perDayByLabel) continue;
    const soma = Object.values(t.perDayByLabel).reduce((n, v) => n + v, 0);
    if (soma !== t.weeklySets) continue;
    /* O RÓTULO TAMBÉM PRECISA EXISTIR NESTE TEMPLATE.
     *
     * Validar só a soma não bastava, e o modo de falha real era justamente
     * este. O deload troca o template (`Math.min(3, daysPerWeek)`): num plano
     * de 5 dias a fatia tem {Push, Upper, Pull, Legs, Lower} e o template do
     * deload tem {Push, Pull, Legs}. A soma batia, a fatia era aceita, e as
     * fatias de Upper e Lower eram DESCARTADAS sem aviso — o deload entregava
     * 31 séries contra uma meta anunciada de 46.
     *
     * Rótulo estranho ao template significa que a fatia foi calculada para
     * outra divisão. Aí ela inteira é inválida, e a divisão igual (que respeita
     * `weeklySets`) é a resposta certa. */
    const todosOsRotulosCabem = Object.keys(t.perDayByLabel).every(
      (label) => rotulosDoTemplate.has(label) || t.perDayByLabel![label] === 0
    );
    if (todosOsRotulosCabem) perDayByMuscle.set(t.muscle, t.perDayByLabel);
  }
  const priorityByMuscle = new Set(priorityMuscles);

  const frequencyByMuscle = new Map<MuscleGroup, number>();
  for (const day of template) {
    for (const m of day.muscles) frequencyByMuscle.set(m, (frequencyByMuscle.get(m) ?? 0) + 1);
  }

  const rotationByMuscle = new Map<MuscleGroup, number>();

  /* ARREDONDAMENTO SEM VAZAMENTO (achado 7 da auditoria).
   *
   * Era `Math.round(weeklySets / freq)` em cada dia — meta ímpar com frequência
   * 2 arredondava PRA CIMA nos dois dias (peito 11 → 6+6 = 12). Nunca pra
   * baixo. A entrega estourava a meta em +7% nos cenários normais e em +15%
   * justo no cenário de recuperação ruim, onde o objetivo inteiro era recuar.
   *
   * Agora o resto é distribuído: `floor` para todos os dias e +1 em apenas
   * `weekly % freq` deles. A soma dos dias é EXATAMENTE a meta semanal. */
  const restanteByMuscle = new Map<MuscleGroup, number>();
  const baseByMuscle = new Map<MuscleGroup, number>();
  for (const [muscle, weekly] of targetByMuscle) {
    const freq = frequencyByMuscle.get(muscle) ?? 1;
    baseByMuscle.set(muscle, Math.floor(weekly / freq));
    restanteByMuscle.set(muscle, weekly % freq);
  }

  /* Famílias de movimento já usadas na SEMANA, não só no dia (achado 16).
   * A rotação entre dias só deslocava o início da lista, então o segundo
   * exercício se repetia: Supino Reto no Smith aparecia no Push e no Upper,
   * Remada Curvada no Pull e no Upper. A variedade era só do primeiro slot. */
  const familiasDaSemana = new Set<string>();
  const exerciciosDaSemana = new Set<string>();
  const axiaisNaSemana = { n: fadiga.semCargaAxialPesada ? MAX_EXERCICIOS_AXIAIS_PESADOS_POR_SEMANA : 0 };

  const sessoes = template.map((day) => {
    // grupos prioritários primeiro na lista — treinados enquanto a pessoa ainda está fresca na sessão
    const orderedMuscles = [...day.muscles].sort((a, b) => {
      const pa = priorityByMuscle.has(a) ? 0 : 1;
      const pb = priorityByMuscle.has(b) ? 0 : 1;
      return pa - pb;
    });

    const items: TrainingItem[] = [];
    const familiasAquecidasNaSessao = new Set<string>();
    const axiaisNaSessao = { n: 0 };

    /* TETO POR SESSÃO (achado 3). `SETS_PER_SESSION_BUDGET` só formava o
     * orçamento SEMANAL e nunca era aplicado por dia — o dia com mais grupos
     * acumulava tudo. Na simulação o Upper saía com 34 séries efetivas e 10
     * exercícios: 2h+ de academia. O que acontece de verdade é a pessoa pular
     * os últimos exercícios, e aí a auditoria de adesão culpa ela por uma
     * sessão que era impossível.
     *
     * O corte é PROPORCIONAL, não pela cauda: a primeira versão simplesmente
     * parava de prescrever quando estourava o teto, e os últimos grupos do dia
     * ficavam com zero. Escalar mantém todo mundo na sessão, só menor. */
    const desejadoPorGrupo = new Map<MuscleGroup, number>();
    for (const muscle of orderedMuscles) {
      /* Fatia calculada para ESTE dia, quando existe.
       *
       * É o que permite o Push levar 7 séries de peito enquanto o Upper leva 4,
       * em vez de 5 e 5. A divisão igual continua como reserva: uma meta vinda
       * de outro caminho (ou um rótulo que não bate com o template) cai nela em
       * vez de virar zero. */
      const fatiaDoDia = perDayByMuscle.get(muscle)?.[day.label];
      if (fatiaDoDia != null) {
        desejadoPorGrupo.set(muscle, fatiaDoDia);
        continue;
      }
      const base = baseByMuscle.get(muscle) ?? 0;
      const sobra = restanteByMuscle.get(muscle) ?? 0;
      desejadoPorGrupo.set(muscle, base + (sobra > 0 ? 1 : 0));
      if (sobra > 0) restanteByMuscle.set(muscle, sobra - 1);
    }
    /* Quando a sessão estoura, quem cede é o grupo SEM prioridade.
     *
     * O corte proporcional puro encolhia o ponto fraco junto com o resto — e aí
     * a promessa de "ponto fraco ganha mais exercícios" deixava de valer
     * exatamente nos dias cheios, que são a maioria. Priorizar um grupo tem de
     * custar volume aos OUTROS; se custar a ele também, não é priorizar. */
    const somaDesejada = [...desejadoPorGrupo.values()].reduce((n, v) => n + v, 0);
    const escalaPorGrupo = new Map<MuscleGroup, number>();
    if (somaDesejada > SETS_PER_SESSION_BUDGET) {
      const somaPrio = orderedMuscles
        .filter((m) => priorityByMuscle.has(m))
        .reduce((n, m) => n + (desejadoPorGrupo.get(m) ?? 0), 0);
      const somaResto = somaDesejada - somaPrio;
      const sobraParaResto = SETS_PER_SESSION_BUDGET - somaPrio;
      if (sobraParaResto > 0 && somaResto > 0) {
        // prioridade intacta, o resto absorve o corte
        for (const m of orderedMuscles) {
          escalaPorGrupo.set(m, priorityByMuscle.has(m) ? 1 : sobraParaResto / somaResto);
        }
      } else {
        // nem a prioridade sozinha cabe: aí o corte é proporcional para todos
        const escala = SETS_PER_SESSION_BUDGET / somaDesejada;
        for (const m of orderedMuscles) escalaPorGrupo.set(m, escala);
      }
    }

    /* Orçamento que ainda resta NESTA sessão.
     *
     * O escalonamento acima faz a soma caber em teoria, mas cada grupo é
     * arredondado por conta própria logo abaixo — e vários arredondando para
     * cima estouram o teto de novo. Foi exatamente o que aconteceu quando a
     * fatia por dia entrou: o Upper A do arranjo de 4 dias saiu com 25 séries
     * num orçamento de 24.
     *
     * A trava fica aqui porque este é o último ponto antes de emitir a série de
     * verdade — a verificação equivalente em `computeMuscleTargets` mede a
     * divisão IGUAL, que deixou de ser o que a montagem entrega. Grupos
     * prioritários já vêm primeiro em `orderedMuscles`, então quem cede quando
     * o teto aperta continua sendo o grupo sem prioridade. */
    let restanteNaSessao = SETS_PER_SESSION_BUDGET;

    for (const muscle of orderedMuscles) {
      const setsAjustado = Math.min(
        MAX_SETS_PER_MUSCLE_PER_SESSION,
        Math.round((desejadoPorGrupo.get(muscle) ?? 0) * (escalaPorGrupo.get(muscle) ?? 1)),
        restanteNaSessao
      );
      if (setsAjustado <= 0) continue;
      restanteNaSessao -= setsAjustado;

      const rotation = rotationByMuscle.get(muscle) ?? 0;
      rotationByMuscle.set(muscle, rotation + 1);
      const novos = pickExercisesForMuscle(
        muscle,
        setsAjustado,
        rotation,
        priorityByMuscle.has(muscle),
        loadByExercise,
        familiasDaSemana,
        exerciciosDaSemana,
        axiaisNaSemana,
        axiaisNaSessao,
        familiasAquecidasNaSessao,
        fadiga
      );
      for (const it of novos) {
        const fam = exerciseById(it.exerciseId)?.movementFamily;
        if (fam) familiasDaSemana.add(fam);
        exerciciosDaSemana.add(it.exerciseId);
      }
      items.push(...novos);
    }

    /* COMPOSTO ANTES DE ISOLADO, dentro da sessão.
     *
     * A ordenação por prioridade acontece por GRUPO, e isso colocava a elevação
     * lateral (isolado de ombro, o ponto fraco) antes do supino inclinado
     * (composto de peito) — pré-fatigando o deltóide exatamente para o supino.
     * A regra de treinar o ponto fraco fresco continua valendo; ela só passa a
     * valer DENTRO da classe de movimento. O composto do grupo prioritário
     * segue abrindo a sessão; o isolado dele espera todos os compostos.
     *
     * `sort` estável: a ordem de prioridade entre grupos é preservada dentro de
     * cada classe. */
    const porClasse = items
      .map((it, ordem) => ({ it, ordem, isolado: exerciseById(it.exerciseId)?.pattern === "isolado" ? 1 : 0 }))
      .sort((a, b) => a.isolado - b.isolado || a.ordem - b.ordem);

    const ordenados = intercalarAntagonistas(porClasse.filter((x) => x.isolado === 0).map((x) => x.it)).concat(
      intercalarAntagonistas(porClasse.filter((x) => x.isolado === 1).map((x) => x.it))
    );

    return { label: day.label, items: ordenados };
  });

  return adicionarAbdominal(sessoes);
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

    /* Rampa de passo constante em vez de interpolação MEV→meta.
     *
     * A interpolação produzia passos desiguais — na simulação, 84 → 94 → 100 →
     * 118, ou seja +11,9%, +6,4% e +18%. O maior salto caía justamente na
     * semana 4, que já é a mais pesada do bloco. Agora o passo é fixo: a semana
     * 1 sai em ~78% da meta e cresce ~9% ao mês até 100% na semana 4. */
    /* Semana 1 em 65% da meta, não 78%. Com 78% a amplitude do bloco inteiro
     * era de 14% (79 → 90 séries) e o passo saía decrescente — um mesociclo
     * cuja primeira semana já está a 88% do pico não acumula nada. */
    const FRACAO_SEMANA_1 = 0.65;
    const fracaoAcumulo = FRACAO_SEMANA_1 + (1 - FRACAO_SEMANA_1) * progressFraction;
    const rampedTargets: MuscleTarget[] = muscleTargets.map((t) => {
      const landmark = landmarkFor(t.muscle);
      const rampedSets = isDeload
        ? Math.round(t.weeklySets * 0.5)
        : Math.max(landmark.mev > 0 ? Math.min(landmark.mev, t.weeklySets) : 0, Math.round(t.weeklySets * fracaoAcumulo));
      /* A FATIA POR DIA TEM DE SER ESCALADA JUNTO.
       *
       * `{...t}` carregava `perDayByLabel` de PICO intacto — e em `buildSplit`
       * a fatia tem precedência absoluta sobre `weeklySets`, que nem chega a
       * ser lido quando ela existe. Efeito medido antes desta correção:
       *
       *   rampa 1 dia  60/60/60/60  deload 60   (deload = 100% do pico)
       *   rampa 3 dias 60/60/60/60  deload 60   (idem)
       *   rampa 5 dias 83/83/83/83  deload 52
       *
       * A rampa estava PLANA nos seis arranjos — semana 1 igual à semana 4 — e
       * o deload era 100% inerte em 1, 2 e 3 dias. Em 4/5/6 dias ele só
       * funcionava por acidente: o deload troca o template
       * (`Math.min(3, daysPerWeek)`) e os rótulos novos não batem com os
       * antigos, então o lookup falha e cai no fallback de divisão igual.
       *
       * Escalar a fatia, em vez de removê-la, preserva a assimetria por dia —
       * que é a razão de `perDayByLabel` existir. O invariante
       * `weeklySets === soma(perDayByLabel)` é mantido distribuindo o total
       * rampado pelas proporções originais. */
      /* PISO DE PRESCRIÇÃO NO DELOAD.
       *
       * `pickExercisesForMuscle` não prescreve exercício com menos de 2 séries.
       * Com 1 dia/semana, metade de ~21 séries dividida por 11 grupos dá 1 cada
       * — abaixo do piso — e QUASE TUDO é descartado: o deload entregava 3
       * séries, um corte de 86% onde a tela promete metade.
       *
       * Grupo que tinha volume prescrito não vai a zero por arredondamento do
       * deload. Quando o piso impede o corte de 50%, o alívio vem do RIR (+2 em
       * tudo) e da retirada da carga axial, que já valem na mesma semana — e
       * numa rotina de uma sessão semanal esse é o alívio que faz sentido, já
       * que o volume total já é baixo. */
      const freqDoGrupo = Math.max(1, Object.values(t.perDayByLabel ?? { x: 1 }).filter((v) => v > 0).length);
      /* O piso só vale no arranjo de 1 dia. Com 2+ dias o orçamento já comporta
         o corte sem derrubar grupo abaixo do mínimo — aplicar o piso ali só
         enfraqueceria o deload (medido: 4 dias iam de 43 para 48 séries sem
         necessidade, e 2 dias já cortava corretamente para 67%). */
      const pisoPrescritivel =
        daysPerWeek <= 1 && t.weeklySets >= 2 * freqDoGrupo ? 2 * freqDoGrupo : 0;
      const alvo = Math.max(0, Math.max(rampedSets, pisoPrescritivel));
      if (!t.perDayByLabel) return { ...t, weeklySets: alvo };
      const fatias = Object.entries(t.perDayByLabel).map(([label, sets]) => ({ label, sets }));
      const perDayByLabel = distribuirPorDia(alvo, fatias);
      return {
        ...t,
        weeklySets: Object.values(perDayByLabel).reduce((n, v) => n + v, 0),
        perDayByLabel,
      };
    });

    // Quando o orçamento semanal mal cobre o MEV (caso típico de 3 dias/semana), a "rampa" de volume é
    // degenerada — sai 62/67/67/67 e a progressão de volume simplesmente não existe. Antes isso ficava
    // escondido atrás de um texto que prometia "volume subindo progressivamente". Agora o plano diz a
    // verdade e aponta pra onde a progressão realmente está nesse cenário: a carga (ver
    // suggestLoadProgression em trainingPeriodization.ts).
    const totalTarget = muscleTargets.reduce((sum, t) => sum + t.weeklySets, 0);
    const totalMev = muscleTargets.reduce((sum, t) => sum + (t.weeklySets > 0 ? landmarkFor(t.muscle).mev : 0), 0);
    const rampIsFlat = totalTarget <= totalMev * 1.15;

    /* Com 1-2 dias/semana o volume não cai no deload: metade da meta jogaria
       quase todo grupo abaixo do mínimo de prescrição, e o resultado seria uma
       semana de 3 séries. Aí o alívio vem do RIR e da retirada do axial — que é
       o alívio que faz sentido para quem já treina pouco. O texto precisa dizer
       isso, em vez de prometer um corte de volume que não acontece.

       Vale só para 1 dia: com 2 dias o corte já sai correto (67% do pico). */
    const deloadCortaVolume = daysPerWeek > 1;
    const focusNote = isDeload
      ? deloadCortaVolume
        ? "Semana de deload — volume pela metade, RIR 2 pontos mais longe da falha, sem agachamento nem levantamento terra com barra, e concentrada em 3 sessões. Cortar série mantendo RIR 1 não recupera nada: é uma semana normal mais curta."
        : "Semana de deload — o volume SEGUE o mesmo, porque com esta frequência cortá-lo pela metade deixaria quase todo grupo abaixo do mínimo produtivo. O alívio vem da intensidade: RIR 2 pontos mais longe da falha e nenhum agachamento ou levantamento terra com barra. Numa rotina de poucas sessões, é a fadiga por série que precisa recuar, não a contagem."
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
      /* DELOAD DE VERDADE (achado 11). Antes ele só cortava volume pela metade
       * e mantinha RIR 1-2, Levantamento Terra, Agachamento Livre e os 5 dias —
       * 66 séries levadas a 1-2 reps da falha não é semana de recuperação, é
       * uma semana normal de 3 dias espalhada em 5. Agora: +2 de RIR em tudo,
       * nenhum hinge/agachamento com barra, e a semana encolhe para 3 sessões. */
      sessions: buildSplit(
        isDeload ? Math.min(3, daysPerWeek) : daysPerWeek,
        rampedTargets,
        loadByExercise,
        isDeload ? { rirExtra: 2, semCargaAxialPesada: true } : { rirExtra: 0, semCargaAxialPesada: false }
      ),
    });
  }

  return plan;
}
