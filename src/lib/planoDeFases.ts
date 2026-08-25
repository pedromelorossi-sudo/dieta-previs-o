import {
  Sex,
  DietPath,
  PATH_LABEL,
  classifyPathFromBf,
  macroTargetsForStrategy,
  bfThresholdsFor,
  estimateFfmi,
  monthlyLeanGainCeilingKg,
} from "./bodyComposition";

/**
 * PLANEJAMENTO DE FASES — o roteiro de vários meses, não a decisão do mês.
 *
 * O que existia antes (`planMonths` em periodization.ts) projetava 6 meses, mas com três limitações que
 * a auditoria pegou: (1) o TDEE ficava CONGELADO no valor de hoje pelos 6 meses inteiros, quando na
 * prática ele sobe com massa magra ganha e cai com peso perdido; (2) não modelava massa magra, então um
 * bulking projetado parecia ganho de gordura puro e não havia motivo pra fazê-lo; (3) devolvia uma lista
 * de meses soltos, sem dizer QUANDO e POR QUE a estratégia mudaria — o usuário via "mês 4: cutting" sem
 * saber que gatilho disparou aquilo.
 *
 * Aqui o corpo é simulado mês a mês com repartição gordura/magra limitada pelo teto natural de ganho
 * (ver monthlyLeanGainCeilingKg), o TDEE é RECALCULADO a cada mês a partir da nova composição, e os
 * meses são agrupados em FASES com o gatilho de entrada e o de saída explicitados. O resultado é o que
 * o usuário precisa pra decidir se topa o plano: "você entra em superávit agora, sobe até ~16% de
 * gordura por volta do mês 7, e aí corta por ~3 meses de volta pra 13%".
 *
 * É uma projeção de trabalho com premissas explícitas, não uma promessa: cada ciclo real com fotos
 * recalibra a composição de verdade e pode mudar a rota. É exatamente por isso que cada fase carrega
 * `oQuePodeMudar`.
 */

const WEEKS_PER_MONTH = 4.345;

/** Energia por kg de variação de peso, por tecido. Tecido adiposo ~7700kcal/kg é a convenção clássica;
 * tecido magro é bem mais barato (~1800kcal/kg) porque é majoritariamente água e proteína. */
const KCAL_PER_KG_FAT = 7700;
const KCAL_PER_KG_LEAN = 1800;

/** Em déficit, a fração da perda que é gordura — e ela DEPENDE da agressividade do déficit. Garthe et
 * al. 2011 (DOI 10.1123/ijsnem.21.2.97): a ~0,7%/semana a massa magra subiu durante o corte; a
 * ~1,4%/semana estagnou, com perda de gordura parecida. Ou seja: cortar mais rápido não perde mais
 * gordura, perde mais músculo. Um corte de retorno leve preserva quase tudo; um corte profundo paga
 * mais caro. Helms et al. 2014 (DOI 10.1186/1550-2783-11-20) é a base da faixa. */
function fatShareOfLoss(deficitFraction: number): number {
  const intensidade = Math.max(0, Math.min(1, Math.abs(deficitFraction) / 0.2));
  return 0.92 - 0.1 * intensidade; // ~92% de gordura num corte leve, ~82% num corte cheio
}

export interface FaseMes {
  monthIndex: number;
  label: string;
  phase: DietPath;
  phaseLabel: string;
  /** TDEE estimado para ESTE mês, recalculado a partir da composição projetada */
  tdee: number;
  recommendedKcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  startWeightKg: number;
  endWeightKg: number;
  startBfPercent: number;
  endBfPercent: number;
  /** composição no INÍCIO do mês */
  leanMassStartKg: number;
  fatMassStartKg: number;
  /** composição no FIM do mês */
  leanMassKg: number;
  fatMassKg: number;
}

