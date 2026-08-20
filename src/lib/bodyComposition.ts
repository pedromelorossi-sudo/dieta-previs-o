import { ActivityLevel, ExerciseFreq, SessionDuration, OtherSportActivity, TalkTestIntensity } from "./questionnaire";

export type Sex = "masculino" | "feminino";
export type DietPath = "cutting" | "normocalorico" | "bulking";

export interface BodyCompositionInput {
  weightKg: number;
  heightCm: number;
  bodyFatPercent: number;
  age: number;
  sex: Sex;
  /** usado só como fallback quando `exerciseFreq` não é informado (ex: calculadora rápida em /estimar);
   * no fluxo principal o TDEE vem sempre dos componentes abaixo, e o nível de atividade exibido pro
   * usuário (`activityLevelDisplay`, no resultado) é CALCULADO a partir do TDEE final, não escolhido
   * de antemão — evita que o usuário precise se autoavaliar como "moderado" às cegas. */
  activityLevel?: ActivityLevel;
  exerciseFreq?: ExerciseFreq;
  sessionDuration?: SessionDuration;
  /** NEAT — quando `dailyStepsAvg` vem preenchido é o sinal primário (mais direto e objetivo que
   * qualquer questionário); senão usa o orçamento de tempo abaixo (horas/minutos/contagens reais, não
   * rótulos de "quão ativo você se sente"). Precisão importa muito aqui: bulking magro/cutting natural
   * trabalham com margens de 12-20% sobre o TDEE (ver classifyPathFromBf), então um NEAT mal estimado
   * pode inverter a estratégia sem o usuário perceber. */
  dailyStepsAvg?: number;
  sittingHoursPerDay?: number;
  standingWorkHoursPerDay?: number;
  activeCommuteMinutesPerDay?: number;
  choresHoursPerWeek?: number;
  stairFlightsPerDay?: number;
  /** esporte/atividade física regular fora da academia — capturado à parte do treino principal
   * (exerciseFreq/sessionDuration), com intensidade lida pelo talk test em vez de autoavaliação */
  otherSportActivity?: OtherSportActivity;
  otherSportSessionsPerWeek?: number;
  otherSportMinutesPerSession?: number;
  otherSportTalkTest?: TalkTestIntensity;
}

export interface BodyCompositionResult {
  bmi: number;
  leanMassKg: number;
  fatMassKg: number;
  bmrKatch: number;
  bmrMifflin: number;
  bmr: number;
  neatKcal: number;
  eatKcal: number;
  tdee: number;
  /** nível de atividade (WHO/FAO/UNU PAL = TDEE/BMR) calculado a partir do TDEE final, só pra exibição */
  activityLevelDisplay: ActivityLevel;
  path: DietPath;
  pathReason: string;
  surplusPercent: number;
  targetKcal: number;
  proteinPerKg: number;
  fatPerKg: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
};

// custo energético líquido de caminhada em ritmo casual: ~0,5kcal/kg por km (fisiologia do exercício)
// ÷ ~1100 passos/km (passada média ~0,9m) — quando o usuário sabe a própria média de passos/dia, esse é
// o sinal mais direto e objetivo de NEAT que existe, mais confiável que qualquer questionário
const KCAL_PER_STEP_PER_KG = 0.5 / 1100;

function neatFromSteps(dailyStepsAvg: number, weightKg: number): number {
  return dailyStepsAvg * KCAL_PER_STEP_PER_KG * weightKg;
}

// Sem contagem de passos, NEAT vem de um orçamento de tempo real (horas sentado, horas em pé/se
// movimentando fora da academia, minutos de deslocamento ativo, horas de tarefas domésticas, lances de
// escada) em vez de rótulos subjetivos tipo "rotina ativa" — o usuário relata fatos contáveis, o
// algoritmo é que classifica. Estrutura de domínios de tempo segue o IPAQ (Craig et al. 2003, Med Sci
// Sports Exerc, DOI 10.1249/01.MSS.0000078924.61453.FB); valores de MET vêm do Compendium of Physical
// Activities (Ainsworth et al. 2011, Med Sci Sports Exerc, DOI 10.1249/MSS.0b013e31821ece12). Cada termo
// usa (MET-1) — o incremento ACIMA do repouso — porque a taxa de repouso já está no BMR individualizado
// (Katch/Mifflin); somar o MET inteiro contaria o metabolismo basal duas vezes.
const MET_SITTING = 1.3; // sentado, trabalho leve de escritório/estudo
const MET_STANDING_WORK = 2.5; // em pé / se movimentando no trabalho ou estudo, fora da academia
const MET_ACTIVE_COMMUTE = 3.3; // caminhada em ritmo de deslocamento (~5km/h)
const MET_CHORES = 3.0; // tarefas domésticas em movimento (limpar, cozinhar, compras, carregar objetos)
const MET_STAIRS = 8.8; // subida de escada
const MINUTES_PER_FLIGHT = 0.15; // ~9s por lance de ~10-12 degraus em ritmo normal

