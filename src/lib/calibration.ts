import { GainComposition } from "./types";

/** Fatos objetivos sobre a adesão à dieta do ciclo anterior — nenhum campo é autoavaliação de "quão
 * disciplinado" a pessoa foi, todos são coisas contáveis ou observáveis. Usado só pra decidir se o ciclo
 * é "limpo" o suficiente pra entrar na calibração da fórmula (ver assessDietCleanliness). */
export interface DietCleanlinessInput {
  adherence?: "seguiu" | "comeu_mais" | "comeu_menos" | "nao_acompanhou";
  daysFollowedPerWeek?: number;
  trackingMethod?: "pesei_a_maioria" | "estimei_de_olho";
  weighInConsistent?: boolean;
  alcoholDosesPerWeek?: number;
  recoveryScore?: number;
}

export interface CleanlinessResult {
  clean: boolean;
  reasons: string[];
}

/** Decide se o ciclo anterior é confiável o bastante pra ensinar alguma coisa sobre a fórmula, ou se a
 * divergência (se houver) provavelmente é só adesão ruim/dado ruim, não erro de fórmula. Base científica
 * de cada critério:
 * - Lichtman et al. 1992, NEJM (DOI 10.1056/NEJM199212313272701): pacientes que juravam "resistência a
 *   dieta" tinham gasto energético NORMAL (dentro de 5% do previsto) — o problema real era subestimar a
 *   ingestão relatada em 47±16% e superestimar exercício em 51±75%. Autorrelato sem medição real é o
 *   maior confundidor conhecido nessa área, não a fórmula.
 * - Frankenfield et al. 2005, J Am Diet Assoc (DOI 10.1016/j.jada.2005.02.005): mesmo a melhor equação
 *   disponível (Mifflin-St Jeor) erra fora de 10% numa fração real dos indivíduos — divergência pequena
 *   isolada não é automaticamente "a fórmula está errada", só compensação real depois de N ciclos limpos
 *   concordando na mesma direção é sinal confiável.
 */
export function assessDietCleanliness(input: DietCleanlinessInput): CleanlinessResult {
  const reasons: string[] = [];
  let clean = true;

  if (input.adherence == null) {
    clean = false;
    reasons.push("sem resposta de adesão à dieta");
  } else if (input.adherence !== "seguiu") {
    clean = false;
    reasons.push("não seguiu a prescrição de perto");
  }

  if (input.daysFollowedPerWeek != null && input.daysFollowedPerWeek < 6) {
    clean = false;
    reasons.push(`só seguiu à risca ${input.daysFollowedPerWeek}/7 dias da semana`);
  }

  if (input.trackingMethod === "estimei_de_olho") {
    clean = false;
    reasons.push("estimou porções de olho em vez de pesar (autorrelato sem medição subestima ingestão sistematicamente — Lichtman et al. 1992)");
  }

  if (input.weighInConsistent === false) {
    clean = false;
    reasons.push("pesagem corporal inconsistente (balança/horário/jejum variando) — ruído direto no delta de peso usado no retrocálculo");
  }

  if ((input.alcoholDosesPerWeek ?? 0) >= 4) {
    clean = false;
    reasons.push("consumo de álcool relevante no período — calorias líquidas frequentemente não contabilizadas no autorrelato");
  }

  if ((input.recoveryScore ?? 0) >= 2) {
    clean = false;
    reasons.push("sinais de recuperação ruim no ciclo (possível déficit mal tolerado, não erro de fórmula)");
  }

  return { clean, reasons };
}

/** Mesmo raciocínio do lado do treino — sessões completadas abaixo do planejado, exercícios/cargas
 * reduzidos, ou esforço abaixo do prescrito nas séries de trabalho (RIR maior que o assumido) quebram a
 * premissa por trás do EAT estimado (ver EAT - Treino Principal e Outro Esporte), então também sujam o
 * sinal de calibração. */
export interface TrainingCleanlinessInput {
  completedSessions?: number;
  plannedSessions?: number;
  keptExercisesAndLoads?: "seguiu_de_perto" | "trocou_mas_manteve_volume" | "reduziu_bastante";
  effortNearFailure?: "sim" | "nao";
  /** sessões de CARDIO completadas de verdade no período — fato contável */
  cardioSessionsCompleted?: number;
  /** sessões de cardio que a prescrição pedia no período (calculado, não perguntado) */
  cardioSessionsPlanned?: number;
}