export interface Fase {
  index: number;
  phase: DietPath;
  phaseLabel: string;
  /** "retorno" = corte curto pós-bulking pra voltar ao ponto de partida do próximo ganho;
   *  "profundo" = corte de quem chega bem acima da faixa do ciclo. Só existe em fases de déficit. */
  subtipoCorte?: "retorno" | "profundo";
  /** A FAIXA DE %BF é o que define a fase — é a condição de término, e o único critério real. */
  bfAlvoTermino: number;
  /** Mês estimado de início/fim e duração são CONSEQUÊNCIA da velocidade projetada, não a definição da
   * fase. Se a pessoa responder mais rápido ou mais devagar que o projetado, esses números mudam e a
   * fase continua a mesma — ela só termina quando o %BF chegar em `bfAlvoTermino`. Nunca apresentar o
   * mês como prazo. */
  mesInicioEstimado: number;
  mesFimEstimado: number;
  duracaoMesesEstimada: number;
  /** o que fez esta fase COMEÇAR */
  gatilhoEntrada: string;
  /** o que vai fazer esta fase TERMINAR — a condição de saída, não uma data */
  gatilhoSaida: string;
  /** o que se espera que aconteça com o corpo nesta fase */
  objetivo: string;
  pesoInicioKg: number;
  pesoFimKg: number;
  bfInicioPercent: number;
  bfFimPercent: number;
  magraInicioKg: number;
  magraFimKg: number;
  kcalInicio: number;
  kcalFim: number;
  /** o que pode invalidar esta parte do plano */
  oQuePodeMudar: string;
}

export interface PlanoDeFases {
  meses: FaseMes[];
  fases: Fase[];
  /** o resumo em uma frase, pra abrir a tela */
  resumo: string;
  /** premissas que o usuário precisa conhecer pra ler o plano com o ceticismo certo */
  premissas: string[];
}

export interface PlanoDeFasesInput {
  currentWeightKg: number;
  currentBfPercent: number;
  heightCm: number;
  sex: Sex;
  /** TDEE conhecido HOJE — a projeção parte dele e o ajusta mês a mês pela mudança de composição */
  tdee: number;
  monthsAhead: number;
  /** sinais de recuperação ruim do ciclo atual (ver scoreRecoverySignals) */
  recoveryScore?: number;
  /** fase do ciclo atual, pra a histerese não trocar de fase logo no primeiro mês projetado */
  initialPath?: DietPath;
}

/** Quanto o TDEE muda quando a composição muda. Não recalcula a fórmula inteira (NEAT e treino são
 * premissas do usuário, não mudam com o peso projetado) — ajusta a parcela que depende de massa: o
 * componente Katch-McArdle é 21,6kcal por kg de massa magra, e o custo de mover o corpo escala com o
 * peso total. Usar a fórmula completa daria falsa precisão numa projeção; usar TDEE fixo, que era o que
 * havia antes, dá erro crescente ao longo dos meses. */
function tdeeAjustado(tdeeBase: number, leanDeltaKg: number, weightDeltaKg: number): number {
  const KCAL_POR_KG_MAGRA = 21.6;
  const KCAL_POR_KG_PESO_MOVIMENTO = 8; // NEAT + EAT escalam com massa transportada
  return tdeeBase + leanDeltaKg * KCAL_POR_KG_MAGRA + weightDeltaKg * KCAL_POR_KG_PESO_MOVIMENTO;
}

function faseObjetivo(phase: DietPath, subtipo?: "retorno" | "profundo"): string {
  if (phase === "bulking") return "Ganhar massa magra com o mínimo de gordura junto.";
  if (phase === "cutting") {
    return subtipo === "retorno"
      ? "Voltar ao ponto de partida do próximo ganho perdendo o mínimo de massa magra — déficit leve, não agressivo. O objetivo aqui não é secar, é devolver a gordura acumulada no superávit."
      : "Reduzir gordura até entrar na faixa do ciclo, preservando a massa magra.";
  }
  return "Manutenção — estabilizar antes da próxima fase, sem forçar ganho nem perda.";
}