function kcalPerMinuteAboveRest(met: number, weightKg: number): number {
  return ((met - 1) * 3.5 * weightKg) / 200;
}

interface TimeBudgetInput {
  sittingHoursPerDay?: number;
  standingWorkHoursPerDay?: number;
  activeCommuteMinutesPerDay?: number;
  choresHoursPerWeek?: number;
  stairFlightsPerDay?: number;
}

function hasTimeBudget(input: TimeBudgetInput): boolean {
  return (
    input.sittingHoursPerDay != null ||
    input.standingWorkHoursPerDay != null ||
    input.activeCommuteMinutesPerDay != null ||
    input.choresHoursPerWeek != null ||
    input.stairFlightsPerDay != null
  );
}

function neatFromTimeBudget(weightKg: number, input: TimeBudgetInput): number {
  const sitting = (input.sittingHoursPerDay ?? 0) * 60 * kcalPerMinuteAboveRest(MET_SITTING, weightKg);
  const standing = (input.standingWorkHoursPerDay ?? 0) * 60 * kcalPerMinuteAboveRest(MET_STANDING_WORK, weightKg);
  const commute = (input.activeCommuteMinutesPerDay ?? 0) * kcalPerMinuteAboveRest(MET_ACTIVE_COMMUTE, weightKg);
  const chores = ((input.choresHoursPerWeek ?? 0) / 7) * 60 * kcalPerMinuteAboveRest(MET_CHORES, weightKg);
  const stairs = (input.stairFlightsPerDay ?? 0) * MINUTES_PER_FLIGHT * kcalPerMinuteAboveRest(MET_STAIRS, weightKg);
  return sitting + standing + commute + chores + stairs;
}

interface NeatInput extends TimeBudgetInput {
  dailyStepsAvg?: number;
}

function estimateNeat(bmr: number, weightKg: number, input: NeatInput): number {
  if (input.dailyStepsAvg && input.dailyStepsAvg > 0) {
    return neatFromSteps(input.dailyStepsAvg, weightKg);
  }
  if (hasTimeBudget(input)) {
    return neatFromTimeBudget(weightKg, input);
  }
  // sem passos nem orçamento de tempo — fallback conservador equivalente a uma rotina sedentária
  return bmr * 0.15;
}

// EAT do treino principal: sessões por semana × duração real relatada × custo por minuto de musculação
// (~5kcal/min, calibrado contra a faixa de 200-400kcal/sessão de ~60min já documentada nos dados reais
// de consultoria do usuário) — mantido como está, não é o componente com baixa precisão.
const SESSIONS_PER_WEEK: Record<ExerciseFreq, number> = {
  "0": 0,
  "1-2": 1.5,
  "3-4": 3.5,
  "5+": 5.5,
};
const SESSION_MINUTES: Record<SessionDuration, number> = {
  "<30": 20,
  "30-60": 45,
  "60-90": 75,
  "90+": 105,
};
const EAT_KCAL_PER_MINUTE = 5;
const DEFAULT_SESSION_MINUTES = 45;
const TEF_FACTOR = 0.1;

// Esporte/atividade extra fora da academia — MET "moderado" de referência por atividade (Compendium
// 2011). O talk test (Reed & Pipe 2014, Curr Opin Cardiol, DOI 10.1097/HCO.0000000000000097) ajusta esse
// valor pra cima/baixo em vez de pedir pro usuário se autoavaliar como "leve/moderado/intenso" — conseguir
// conversar durante o esforço é um proxy objetivo e validado do limiar ventilatório/lactato, não uma
// opinião subjetiva sobre a própria intensidade.
const OTHER_SPORT_MET: Record<OtherSportActivity, number> = {
  corrida: 8.3,
  caminhada_rapida: 4.3,
  natacao: 6.0,
  ciclismo: 6.8,
  futebol: 7.0,
  basquete_ou_volei: 6.5,
  tenis_ou_padel: 7.3,
  luta_ou_artes_marciais: 8.0,
  danca: 4.8,
  yoga_ou_pilates: 3.0,
  hiit_ou_crossfit: 8.0,
  outro: 5.0,
};
const TALK_TEST_MULTIPLIER: Record<TalkTestIntensity, number> = {
  consegue_conversar: 0.72, // abaixo do limiar ventilatório — intensidade leve
  frases_curtas: 1.0, // próximo do limiar — intensidade moderada, valor de referência do catálogo
  nao_consegue_conversar: 1.3, // acima do limiar — intensidade vigorosa
};