export function assessTrainingCleanliness(input: TrainingCleanlinessInput): CleanlinessResult {
  const reasons: string[] = [];
  let clean = true;

  if (input.plannedSessions != null && input.plannedSessions > 0) {
    const rate = (input.completedSessions ?? 0) / input.plannedSessions;
    if (rate < 0.8) {
      clean = false;
      reasons.push(`completou só ${(rate * 100).toFixed(0)}% das sessões de treino planejadas`);
    }
  }

  if (input.keptExercisesAndLoads === "reduziu_bastante") {
    clean = false;
    reasons.push("reduziu bastante exercícios/cargas em relação ao sugerido");
  }

  if (input.effortNearFailure === "nao") {
    clean = false;
    reasons.push("não chegou perto da falha nas séries de trabalho — o EAT estimado assume esforço próximo do prescrito");
  }

  // O cardio era o único bloco de prescrição sem nenhuma medição de volta: o app mandava 126-167min/semana
  // e nada no sistema sabia se aquilo tinha acontecido. Como o TDEE empírico é retrocalculado da resposta
  // do peso, um cardio prescrito e não feito aparece como "metabolismo mais lento" — o algoritmo corrige
  // a fórmula por um erro que é de execução. Por isso entra nos critérios de ciclo limpo, com o mesmo
  // limiar de 80% usado nas sessões de força.
  if (input.cardioSessionsPlanned != null && input.cardioSessionsPlanned > 0) {
    const rate = (input.cardioSessionsCompleted ?? 0) / input.cardioSessionsPlanned;
    if (rate < 0.8) {
      clean = false;
      reasons.push(
        `completou só ${(rate * 100).toFixed(0)}% das sessões de cardio prescritas — o gasto do cardio entra no balanço energético do período, então não fazê-lo desloca o TDEE retrocalculado`
      );
    }
  }

  return { clean, reasons };
}

/** Checagem de autoconsistência entre %BF lido na foto, variação de peso e a composição do ganho/perda
 * que a própria IA decidiu no mesmo ciclo — não depende de nenhuma medição externa (DEXA etc.), só
 * verifica se as três respostas da mesma chamada de visão fazem sentido juntas. Ex: se a IA disse que o
 * ganho foi "quase todo músculo" mas o %BF subiu de forma relevante, isso é uma contradição interna —
 * um dos dois números provavelmente está errado nesse ciclo específico. */