export function planejarFases(input: PlanoDeFasesInput): PlanoDeFases {
  const { currentWeightKg, currentBfPercent, heightCm, sex, monthsAhead, recoveryScore = 0, initialPath } = input;
  const limites = bfThresholdsFor(sex);

  let fatKg = currentWeightKg * (currentBfPercent / 100);
  let leanKg = currentWeightKg - fatKg;
  let tdeeBase = input.tdee;
  let previousPath: DietPath | undefined = initialPath;

  const meses: FaseMes[] = [];

  for (let i = 1; i <= monthsAhead; i++) {
    const weightKg = fatKg + leanKg;
    const bfPercent = (fatKg / weightKg) * 100;

    /* O FFMI muda A CADA MÊS conforme a massa magra sobe — então a janela de
       recomposição se fecha sozinha ao longo da projeção, que é o comportamento
       certo: quem recompõe hoje vai precisar alternar fases mais adiante. */
    const { path, surplusPercent } = classifyPathFromBf(
      bfPercent,
      sex,
      recoveryScore,
      previousPath,
      "alta",
      estimateFfmi(leanKg, heightCm)
    );
    previousPath = path;

    const tdee = tdeeBase;
    const recommendedKcal = tdee * (1 + surplusPercent);
    const { proteinPerKg, fatPerKg } = macroTargetsForStrategy(path);
    const proteinG = weightKg * proteinPerKg;
    const fatG = weightKg * fatPerKg;
    const carbG = Math.max(0, (recommendedKcal - proteinG * 4 - fatG * 9) / 4);

    // ---- avança o corpo um mês ----
    const balancoMes = tdee * surplusPercent * 7 * WEEKS_PER_MONTH;
    let deltaLean: number;
    let deltaFat: number;

    if (balancoMes > 0) {
      // Em superávit, o ganho de massa magra tem TETO — não é o superávit que manda, é a capacidade de
      // construir tecido. O que sobra vira gordura. É isso que faz a projeção mostrar o bulking ficando
      // progressivamente pior e justifica encerrá-lo num %BF alvo em vez de "ir até cansar".
      const tetoMagra = monthlyLeanGainCeilingKg(leanKg, heightCm);
      deltaLean = Math.min(tetoMagra, (balancoMes * 0.35) / KCAL_PER_KG_LEAN);
      deltaFat = (balancoMes - deltaLean * KCAL_PER_KG_LEAN) / KCAL_PER_KG_FAT;
    } else if (balancoMes < 0) {
      const shareGordura = fatShareOfLoss(surplusPercent);
      const energiaEfetivaPorKg = shareGordura * KCAL_PER_KG_FAT + (1 - shareGordura) * KCAL_PER_KG_LEAN;
      const deltaTotal = balancoMes / energiaEfetivaPorKg;
      deltaFat = deltaTotal * shareGordura;
      deltaLean = deltaTotal * (1 - shareGordura);
    } else {
      // manutenção: recomposição lenta é possível com treino de força, mas modesta
      deltaLean = Math.min(0.15, monthlyLeanGainCeilingKg(leanKg, heightCm) * 0.25);
      deltaFat = -deltaLean * 0.8;
    }

    const novoLean = Math.max(30, leanKg + deltaLean);
    const novoFat = Math.max(currentWeightKg * 0.03, fatKg + deltaFat);
    const novoPeso = novoLean + novoFat;

    meses.push({
      monthIndex: i,
      label: `Mês ${i}`,
      phase: path,
      phaseLabel: PATH_LABEL[path],
      tdee,
      recommendedKcal,
      proteinG,
      fatG,
      carbG,
      startWeightKg: weightKg,
      endWeightKg: novoPeso,
      startBfPercent: bfPercent,
      endBfPercent: (novoFat / novoPeso) * 100,
      leanMassStartKg: leanKg,
      fatMassStartKg: fatKg,
      leanMassKg: novoLean,
      fatMassKg: novoFat,
    });

    // TDEE do PRÓXIMO mês incorpora a mudança de composição — antes ficava congelado
    tdeeBase = tdeeAjustado(tdeeBase, novoLean - leanKg, novoPeso - weightKg);
    leanKg = novoLean;
    fatKg = novoFat;
  }

  // ---------- agrupa meses em fases ----------
  const fases: Fase[] = [];
  for (const mes of meses) {
    const atual = fases[fases.length - 1];
    if (atual && atual.phase === mes.phase) {
      atual.mesFimEstimado = mes.monthIndex;
      atual.duracaoMesesEstimada = atual.mesFimEstimado - atual.mesInicioEstimado + 1;
      atual.pesoFimKg = mes.endWeightKg;
      atual.bfFimPercent = mes.endBfPercent;
      atual.magraFimKg = mes.leanMassKg;
      atual.kcalFim = mes.recommendedKcal;
      continue;
    }

    const anterior = atual;
    fases.push({
      index: fases.length + 1,
      phase: mes.phase,
      phaseLabel: mes.phaseLabel,
      bfAlvoTermino:
        mes.phase === "bulking" ? limites.cutAbove : mes.phase === "cutting" ? limites.bulkBelow : Math.round(mes.startBfPercent * 10) / 10,
      mesInicioEstimado: mes.monthIndex,
      mesFimEstimado: mes.monthIndex,
      duracaoMesesEstimada: 1,
      gatilhoEntrada: gatilhoDeEntrada(mes.phase, mes.startBfPercent, limites, anterior),
      gatilhoSaida: gatilhoDeSaida(mes.phase, limites, sex),
      subtipoCorte: mes.phase === "cutting" ? (mes.startBfPercent <= limites.cutAbove + 1.5 ? "retorno" : "profundo") : undefined,
      objetivo: faseObjetivo(mes.phase, mes.phase === "cutting" ? (mes.startBfPercent <= limites.cutAbove + 1.5 ? "retorno" : "profundo") : undefined),
      pesoInicioKg: mes.startWeightKg,
      pesoFimKg: mes.endWeightKg,
      bfInicioPercent: mes.startBfPercent,
      bfFimPercent: mes.endBfPercent,
      magraInicioKg: mes.leanMassStartKg,
      magraFimKg: mes.leanMassKg,
      kcalInicio: mes.recommendedKcal,
      kcalFim: mes.recommendedKcal,
      oQuePodeMudar: oQuePodeMudar(mes.phase),
    });
  }

  // Manutenção de 1 mês entre duas fases reais não é uma fase — é a virada contínua atravessando o
  // zero. Sem absorvê-la, um plano de 24 meses vira 12 "fases" e o roteiro fica ilegível justamente
  // onde precisa ser claro. Ela é dobrada na fase seguinte, cujo início recua pra cobrir o mês.
  for (let i = fases.length - 2; i >= 1; i--) {
    const meio = fases[i];
    const proxima = fases[i + 1];
    const anterior = fases[i - 1];
    if (meio.phase !== "normocalorico" || meio.duracaoMesesEstimada > 1) continue;
    if (anterior.phase === "normocalorico" || proxima.phase === "normocalorico") continue;
    proxima.mesInicioEstimado = meio.mesInicioEstimado;
    proxima.duracaoMesesEstimada = proxima.mesFimEstimado - proxima.mesInicioEstimado + 1;
    proxima.pesoInicioKg = meio.pesoInicioKg;
    proxima.bfInicioPercent = meio.bfInicioPercent;
    proxima.magraInicioKg = meio.magraInicioKg;
    proxima.kcalInicio = meio.kcalInicio;
    proxima.gatilhoEntrada = `${proxima.gatilhoEntrada} O primeiro mês desta fase é a virada: a prescrição atravessa de uma estratégia pra outra de forma contínua, sem salto de calorias.`;
    fases.splice(i, 1);
  }
  fases.forEach((f, i) => (f.index = i + 1));

  // a última fase pode estar truncada pelo horizonte de projeção, e isso precisa ficar claro
  const ultima = fases[fases.length - 1];
  if (ultima && ultima.mesFimEstimado === monthsAhead) {
    ultima.gatilhoSaida += ` A projeção termina no mês ${monthsAhead} antes de essa condição ser atingida — a fase continua além do horizonte mostrado.`;
  }

  const primeira = fases[0];
  const ultimoMes = meses[meses.length - 1];
  const descreveFase = (f: Fase) =>
    `${f.phaseLabel.split(" ")[0]}${f.subtipoCorte === "retorno" ? " de retorno" : ""} até ${f.bfAlvoTermino}%BF (~${f.duracaoMesesEstimada}m)`;
  const mostradas = fases.slice(0, 4).map(descreveFase).join(" → ");
  const resumo = primeira
    ? `${mostradas}${fases.length > 4 ? ", e o ciclo se repete" : ""}. ` +
      `Em ${monthsAhead} meses a projeção chega a ${ultimoMes.endWeightKg.toFixed(1)}kg com ${ultimoMes.endBfPercent.toFixed(1)}% de gordura e ` +
      `${ultimoMes.leanMassKg.toFixed(1)}kg de massa magra (${(ultimoMes.leanMassKg - (currentWeightKg - currentWeightKg * (currentBfPercent / 100))).toFixed(1)}kg a mais que hoje). ` +
      `O que encerra cada fase é o percentual de gordura; os meses são estimativa da velocidade projetada.`
    : "Sem projeção disponível.";

  const ffmiAtual = estimateFfmi(currentWeightKg - currentWeightKg * (currentBfPercent / 100), heightCm);
  const premissas = [
    "O QUE ENCERRA CADA FASE É O %BF, NÃO O CALENDÁRIO. Os meses mostrados são estimativa da velocidade projetada — se você responder mais rápido ou mais devagar, os meses mudam e a fase continua a mesma até o percentual de gordura chegar no alvo.",
    `Superávit entra abaixo de ${limites.bulkBelow}% de gordura e acumula até ~${limites.cutAbove}%; déficit entra aí e corta de volta. ATENÇÃO: não existe estudo publicado que estabeleça esses dois pontos — a literatura define o TAMANHO do superávit e do déficit, não em que %BF virar a chave. Estes limiares são decisão de design do app, ajustável, e não devem ser lidos como recomendação de paper.`,
    `Teto de ganho de massa magra escalado pelo seu FFMI atual (${ffmiAtual.toFixed(1)}, teto natural ~25 segundo Kouri et al. 1995): quanto mais perto do teto, mais devagar o ganho, por mais superávit que se coma. Garthe et al. 2013 mediu isso: +600kcal/dia rendeu o MESMO ganho de massa magra e cinco vezes mais gordura.`,
    "Corte de retorno usa déficit LEVE (~12%); corte de quem chega bem acima da faixa vai até 20%. Base: no ensaio randomizado de Garthe et al. 2011, atletas que cortaram 19% da ingestão GANHARAM 2,1% de massa magra durante a perda de peso e subiram no 1RM, enquanto os que cortaram 30% não ganharam nada — e perderam a MESMA gordura. Cortar mais rápido não entrega mais resultado.",
    "A projeção assume 82-92% da perda como gordura, conforme a agressividade do déficit, o que exige proteína alta e treino de força mantido (Helms et al. 2014). Adesão pior muda essa fração e o plano inteiro.",
    "O TDEE é recalculado a cada mês projetado pela mudança de composição, mas NEAT e treino são mantidos como você informou hoje. Mudar rotina, emprego ou frequência de treino refaz a conta.",
    "Cada ciclo real com fotos recalibra a composição de verdade. Esta é a rota planejada, não uma promessa — o propósito dela é você saber onde está indo e o que dispara cada mudança.",
  ];

  return { meses, fases, resumo, premissas };
}