interface OtherSportInput {
  otherSportActivity?: OtherSportActivity;
  otherSportSessionsPerWeek?: number;
  otherSportMinutesPerSession?: number;
  otherSportTalkTest?: TalkTestIntensity;
}

function eatFromOtherSport(weightKg: number, input: OtherSportInput): number {
  if (!input.otherSportActivity || !input.otherSportSessionsPerWeek || !input.otherSportMinutesPerSession) return 0;
  const met = OTHER_SPORT_MET[input.otherSportActivity] * TALK_TEST_MULTIPLIER[input.otherSportTalkTest ?? "frases_curtas"];
  const kcalPerMinute = (met * 3.5 * weightKg) / 200;
  return (input.otherSportSessionsPerWeek * input.otherSportMinutesPerSession * kcalPerMinute) / 7;
}

// PAL (physical activity level) = TDEE/BMR — classificação padrão FAO/WHO/UNU (2001): <1.4 sedentário,
// 1.4-1.7 leve, 1.7-2.0 moderado, 2.0+ intenso. Usado só como rótulo de exibição CALCULADO a partir do
// TDEE final — o usuário não escolhe seu próprio nível de atividade de antemão.
function activityLevelFromPAL(tdee: number, bmr: number): ActivityLevel {
  const pal = bmr > 0 ? tdee / bmr : 1.4;
  if (pal < 1.4) return "sedentario";
  if (pal < 1.7) return "leve";
  if (pal < 2.0) return "moderado";
  return "intenso";
}

function estimateTdeeFromComponents(
  bmr: number,
  weightKg: number,
  exerciseFreq: ExerciseFreq,
  sessionDuration: SessionDuration | undefined,
  neatInput: NeatInput,
  otherSportInput: OtherSportInput
) {
  const minutesPerSession = sessionDuration ? SESSION_MINUTES[sessionDuration] : DEFAULT_SESSION_MINUTES;
  const neat = estimateNeat(bmr, weightKg, neatInput);
  const eat = (SESSIONS_PER_WEEK[exerciseFreq] * minutesPerSession * EAT_KCAL_PER_MINUTE) / 7;
  const otherSportEat = eatFromOtherSport(weightKg, otherSportInput);
  const subtotal = bmr + neat + eat + otherSportEat;
  const tef = subtotal * TEF_FACTOR;
  return { neat, eat: eat + otherSportEat, tef, tdee: subtotal + tef };
}

/** limites de %BF usados para decidir o caminho — faixas de referência aproximadas, não clínicas */
/** Faixas que definem o CICLO de longo prazo, não só a decisão do mês.
 *
 * ATENÇÃO — o que a literatura sustenta e o que NÃO sustenta:
 *
 * Uma busca no PubMed por limiares de %BF para alternar entre superávit e déficit não encontrou
 * NENHUM estudo que estabeleça esses pontos. Iraki et al. 2019 (Sports, DOI 10.3390/sports7070154), a
 * revisão de referência para off-season de fisiculturistas naturais, prescreve o TAMANHO do superávit
 * (~10-20% acima da manutenção) e a TAXA de ganho (0,25-0,5% do peso/semana) — mas não define em que
 * %BF começar ou parar. Helms et al. 2014 (DOI 10.1186/1550-2783-11-20) faz o equivalente do lado do
 * corte (0,5-1% do peso/semana) e também não define limiar de gordura.
 *
 * Portanto: os números abaixo são uma DECISÃO DE DESIGN, não um valor extraído de paper. O que os
 * ancora é indireto: (a) o objetivo declarado por Iraki et al. de "aumentar massa muscular minimizando
 * ganho de gordura desnecessário", já que gordura acumulada no superávit alonga o corte seguinte e,
 * com ele, o tempo em baixa disponibilidade energética; (b) o limite superior de saúde, onde ≥25% de
 * gordura em homens e ≥35% em mulheres é o ponto de corte usado para classificar obesidade por %BF em
 * estudos de risco cardiometabólico (Phillips et al. 2013, Obesity, DOI 10.1002/oby.20263) — bem acima
 * de onde este ciclo opera; (c) a prática consolidada do esporte.
 *
 * Tratar como ponto de partida ajustável, e NÃO citar paper para justificá-los.
 *
 * O ciclo: entra em superávit em `bulkBelow`, acumula até `cutAbove`, e corta de volta até `bulkBelow`.
 * Os dois pontos são reusados nos dois sentidos e é a FASE ANTERIOR que decide qual está valendo.
 */