export function checkBfConsistency(
  gainComposition: GainComposition,
  weightDeltaKg: number,
  bfDeltaPercentPoints: number,
  /** peso do ciclo anterior — permite fechar o balanço de massa (gordura vs. magra) em vez de só
   * comparar sinais. Opcional pra não quebrar quem chama sem ele. */
  previousWeightKg?: number,
  previousBfPercent?: number
): { consistent: boolean; note: string } {
  const TOLERANCE = 1.0; // pontos percentuais — ruído normal de leitura/água

  // --- Balanço de massa, quando dá pra fechar ---
  // A checagem por sinais sozinha deixava passar combinações fisicamente estranhas: um ciclo em déficit
  // podia implicar -3,6kg de gordura E +1,0kg de massa magra ao mesmo tempo e ser marcado "consistente",
  // porque peso caiu e %BF caiu — os sinais batiam. Decompor a variação em gordura e magra pega isso.
  if (previousWeightKg != null && previousBfPercent != null && previousWeightKg > 0) {
    const currentWeight = previousWeightKg + weightDeltaKg;
    const currentBf = previousBfPercent + bfDeltaPercentPoints;
    if (currentWeight > 0 && currentBf > 0 && currentBf < 100) {
      const fatBefore = previousWeightKg * (previousBfPercent / 100);
      const fatAfter = currentWeight * (currentBf / 100);
      const leanBefore = previousWeightKg - fatBefore;
      const leanAfter = currentWeight - fatAfter;
      const fatDelta = fatAfter - fatBefore;
      const leanDelta = leanAfter - leanBefore;

      // Teto de ganho de massa magra em ~1 mês pra natural treinado. Iraki et al. 2019 (Sports, DOI
      // 10.3390/sports7070154) recomenda 0,25-0,5%/semana de PESO TOTAL em bulking justamente porque
      // acima disso o excedente vira gordura; 1,0kg/mês de magra já é generoso como teto de plausibilidade.
      const MAX_LEAN_GAIN_KG = 1.0;
      if (leanDelta > MAX_LEAN_GAIN_KG) {
        return {
          consistent: false,
          note: `A leitura implica ganho de ${leanDelta.toFixed(1)}kg de massa magra neste ciclo, acima do que um natural treinado ganha num mês (~1kg no melhor caso). Provavelmente o %BF deste ciclo ou do anterior está subestimado — vale conferir as fotos.`,
        };
      }
      // perder gordura e ganhar magra ao mesmo tempo é possível (recomposição), mas não em quantidade
      // grande simultaneamente
      if (fatDelta < -1.5 && leanDelta > 0.7) {
        return {
          consistent: false,
          note: `A leitura implica perder ${Math.abs(fatDelta).toFixed(1)}kg de gordura e ganhar ${leanDelta.toFixed(1)}kg de massa magra no mesmo ciclo. Recomposição existe, mas não nessa magnitude simultânea — um dos dois números de %BF provavelmente está errado.`,
        };
      }
    }
  }

  // --- Coerência entre a composição decidida e o sinal do %BF ---
  if (Math.abs(weightDeltaKg) < 0.3) {
    if (Math.abs(bfDeltaPercentPoints) > TOLERANCE) {
      return {
        consistent: false,
        note: `Peso ficou quase estável (${weightDeltaKg.toFixed(1)}kg) mas a leitura de %BF mudou ${bfDeltaPercentPoints.toFixed(1)} pontos — inconsistente, vale conferir as fotos desse ciclo.`,
      };
    }
    return { consistent: true, note: "Peso e %BF estáveis entre os ciclos, consistente." };
  }

  if (weightDeltaKg > 0) {
    if (gainComposition === "musculo" && bfDeltaPercentPoints > TOLERANCE) {
      return {
        consistent: false,
        note: `Ganho classificado como quase todo músculo, mas %BF subiu ${bfDeltaPercentPoints.toFixed(1)} pontos — esperado %BF estável ou caindo nesse cenário.`,
      };
    }
    if (gainComposition === "gordura" && bfDeltaPercentPoints < -TOLERANCE) {
      return {
        consistent: false,
        note: "Ganho classificado como quase todo gordura, mas %BF caiu — inconsistente com o peso subindo.",
      };
    }
    return { consistent: true, note: "Variação de %BF consistente com o peso e a composição do ganho decididos nesse ciclo." };
  }

  // --- Peso caindo: o ramo que antes ignorava gainComposition por completo ---
  if (bfDeltaPercentPoints > TOLERANCE) {
    return {
      consistent: false,
      note: `Peso caiu mas %BF subiu ${bfDeltaPercentPoints.toFixed(1)} pontos — só faria sentido com perda desproporcional de massa magra.`,
    };
  }
  // "gordura" numa perda significa perder quase só gordura, o que EXIGE o %BF caindo. "musculo" numa
  // perda significa perder quase só massa magra, o que exige o %BF SUBINDO — e o caso acima já barrou
  // %BF subindo. As duas checagens abaixo fechavam o ramo que antes passava tudo.
  if (gainComposition === "gordura" && bfDeltaPercentPoints > -0.2) {
    return {
      consistent: false,
      note: `Perda classificada como quase toda gordura, mas o %BF ficou parado (${bfDeltaPercentPoints.toFixed(1)} pontos) — perder ${Math.abs(weightDeltaKg).toFixed(1)}kg só de gordura teria derrubado o percentual.`,
    };
  }
  if (gainComposition === "musculo" && bfDeltaPercentPoints < -TOLERANCE) {
    return {
      consistent: false,
      note: `Perda classificada como quase toda massa magra, mas o %BF caiu ${Math.abs(bfDeltaPercentPoints).toFixed(1)} pontos — perder magra faria o percentual de gordura subir, não cair.`,
    };
  }

  return { consistent: true, note: "Variação de %BF consistente com o peso e a composição do ganho decididos nesse ciclo." };
}