function gatilhoDeEntrada(
  phase: DietPath,
  bfPercent: number,
  limites: { bulkBelow: number; cutAbove: number },
  anterior?: Fase
): string {
  const vindoDe = anterior ? ` Vem de ${anterior.duracaoMesesEstimada} ${anterior.duracaoMesesEstimada === 1 ? "mês" : "meses"} de ${anterior.phaseLabel.toLowerCase()}.` : "";
  if (phase === "bulking") {
    return `Gordura corporal em ${bfPercent.toFixed(1)}%, dentro da faixa de superávit (abaixo de ${limites.bulkBelow}%) — é o ponto em que construir massa é mais eficiente e o excedente tende menos a virar gordura.${vindoDe}`;
  }
  if (phase === "cutting") {
    return `Gordura corporal em ${bfPercent.toFixed(1)}%, acima do teto de ${limites.cutAbove}% — continuar em superávit a partir daqui piora a partição de nutriente e alonga o corte seguinte.${vindoDe}`;
  }
  return `Gordura corporal em ${bfPercent.toFixed(1)}%, na faixa intermediária (${limites.bulkBelow}–${limites.cutAbove}%) — manutenção enquanto atravessa a zona entre as duas fases.${vindoDe}`;
}

function gatilhoDeSaida(phase: DietPath, limites: { bulkBelow: number; cutAbove: number }, sex: Sex): string {
  const unidade = sex === "masculino" ? "" : " (faixa feminina)";
  if (phase === "bulking") {
    return `Termina quando a gordura corporal chegar a ~${limites.cutAbove}%${unidade}. Não é uma data: se a leitura de foto mostrar que chegou antes, encerra antes; se o ganho vier mais limpo que o projetado, dura mais.`;
  }
  if (phase === "cutting") {
    return `Termina quando a gordura corporal voltar a ~${limites.bulkBelow}%${unidade} — e aí recomeça o superávit. Termina antes se aparecerem sinais de déficit mal tolerado (carga caindo na academia, treinos pulados por cansaço, sono ruim, ou perda de peso às custas de massa magra): nesse caso o déficit é suavizado ou zerado automaticamente e a fase se estende.`;
  }
  return `Termina ao cruzar ${limites.bulkBelow}% (entra em superávit) ou ${limites.cutAbove}% (entra em déficit)${unidade}.`;
}