const BF_THRESHOLDS: Record<Sex, { bulkBelow: number; cutAbove: number }> = {
  masculino: { bulkBelow: 13, cutAbove: 16 },
  feminino: { bulkBelow: 21, cutAbove: 24 },
};

export function bfThresholdsFor(sex: Sex) {
  return BF_THRESHOLDS[sex];
}

/** FFMI — índice de massa magra ajustado pela altura. Kouri et al. 1995 (Clin J Sport Med) documenta
 * teto de ~25 em atletas naturais; é o melhor proxy disponível de "quanto ainda dá pra crescer" sem
 * perguntar tempo de treino (que o usuário estimaria mal). */
export function estimateFfmi(leanMassKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return leanMassKg / (heightM * heightM);
}

/** Teto de ganho de massa magra por mês, escalado pela margem que ainda existe até o teto natural.
 * Quem está longe do teto cresce rápido; quem está perto cresce devagar, por mais superávit que coma —
 * é isso que impede a projeção de prometer 0,9kg de músculo por mês indefinidamente.
 * Os valores são práticos (não há tabela publicada por faixa de FFMI): ~1%/mês da massa magra para
 * iniciante, caindo pra ~0,3% perto do teto. */
export function monthlyLeanGainCeilingKg(leanMassKg: number, heightCm: number): number {
  const ffmi = estimateFfmi(leanMassKg, heightCm);
  if (ffmi < 19) return 0.9;
  if (ffmi < 21) return 0.6;
  if (ffmi < 23) return 0.35;
  return 0.2;
}

export const PATH_LABEL: Record<DietPath, string> = {
  cutting: "Cutting (déficit)",
  normocalorico: "Normocalórico (manutenção)",
  bulking: "Bulking (superávit)",
};

export interface NavyMethodInput {
  sex: Sex;
  heightCm: number;
  waistCm: number;
  neckCm: number;
  /** obrigatório para mulheres */
  hipCm?: number;
}

/** Método da Marinha dos EUA — estima %BF a partir de circunferências, não da imagem em si */
export function estimateBfPercentNavy(input: NavyMethodInput): number | null {
  const { sex, heightCm, waistCm, neckCm, hipCm } = input;
  const log10 = Math.log10;

  if (sex === "masculino") {
    if (waistCm <= neckCm) return null;
    const bf = 495 / (1.0324 - 0.19077 * log10(waistCm - neckCm) + 0.15456 * log10(heightCm)) - 450;
    return bf > 0 && bf < 60 ? bf : null;
  }

  if (!hipCm) return null;
  const combined = waistCm + hipCm - neckCm;
  if (combined <= 0) return null;
  const bf = 495 / (1.29579 - 0.35004 * log10(combined) + 0.221 * log10(heightCm)) - 450;
  return bf > 0 && bf < 60 ? bf : null;
}

export interface PathClassification {
  path: DietPath;
  pathReason: string;
  surplusPercent: number;
}

export interface RecoverySignals {
  /** carga/repetições nos exercícios principais comparado ao início do ciclo anterior — o marcador
   * validado de que o déficit está grande demais (Garthe et al. 2011), não uma sensação subjetiva */
  strengthTrend?: "subiu" | "manteve" | "caiu";
  /** quantos treinos foram pulados ou encurtados por cansaço/indisposição no ciclo anterior (não por
   * falta de tempo) — fato contável, não autoavaliação */
  missedSessionsFatigue?: number;
  sleepHoursAvgLastCycle?: number;
  sleepDisturbanceLastCycle?: boolean;
  daytimeFatigueLastCycle?: boolean;
}

