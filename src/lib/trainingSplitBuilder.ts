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
const SETS_PER_SESSION_BUDGET = 24;

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
  diasJaConcentrados = false
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

  const slots: Slot[] = VOLUME_LANDMARKS.map((landmark) => {
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
    const desired = isDeclared ? landmark.mrv : lidoAtrasado ? landmark.mav * 1.25 : landmark.mav * adjustment;
    const ideal = Math.min(ceiling, Math.round(desired));

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
  const fatiasPorMusculo = new Map<MuscleGroup, number[]>();

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
    if (somaPeso <= 0 || disponivel <= 0) continue;

    for (const sl of noDia) {
      const peso = faltaDe(sl) * (sl.isPriority ? 2 : 1);
      if (peso <= 0) continue;
      sl.sets += Math.min(faltaDe(sl), (disponivel * peso) / somaPeso);
    }

    // registra a fatia deste dia (o `sl.sets` acumulado menos o que já havia)
    for (const sl of noDia) {
      const lista = fatiasPorMusculo.get(sl.landmark.muscle) ?? [];
      const jaSomado = lista.reduce((n, v) => n + v, 0);
      lista.push(Math.max(0, sl.sets - jaSomado));
      fatiasPorMusculo.set(sl.landmark.muscle, lista);
    }
  }

  // a meta é a fatia do dia mais apertado × frequência (ver comentário acima)
  for (const sl of slots) {
    const fatias = fatiasPorMusculo.get(sl.landmark.muscle) ?? [];
    if (fatias.length === 0) {
      sl.sets = 0;
      continue;
    }
    sl.sets = Math.min(...fatias) * fatias.length;
  }

  // arredonda no fim e garante o piso de MEV onde o teto físico permite
  for (const sl of slots) {
    const freq = Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
    const alvo = Math.round(sl.sets / freq) * freq; // múltiplo da frequência: divide exato nos dias
    sl.sets = sl.ceiling === 0 ? 0 : Math.max(Math.min(sl.landmark.mev, sl.ceiling), alvo);
  }

  /* O piso de MEV não pode prometer mais do que as sessões cabem.
   *
   * Com 1 dia/semana, forçar o MEV de todos os grupos elevava a meta a 68
   * séries — e uma sessão só comporta ~22. O app voltaria a exibir um alvo que
   * ele mesmo se recusa a cumprir, que é a incoerência que esta rodada inteira
   * existe para fechar. Quando o piso estoura a capacidade, ele cede: a meta
   * volta ao que cabe, e o `reason` abaixo diz que faltam dias de treino. */
  /* O piso de MEV é verificado POR DIA, não no total da semana.
   *
   * Verificar no total escondia o desequilíbrio do template: com 2 dias, o
   * Upper tem 7 grupos e o Lower 4, então a soma semanal cabia em 2×22 = 44
   * enquanto o Upper sozinho pedia 29 para uma sessão de 22. A meta prometia o
   * que só o dia mais cheio se recusaria a entregar. */
  for (const dia of templateParaMeta) {
    const noDia = dia.muscles.map((m) => slotPorMusculo.get(m)).filter((sl): sl is Slot => !!sl && sl.sets > 0);
    if (noDia.length === 0) continue;
    const porDia = (sl: Slot) => sl.sets / Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
    const somaDoDia = noDia.reduce((n, sl) => n + porDia(sl), 0);
    if (somaDoDia <= orcamentoPorSessao) continue;

    /* O corte NÃO desce abaixo do MEV.
     *
     * A primeira versão escalava tudo proporcionalmente, e o resultado foi um
     * peito lido como "destaque" caindo para 6 séries com MEV 8 — abaixo do
     * mínimo efetivo. Emparelhar o físico puxando o grupo forte para a
     * regressão não é emparelhar: é perder de um lado o que se ganha do outro.
     * O grupo em destaque cede o que tem ACIMA do MEV; o piso é intocável. */
    const pisoDoDia = (sl: Slot) => Math.min(sl.landmark.mev, sl.ceiling) / Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
    const somaPisos = noDia.reduce((n, sl) => n + pisoDoDia(sl), 0);
    const excedenteDisponivel = Math.max(0, orcamentoPorSessao - somaPisos);
    const somaExcedentes = noDia.reduce((n, sl) => n + Math.max(0, porDia(sl) - pisoDoDia(sl)), 0);

    if (somaPisos >= orcamentoPorSessao) {
      // nem os mínimos cabem: aí sim corta proporcional e o `reason` explica
      const escala = orcamentoPorSessao / somaDoDia;
      for (const sl of noDia) sl.sets = Math.round(sl.sets * escala);
      continue;
    }

    const escalaExcedente = somaExcedentes > 0 ? excedenteDisponivel / somaExcedentes : 0;
    for (const sl of noDia) {
      const freq = Math.max(1, freqByMuscle.get(sl.landmark.muscle) ?? 1);
      const novoPorDia = pisoDoDia(sl) + Math.max(0, porDia(sl) - pisoDoDia(sl)) * escalaExcedente;
      sl.sets = Math.round(novoPorDia * freq);
    }
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
  for (const sl of slots) {
    const porDia = sl.sets / Math.max(1, freqPorMusculo.get(sl.landmark.muscle) ?? 1);
    if (porDia < 2) sl.sets = 0;
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
    return { muscle: sl.landmark.muscle, muscleLabel, weeklySets: sl.sets, reason, isPriority: prioridadeEmVigor || undefined };
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
        "panturrilha",
        "abdominal",
      ],
    },
  ],
  2: [
    {
      label: "Upper",
      muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps", "abdominal"],
    },
    {
      label: "Lower",
      muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "lombar"],
    },
  ],
  3: [
    { label: "Push", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull", muscles: ["costas", "deltoide_posterior", "biceps", "antebraco", "lombar"] },
    { label: "Legs", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
  ],
  4: [
    // Upper/Lower ×2. O arranjo anterior (Upper/Lower/Push/Pull) deixava PERNA
    // 1×/semana enquanto o tronco ficava 2× — desequilíbrio que o comentário
    // antigo disfarçava com "perna coberta pelo Lower + acessório", e acessório
    // nenhum existia no código.
    { label: "Upper A", muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps"] },
    { label: "Lower A", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
    { label: "Upper B", muscles: ["peito", "costas", "ombro", "deltoide_posterior", "biceps", "triceps", "abdominal"] },
    { label: "Lower B", muscles: ["posterior_coxa", "quadriceps", "gluteo", "panturrilha", "lombar"] },
  ],
  5: [
    // O arranjo pedido: PPL cobrindo a semana inteira uma vez, e Upper/Lower
    // devolvendo a segunda exposição semanal a todo mundo. Nenhum grupo fica
    // com frequência 1 — que é o que sustenta metas perto do MAV/MRV.
    { label: "Push", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull", muscles: ["costas", "deltoide_posterior", "biceps", "antebraco", "lombar"] },
    { label: "Legs", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
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
    { label: "Lower", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
  ],
  6: [
    { label: "Push A", muscles: ["peito", "ombro", "triceps"] },
    { label: "Pull A", muscles: ["costas", "deltoide_posterior", "biceps", "antebraco"] },
    { label: "Legs A", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"] },
    { label: "Push B", muscles: ["peito", "ombro", "triceps", "abdominal"] },
    { label: "Pull B", muscles: ["costas", "deltoide_posterior", "biceps", "antebraco", "lombar"] },
    { label: "Legs B", muscles: ["quadriceps", "posterior_coxa", "gluteo", "panturrilha", "abdominal"] },
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
const MAX_SETS_PER_EXERCISE = 4;
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
  const numExercises = Math.max(
    1,
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
  const tetoPorExercicio = Math.min(MAX_SETS_PER_EXERCISE, Math.max(alvoSeriesPorExercicio, Math.ceil(setsNeeded / chosen.length)));
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
    const axialPesado = FAMILIAS_AXIAIS.has(ex.movementFamily) && ex.equipment === "barra";
    if ((axialPesado || (i === 0 && ex.pattern === "composto")) && !familiasAquecidasNaSessao?.has(ex.movementFamily)) {
      familiasAquecidasNaSessao?.add(ex.movementFamily);
      blocks.push({
        reserveType: "warmup" as const,
        sets: 1,
        repRange: "8",
        rirTarget: 6,
        restSeconds: 60,
        loadKg: suggestedLoad != null ? Math.round(suggestedLoad * 0.5 * 2) / 2 : null,
      });
      blocks.push({
        reserveType: "warmup" as const,
        sets: 1,
        repRange: "4",
        rirTarget: 5,
        restSeconds: 90,
        loadKg: suggestedLoad != null ? Math.round(suggestedLoad * 0.7 * 2) / 2 : null,
      });
    }

    blocks.push({
      reserveType: "work" as const,
      sets: workSets,
      repRange: ex.pattern === "composto" ? "6-10" : "10-15",
      // Composto pesado fica 1-2 reps da falha (o custo de falhar num agachamento é alto); isolado
      // pode ir mais perto. É o alvo que a pergunta de adesão ("chegou perto da falha?") cobra.
      /* RIR base + o extra de fadiga. Sem o extra, "recuperação ruim" cortava
       * volume e mandava ir a 1-2 reps da falha do mesmo jeito — que é o pior
       * dos dois mundos num fim de cutting: menos estímulo total e a mesma
       * demanda neural e articular por série. */
      rirTarget: (ex.pattern === "composto" ? 2 : 1) + fadiga.rirExtra,
      // composto grande pede 3 min; isolado recupera em ~90 s. É o que torna o
      // teto de ~22 séries/sessão traduzível em tempo real de academia.
      restSeconds: ex.pattern === "composto" ? 180 : 90,
      // carga sugerida a partir do histórico logado (ver suggestLoadProgression em
      // trainingPeriodization.ts); null quando ainda não há log desse exercício
      loadKg: suggestedLoad,
    });

    return { exerciseId: ex.id, blocks };
  });
}

/** Um dia só aceita músculo do seu padrão de movimento. `Upper`, `Lower` e
 * `Corpo inteiro` aceitam o que couber na metade do corpo que nomeiam. */
function diaAceita(label: string, muscle: MuscleGroup): boolean {
  const PUSH: MuscleGroup[] = ["peito", "ombro", "triceps"];
  const PULL: MuscleGroup[] = ["costas", "deltoide_posterior", "biceps", "antebraco", "lombar"];
  const LEGS: MuscleGroup[] = ["quadriceps", "posterior_coxa", "gluteo", "panturrilha"];
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

  return template.map((day) => {
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

    for (const muscle of orderedMuscles) {
      const setsAjustado = Math.min(
        MAX_SETS_PER_MUSCLE_PER_SESSION,
        Math.round((desejadoPorGrupo.get(muscle) ?? 0) * (escalaPorGrupo.get(muscle) ?? 1))
      );
      if (setsAjustado <= 0) continue;

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
    const ordenados = items
      .map((it, ordem) => ({ it, ordem, isolado: exerciseById(it.exerciseId)?.pattern === "isolado" ? 1 : 0 }))
      .sort((a, b) => a.isolado - b.isolado || a.ordem - b.ordem)
      .map((x) => x.it);

    return { label: day.label, items: ordenados };
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
      ? "Semana de deload — volume pela metade, RIR 2 pontos mais longe da falha, sem agachamento nem levantamento terra com barra, e concentrada em 3 sessões. Cortar série mantendo RIR 1 não recupera nada: é uma semana normal mais curta."
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