function oQuePodeMudar(phase: DietPath): string {
  if (phase === "bulking") {
    return "Se o peso subir mais rápido que o projetado, é sinal de que o excedente está indo pra gordura — o ciclo seguinte corta o superávit sozinho. Se a massa magra não subir por 2 ciclos limpos seguidos, o problema é treino ou recuperação, não caloria.";
  }
  if (phase === "cutting") {
    return "Se a carga na academia cair, o sono piorar ou treinos forem pulados por cansaço, o déficit é reduzido pela metade ou zerado no ciclo seguinte — a fase se estende em vez de apertar. Perda de peso às custas de massa magra dispara a mesma suavização: num corte de retorno, perder músculo é o único jeito de falhar.";
  }
  return "Uma leitura de foto diferente do projetado antecipa ou adia a próxima fase — a manutenção é a zona de transição, e é a mais sensível à precisão da leitura.";
}


// ---------------------------------------------------------------------------
// Confronto do plano com a realidade
// ---------------------------------------------------------------------------

export interface MesProjetado {
  mes: number;
  fase: DietPath;
  peso: number;
  bf: number;
  kcal: number;
}

export interface ConfrontoPlano {
  /** quantos meses se passaram desde o plano que está sendo confrontado */
  mesesDecorridos: number;
  pesoProjetado: number;
  pesoReal: number;
  bfProjetado: number;
  bfReal: number;
  fasePrevista: DietPath;
  faseAtual: DietPath;
  /** true quando a rota real ainda cabe dentro da margem do plano */
  dentroDoPlano: boolean;
  veredito: string;
}