/** Pontua sinais objetivos de déficit calórico agressivo demais no ciclo que terminou — nunca pede pro
 * usuário se autoavaliar como "muito cansado", só fatos observáveis (carga na barra, treinos pulados,
 * sono). Base científica:
 * - Garthe et al. 2011 (Int J Sport Nutr Exerc Metab, DOI 10.1123/ijsnem.21.2.97): atletas perdendo peso
 *   a ~0,7%/semana ganharam massa magra e força; a ~1,4%/semana a massa magra estagnou e a força não
 *   evoluiu do mesmo jeito, apesar de perda de gordura parecida — carga na barra caindo é sinal forte.
 * - Mountjoy et al. 2023, consenso do COI sobre REDs (Br J Sports Med, DOI 10.1136/bjsports-2023-106994):
 *   framework de referência pra sinais de baixa disponibilidade energética (sono, recuperação, fadiga).
 * - Kenttä & Hassmén 1998 (Sports Med, DOI 10.2165/00007256-199826010-00001): recuperação insuficiente
 *   documentada via sono e capacidade de completar sessões de treino, não por opinião sobre a intensidade. */
export function scoreRecoverySignals(signals: RecoverySignals): number {
  let score = 0;
  if (signals.strengthTrend === "caiu") score += 2;
  if ((signals.missedSessionsFatigue ?? 0) >= 2) score += 1;
  if (signals.sleepHoursAvgLastCycle != null && signals.sleepHoursAvgLastCycle < 6.5) score += 1;
  if (signals.sleepDisturbanceLastCycle) score += 1;
  if (signals.daytimeFatigueLastCycle) score += 1;
  return score;
}

/** Rampa em vez de degrau: a decisão de estratégia era uma função escada em %BF (abaixo de 17%,
 * manutenção; a partir de 17,000%, déficit de 20% — um salto de ~460kcal decidido por 0,001 ponto
 * percentual de leitura). Como o %BF vem de leitura de foto, com ruído documentado de ±1 a 2,5 pontos
 * percentuais (ver Protocolo de %BF), esse degrau convertia ruído de sensor em oscilação de 20% na
 * prescrição de um mês pro outro. A rampa faz o déficit crescer proporcionalmente dentro de uma faixa
 * ao redor do limiar, de forma que um erro de leitura pequeno produza um erro de prescrição pequeno. */
/** A largura da rampa ESCALA com a incerteza da leitura. A IA de visão já devolve `bfConfidence`
 * (baixa/média/alta) em toda análise, e esse campo era apenas gravado e exibido — nenhum cálculo o
 * consultava, então uma leitura que a própria IA classificou como duvidosa movia a estratégia com a
 * mesma força de uma leitura confiante.
 *
 * Agora não: quanto menor a confiança, mais larga a rampa, e mais suave a resposta a uma leitura que
 * pode estar errada. É a mesma lógica de um controlador que confia menos num sensor ruidoso — não
 * ignora a medida, apenas reage com menos ganho. Com confiança baixa a transição de fase leva o dobro
 * de pontos percentuais para completar. */
const RAMP_WIDTH_BY_CONFIDENCE: Record<"baixa" | "media" | "alta", number> = {
  baixa: 2.0,
  media: 1.4,
  alta: 1.0,
};

/** Abaixo desse superávit/déficit em módulo, a fase é chamada de normocalórica — o rótulo segue o que
 * está sendo prescrito de fato, em vez de anunciar "cutting" com 2% de déficit. */
const PATH_LABEL_THRESHOLD = 0.05;

function rampFraction(value: number, center: number, halfWidth: number): number {
  const t = (value - (center - halfWidth)) / (2 * halfWidth);
  return Math.max(0, Math.min(1, t));
}

/** Decide a estratégia (cutting/normocalórico/bulking) a partir do %BF atual — usada tanto no primeiro
 * ciclo quanto nos seguintes, já que a estratégia deve refletir a composição corporal de agora, não
 * só a tendência histórica de peso (essa tendência já define os macros específicos separadamente).
 * `recoveryScore` (0 no primeiro ciclo, sem ciclo anterior pra avaliar) suaviza ou zera o déficit quando
 * o ciclo anterior mostrou sinais concorrentes de deficit agressivo demais — ver scoreRecoverySignals.
 * `previousPath` alimenta a histerese; omitir é seguro (equivale a não ter fase anterior). */