export interface CalibrationAuditRow {
  date: string;
  formulaTdee: number | null;
  empiricalTdee: number | null;
  dietClean: boolean;
  trainingClean: boolean;
}

export interface TdeeCalibration {
  factor: number;
  confidence: "nenhuma" | "baixa" | "media" | "alta";
  cleanCyclesUsed: number;
  totalCyclesSeen: number;
  note: string;
}

const MIN_CLEAN_FOR_CALIBRATION = 2;
const CALIBRATION_FACTOR_MIN = 0.85;
const CALIBRATION_FACTOR_MAX = 1.15;

/** Calibração pessoal da fórmula a partir do histórico — só usa ciclos onde diet E treino foram "limpos"
 * (ver assessDietCleanliness/assessTrainingCleanliness), recência-ponderada (mesmo raciocínio de
 * estimateEmpiricalTdeeSeries em dietEngine.ts: dado mais recente pesa mais). Fator sempre travado em
 * ±15% — mesmo com histórico consistente, uma correção maior que isso é mais provável ser ruído
 * remanescente do que uma calibração real (ver Frankenfield et al. 2005 sobre a faixa de erro esperada
 * mesmo pra pessoas "normais").
 *
 * Base científica de por que isso funciona: Heinitz et al. 2020, Metabolism (DOI
 * 10.1016/j.metabol.2020.154303) mediu que a termogênese adaptativa durante déficit calórico é grande
 * (-178±137kcal/dia em média após 1 semana) mas notavelmente ESTÁVEL dentro do mesmo indivíduo ao longo
 * do tempo — ou seja, é um traço pessoal aprendível, não ruído aleatório. Drenowatz 2015, Adv Nutr (DOI
 * 10.3945/an.115.008615) reforça que a resposta compensatória a mudanças de balanço energético varia
 * muito entre indivíduos ("compensadores" vs. "não-compensadores") e defende estudar diferenças
 * individuais em vez de médias de grupo — exatamente o que essa função faz. */
export function computeTdeeCalibration(rows: CalibrationAuditRow[]): TdeeCalibration {
  const totalCyclesSeen = rows.length;
  const usable = rows.filter(
    (r) => r.dietClean && r.trainingClean && r.formulaTdee != null && r.formulaTdee > 0 && r.empiricalTdee != null && r.empiricalTdee > 0
  );

  if (usable.length < MIN_CLEAN_FOR_CALIBRATION) {
    return {
      factor: 1.0,
      confidence: "nenhuma",
      cleanCyclesUsed: usable.length,
      totalCyclesSeen,
      note:
        usable.length === 0
          ? "Nenhum ciclo limpo o suficiente ainda pra calibrar a fórmula — usando a fórmula padrão sem ajuste."
          : `Só ${usable.length} ciclo(s) limpo(s) até agora — precisa de pelo menos ${MIN_CLEAN_FOR_CALIBRATION} pra começar a calibrar com confiança.`,
    };
  }

  const sorted = [...usable].sort((a, b) => a.date.localeCompare(b.date));
  let weightedSum = 0;
  let weightSum = 0;
  sorted.forEach((row, i) => {
    const ratio = row.empiricalTdee! / row.formulaTdee!;
    const weight = i + 1; // mais recente = índice maior = mais peso
    weightedSum += ratio * weight;
    weightSum += weight;
  });
  const rawFactor = weightedSum / weightSum;
  const factor = Math.min(CALIBRATION_FACTOR_MAX, Math.max(CALIBRATION_FACTOR_MIN, rawFactor));

  const confidence: TdeeCalibration["confidence"] = usable.length >= 6 ? "alta" : usable.length >= 4 ? "media" : "baixa";
  const direction = factor > 1.02 ? "subestima" : factor < 0.98 ? "superestima" : "acerta de perto";
  const pctOff = Math.abs((factor - 1) * 100);
  const clampedNote = rawFactor !== factor ? " (ajuste limitado a ±15% de segurança)" : "";

  return {
    factor,
    confidence,
    cleanCyclesUsed: usable.length,
    totalCyclesSeen,
    note: `Baseado em ${usable.length} ciclo(s) limpo(s) de ${totalCyclesSeen} vistos: a fórmula ${direction} seu gasto real em ~${pctOff.toFixed(0)}%${clampedNote}.`,
  };
}