/** Compara o que o plano de um ciclo anterior projetava para HOJE com o que de fato aconteceu.
 *
 * Sem isto, o plano de fases era regenerado do zero a cada ciclo e nunca era confrontado com o
 * resultado — uma projeção bonita que nunca prestava contas. O valor não é acertar a previsão: é
 * detectar cedo que a rota divergiu, e dizer se a causa provável é a estimativa (peso seguiu o plano,
 * %BF não) ou a execução (peso não seguiu o plano).
 *
 * As margens são deliberadamente largas — ±1,5kg e ±1,5pp por mês decorrido, com teto. Um plano de
 * meses não deve ser declarado "errado" por uma diferença que cabe no ruído da balança e da leitura de
 * foto (ver Protocolo de %BF).
 */
export function confrontarPlano(
  planoAnterior: MesProjetado[],
  mesesDecorridos: number,
  pesoRealKg: number,
  bfRealPercent: number,
  faseAtual: DietPath
): ConfrontoPlano | null {
  if (!planoAnterior || planoAnterior.length === 0 || mesesDecorridos < 1) return null;

  const alvo = planoAnterior.find((m) => m.mes === Math.round(mesesDecorridos)) ?? planoAnterior[planoAnterior.length - 1];
  if (!alvo) return null;

  const margemPeso = Math.min(4, 1.5 * mesesDecorridos);
  const margemBf = Math.min(4, 1.5 * mesesDecorridos);
  const difPeso = pesoRealKg - alvo.peso;
  const difBf = bfRealPercent - alvo.bf;

  const pesoOk = Math.abs(difPeso) <= margemPeso;
  const bfOk = Math.abs(difBf) <= margemBf;
  const dentroDoPlano = pesoOk && bfOk;

  const sinal = (v: number) => (v >= 0 ? "+" : "");
  let veredito: string;
  if (dentroDoPlano) {
    veredito = `A rota está seguindo o plano: projetava ${alvo.peso.toFixed(1)}kg com ${alvo.bf.toFixed(1)}% de gordura para este ponto, e você está em ${pesoRealKg.toFixed(1)}kg com ${bfRealPercent.toFixed(1)}%.`;
  } else if (!pesoOk && bfOk) {
    veredito = `O peso divergiu do plano (${sinal(difPeso)}${difPeso.toFixed(1)}kg em relação aos ${alvo.peso.toFixed(1)}kg projetados) mas a gordura corporal está na rota. Isso costuma ser execução — ingestão real diferente da prescrita — mais do que erro de estimativa.`;
  } else if (pesoOk && !bfOk) {
    veredito = `O peso está na rota, mas a gordura corporal divergiu (${sinal(difBf)}${difBf.toFixed(1)} pontos em relação aos ${alvo.bf.toFixed(1)}% projetados). Isso aponta para a repartição entre magra e gordura ter sido diferente do assumido — treino e proteína são as alavancas aqui, não a caloria.`;
  } else {
    veredito = `Peso e gordura corporal divergiram do plano (${sinal(difPeso)}${difPeso.toFixed(1)}kg e ${sinal(difBf)}${difBf.toFixed(1)} pontos). O plano foi refeito a partir dos dados de hoje; se a divergência se repetir no próximo ciclo, o problema está na estimativa de gasto, não numa oscilação isolada.`;
  }

  if (alvo.fase !== faseAtual) {
    veredito += ` A fase também mudou em relação ao previsto (plano: ${alvo.fase}, atual: ${faseAtual}) — o gatilho é o %BF, então a fase acompanha a composição real, não o calendário do plano.`;
  }

  return {
    mesesDecorridos,
    pesoProjetado: alvo.peso,
    pesoReal: pesoRealKg,
    bfProjetado: alvo.bf,
    bfReal: bfRealPercent,
    fasePrevista: alvo.fase,
    faseAtual,
    dentroDoPlano,
    veredito,
  };
}