export function classifyPathFromBf(
  bodyFatPercent: number,
  sex: Sex,
  recoveryScore = 0,
  previousPath?: DietPath,
  /** confiança da leitura visual de %BF que gerou `bodyFatPercent`. Uma leitura marcada como "baixa"
   * pela própria IA não pode ter o mesmo peso que uma "alta" — ver RAMP_HALF_WIDTH_PP. */
  bfConfidence: "baixa" | "media" | "alta" = "alta"
): PathClassification {
  const { bulkBelow, cutAbove } = BF_THRESHOLDS[sex];

  // o ponto de entrada fica mais alto (dificulta entrar por ruído). Mesma lógica invertida no bulking.
  // Histerese de ciclo — é o que faz a sequência FECHAR em vez de o app decidir mês a mês isolado.
  // Quem já está em superávit continua até `cutAbove` (não para no ponto de entrada); quem já está em
  // déficit continua até `bulkBelow`. Sem isso, alguém que começava um bulking a 12,5% saía dele dois
  // meses depois ao cruzar 13% e ficava preso em manutenção — foi o que a projeção de 24 meses mostrou
  // antes desta correção.
  //
  // As duas frações são COMPLEMENTARES dentro de uma fase, então a virada é contínua: na borda, o
  // superávit vai afrouxando enquanto o déficit vai entrando, e o resultado atravessa o zero sem degrau.
  const larguraRampa = RAMP_WIDTH_BY_CONFIDENCE[bfConfidence];

  let cutFraction: number;
  let bulkFraction: number;

  if (previousPath === "bulking") {
    cutFraction = rampFraction(bodyFatPercent, cutAbove, larguraRampa);
    bulkFraction = 1 - cutFraction;
  } else if (previousPath === "cutting") {
    cutFraction = rampFraction(bodyFatPercent, bulkBelow, larguraRampa);
    bulkFraction = 1 - cutFraction;
  } else {
    // sem fase anterior: valem os pontos de ENTRADA, e existe uma faixa de manutenção entre eles
    cutFraction = rampFraction(bodyFatPercent, cutAbove, larguraRampa);
    bulkFraction = 1 - rampFraction(bodyFatPercent, bulkBelow, larguraRampa);
  }

  // O déficit NÃO tem uma intensidade só. Dois cortes muito diferentes usam o mesmo caminho de código:
  //
  // (a) CORTE DE RETORNO — a pessoa acabou de bater o teto do bulking e precisa voltar ao %BF de início
  //     do próximo ciclo. É curto, e o objetivo é preservar ao máximo a massa magra que acabou de ser
  //     construída; cortar agressivo aqui destrói justamente o que o bulking produziu.
  // (b) CORTE PROFUNDO — a pessoa chega ao app bem acima da faixa do ciclo. Há muita gordura a perder,
  //     o risco relativo à massa magra é menor e um déficit maior se justifica.
  //
  // Os NÚMEROS vêm de Garthe et al. 2011 (Int J Sport Nutr Exerc Metab, DOI 10.1123/ijsnem.21.2.97),
  // ensaio randomizado com 24 atletas de elite, todos com 4 sessões de força/semana:
  //   - Redução lenta:  ingestão -19±2%  ->  0,7%/semana de peso  ->  massa magra +2,1% (GANHOU magra
  //                     enquanto perdia gordura) e 1RM subiu
  //   - Redução rápida: ingestão -30±4%  ->  1,4%/semana de peso  ->  massa magra -0,2% (nenhum ganho),
  //                     com perda de gordura PARECIDA
  // Ou seja, o déficit de ~19% é o teto do que ainda permite construir músculo; a partir de ~30% a
  // massa magra deixa de responder e não se ganha gordura perdida em troca. Carbone, McClung &
  // Pasiakos 2019 (Adv Nutr, DOI 10.1093/advances/nmy087) confirma o mecanismo: conforme a magnitude do
  // déficit aumenta, a capacidade da proteína alta de proteger a massa magra DIMINUI — não adianta
  // compensar um déficit agressivo comendo mais proteína.
  //
  // Daí o teto de 20% aqui (logo acima do braço bem-sucedido, longe do braço que falhou) e o piso de
  // 12% para o corte de retorno, onde preservar é todo o objetivo.
  const MAX_DEFICIT_RETORNO = -0.12;
  const MAX_DEFICIT_PROFUNDO = -0.2;
  const PP_ATE_DEFICIT_CHEIO = 5; // pontos percentuais acima do teto do ciclo até o déficit máximo
  const profundidade = Math.max(0, Math.min(1, (bodyFatPercent - cutAbove) / PP_ATE_DEFICIT_CHEIO));
  const MAX_DEFICIT = MAX_DEFICIT_RETORNO + (MAX_DEFICIT_PROFUNDO - MAX_DEFICIT_RETORNO) * profundidade;
  // Superávit fixo em 12%, dentro da faixa de 10-20% de Iraki et al. 2019 (Sports, DOI
  // 10.3390/sports7070154).
  //
  // Vale registrar o que a evidência diz sobre NÃO subir mais que isso: Garthe et al. 2013 (Eur J Sport
  // Sci, DOI 10.1080/17461391.2011.643923) randomizou 39 atletas de elite em 8-12 semanas de ganho com
  // 4 sessões de força/semana. O grupo que comeu ~600kcal/dia a mais (3585 vs 2964kcal) ganhou mais
  // peso (3,9% vs 1,5%), mas o ganho de MASSA MAGRA não diferiu entre os grupos — enquanto a massa
  // GORDA subiu 15±4% contra 3±3%. Superávit maior comprou cinco vezes mais gordura e nenhum músculo.
  const MAX_SURPLUS = 0.12;

  const surplusDeCada = MAX_SURPLUS * bulkFraction + MAX_DEFICIT * cutFraction;
  let surplusPercent = surplusDeCada;

  const reasonCore =
    cutFraction >= 0.999
      ? profundidade < 0.35
        ? `%BF (${bodyFatPercent}%) — corte de RETORNO: déficit leve (${(Math.abs(MAX_DEFICIT) * 100).toFixed(0)}%) pra voltar aos ${bulkBelow}% e recomeçar o ganho, preservando ao máximo a massa magra construída no superávit. Cortar agressivo aqui destruiria justamente o que o bulking produziu (Garthe et al. 2011).`
        : `%BF (${bodyFatPercent}%) está bem acima do teto do ciclo (${cutAbove}%) — déficit de ${(Math.abs(MAX_DEFICIT) * 100).toFixed(0)}%, mais firme porque há bastante gordura a perder antes de a massa magra virar o fator limitante.`
      : bulkFraction >= 0.999
        ? `%BF (${bodyFatPercent}%) ${previousPath === "bulking" ? `está em superávit e ainda longe do teto de ${cutAbove}%` : `está abaixo de ${bulkBelow}%`} — superávit para ganho de massa magra.`
        : cutFraction > 0 && bulkFraction > 0
          ? `%BF (${bodyFatPercent}%) está na virada entre as fases — a prescrição atravessa de superávit para déficit de forma contínua (${(bulkFraction * 100).toFixed(0)}% superávit / ${(cutFraction * 100).toFixed(0)}% déficit), em vez de dar um salto de um mês pro outro.`
          : cutFraction > 0
            ? `%BF (${bodyFatPercent}%) está entrando na faixa de corte — déficit proporcional (${(cutFraction * 100).toFixed(0)}% do cheio), não um degrau, porque a leitura de foto tem ruído da ordem do próprio limiar.`
            : bulkFraction > 0
              ? `%BF (${bodyFatPercent}%) está entrando na faixa de superávit — superávit proporcional (${(bulkFraction * 100).toFixed(0)}% do cheio).`
              : `%BF (${bodyFatPercent}%) está na faixa intermediária (${bulkBelow}–${cutAbove}%) — manutenção.`;

  // ajuste por recuperação: mesmos limiares de antes (score >= 4 zera o déficit, >= 2 corta pela metade)
  let recoveryNote = "";
  if (surplusPercent < 0) {
    if (recoveryScore >= 4) {
      surplusPercent = 0;
      recoveryNote = " Déficit ZERADO neste ciclo: o anterior teve vários sinais concorrentes de déficit agressivo demais (carga caindo, treinos pulados por cansaço, sono ruim) — ciclo de manutenção pra recuperar antes de retomar.";
    } else if (recoveryScore >= 2) {
      surplusPercent *= 0.5;
      recoveryNote = " Déficit reduzido à metade porque o ciclo anterior mostrou sinais de déficit grande demais (carga/sono/cansaço).";
    }
  }

  const path: DietPath =
    surplusPercent <= -PATH_LABEL_THRESHOLD ? "cutting" : surplusPercent >= PATH_LABEL_THRESHOLD ? "bulking" : "normocalorico";

  return { path, pathReason: reasonCore + recoveryNote, surplusPercent };
}

/** Proteína e gordura por estratégia — a fonte única de verdade pros macros estruturais.
 *
 * Antes esses números só eram usados no PRIMEIRO ciclo; nos ciclos seguintes a proteína vinha
 * extrapolada do histórico (`extractRules` em dietEngine.ts), que dividia a proteína calculada sobre o
 * peso PROJETADO pelo peso MEDIDO de hoje e realimentava o resultado. Isso criava uma catraca — em
 * corte sustentado a proteína encolhia sozinha a cada ciclo, sem ninguém ter decidido isso. Proteína e
 * gordura são decisões de estratégia, não séries temporais a extrapolar. */
export function macroTargetsForStrategy(path: DietPath): { proteinPerKg: number; fatPerKg: number } {
  return {
    proteinPerKg: path === "cutting" ? 2.2 : path === "bulking" ? 1.9 : 2.0,
    fatPerKg: 0.7,
  };
}

export function estimateBodyComposition(input: BodyCompositionInput): BodyCompositionResult {
  const {
    weightKg,
    heightCm,
    bodyFatPercent,
    age,
    sex,
    activityLevel,
    exerciseFreq,
    sessionDuration,
    dailyStepsAvg,
    sittingHoursPerDay,
    standingWorkHoursPerDay,
    activeCommuteMinutesPerDay,
    choresHoursPerWeek,
    stairFlightsPerDay,
    otherSportActivity,
    otherSportSessionsPerWeek,
    otherSportMinutesPerSession,
    otherSportTalkTest,
  } = input;
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const leanMassKg = weightKg * (1 - bodyFatPercent / 100);
  const fatMassKg = weightKg - leanMassKg;

  // Katch-McArdle — usa massa magra a partir do %BF, mais preciso pra quem é magro/musculoso
  const bmrKatch = 370 + 21.6 * leanMassKg;
  // Mifflin-St Jeor — cruza com idade e sexo, mais preciso pra população geral / %BF mais alto
  const bmrMifflin = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === "masculino" ? 5 : -161);
  // peso adaptativo entre as duas conforme o %BF lido na foto: Katch-McArdle performa melhor em
  // quem é mais magro (usa a composição real, não só peso total), Mifflin fica melhor conforme o
  // %BF sobe — em vez de sempre fazer 50/50 média cega
  const katchWeight = bodyFatPercent < 15 ? 0.8 : bodyFatPercent < 25 ? 0.6 : 0.4;
  const bmr = bmrKatch * katchWeight + bmrMifflin * (1 - katchWeight);

  // TDEE por componentes (NEAT detalhado + EAT do treino real, com duração) quando informados — mais
  // preciso que multiplicador único, que não distingue treino intenso de rotina fora do treino
  const components = exerciseFreq
    ? estimateTdeeFromComponents(
        bmr,
        weightKg,
        exerciseFreq,
        sessionDuration,
        { dailyStepsAvg, sittingHoursPerDay, standingWorkHoursPerDay, activeCommuteMinutesPerDay, choresHoursPerWeek, stairFlightsPerDay },
        { otherSportActivity, otherSportSessionsPerWeek, otherSportMinutesPerSession, otherSportTalkTest }
      )
    : null;
  const tdee = components ? components.tdee : bmr * ACTIVITY_MULTIPLIER[activityLevel ?? "moderado"];
  const neatKcal = components ? components.neat : 0;
  const eatKcal = components ? components.eat : 0;
  const activityLevelDisplay = activityLevelFromPAL(tdee, bmr);

  const { path, pathReason, surplusPercent } = classifyPathFromBf(bodyFatPercent, sex);

  const targetKcal = tdee * (1 + surplusPercent);
  const { proteinPerKg, fatPerKg } = macroTargetsForStrategy(path);
  const targetProteinG = weightKg * proteinPerKg;
  const targetFatG = weightKg * fatPerKg;
  const targetCarbG = Math.max(0, (targetKcal - targetProteinG * 4 - targetFatG * 9) / 4);

  return {
    bmi,
    leanMassKg,
    fatMassKg,
    bmrKatch,
    bmrMifflin,
    bmr,
    neatKcal,
    eatKcal,
    tdee,
    activityLevelDisplay,
    path,
    pathReason,
    surplusPercent,
    targetKcal,
    proteinPerKg,
    fatPerKg,
    targetProteinG,
    targetFatG,
    targetCarbG,
  };
}

