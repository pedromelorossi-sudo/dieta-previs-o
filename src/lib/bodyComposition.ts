import { ActivityLevel, ExerciseFreq, SessionDuration, OtherSportActivity, TalkTestIntensity } from "./questionnaire";

export type Sex = "masculino" | "feminino";
export type DietPath = "cutting" | "normocalorico" | "bulking";

export interface BodyCompositionInput {
  weightKg: number;
  heightCm: number;
  bodyFatPercent: number;
  age: number;
  sex: Sex;
  /** usado só como fallback quando `exerciseFreq` não é informado;
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
  /** Fecha o orçamento de 24h do NEAT por tempo — ver neatFromTimeBudget. */
  sleepHoursPerDay?: number;
  /** esporte/atividade física regular fora da academia — capturado à parte do treino principal
   * (exerciseFreq/sessionDuration), com intensidade lida pelo talk test em vez de autoavaliação */
  otherSportActivity?: OtherSportActivity;
  otherSportSessionsPerWeek?: number;
  otherSportMinutesPerSession?: number;
  otherSportTalkTest?: TalkTestIntensity;
  /* ── O QUE FALTAVA CHEGAR ATÉ `classifyPathFromBf` ──
   *
   * A função aceita cinco parâmetros e recebia dois. O resultado, num usuário
   * real de 1,90m/85kg lido em 14,0%BF: superávit ZERO, rótulo "normocalórico",
   * e um roteiro de 24 meses para ganhar 0,7kg — porque a fase de manutenção
   * tem alvo igual ao %BF de partida e nunca termina, então roda até o teto do
   * horizonte.
   *
   * A conta que produzia isso:
   *   bulkFraction = 1 − rampFraction(14, 13, 1,0) = 1 − (14−12)/2 = 0
   * Com 13,9%BF teria dado superávit; com 14,0% deu exatamente zero. A pessoa
   * caía na borda da rampa e a histerese — que existe justamente para impedir
   * isso — nunca era consultada. */
  /** Fase do ciclo anterior. É o que faz a sequência FECHAR: quem já está em
   * superávit segue até `cutAbove` em vez de parar na borda de entrada. */
  previousPath?: DietPath;
  /** Confiança da leitura visual — decide a largura da rampa. Sem isso o
   * default "alta" usava 1,0 mesmo quando a IA declarou "media" (1,4). */
  bfConfidence?: "baixa" | "media" | "alta";
  /** Sinais de recuperação ruim suavizam ou zeram o déficit. */
  recoveryScore?: number;
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
/* MET do tempo NÃO relatado — o resto das horas acordado depois de descontar
 * sono e os domínios explicitamente respondidos. 1,5 é atividade leve de vida
 * cotidiana (levantar, ir ao banheiro, cozinhar rápido) — nem sedentarismo
 * puro (1,3, o mesmo do "sentado" declarado) nem vida ativa (1,8+, que
 * superestimava em teste: ~991kcal de NEAT só nesse termo para quem preenche
 * pouco do formulário). É constante interna, não pergunta ao usuário — a
 * pergunta que EXISTE é quantas horas ele dorme; o MET do resto é modelagem. */
const MET_RESTO_DO_DIA = 1.5;
/** Horas acordado assumidas quando `sleepHoursPerDay` não é informado —
 * fallback, não a fonte principal. Baseado em ~8h de sono médio. */
const HORAS_ACORDADO_PADRAO = 16;

function kcalPerMinuteAboveRest(met: number, weightKg: number): number {
  return ((met - 1) * 3.5 * weightKg) / 200;
}

interface TimeBudgetInput {
  sittingHoursPerDay?: number;
  standingWorkHoursPerDay?: number;
  activeCommuteMinutesPerDay?: number;
  choresHoursPerWeek?: number;
  stairFlightsPerDay?: number;
  sleepHoursPerDay?: number;
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

  /* FECHA O ORÇAMENTO EM 24H — sem isto, cada domínio era somado direto e
   * relatar MAIS horas sentado só SOMAVA mais caloria, nunca descontava nada.
   * Medido antes desta correção: quem respondia só "sento 2h" (resto em
   * branco) recebia MENOS caloria (TDEE 2258) do que quem não respondia NADA
   * (2503, do fallback sedentário) — preencher parte do formulário piorava a
   * estimativa.
   *
   * Horas acordado vêm de `sleepHoursPerDay` quando informado (agora
   * perguntado no formulário) — sem ele, cai no padrão de 16h. O tempo que
   * sobra depois de sono + domínios já respondidos recebe MET_RESTO_DO_DIA
   * em vez de simplesmente não existir na conta. Nunca negativo: se a soma
   * dos domínios relatados já preenche (ou passa) as horas acordado, o resto
   * é zero — a pessoa já contou o dia inteiro. */
  /* Sono IMPLAUSÍVEL é tratado como AUSENTE, não absorvido cru.
   *
   * A validação de faixa em route.ts protege a requisição HTTP, mas esta
   * função é chamada por qualquer código que importe bodyComposition.ts —
   * um teste, uma calculadora futura, qualquer coisa. Sem defesa própria,
   * `sleepHoursPerDay=-100` empurra `horasAcordado` para MAIS de 24h — e como
   * isso alimenta o balde "resto do dia" (que cobre o dia inteiro, não um
   * termo isolado como os outros), o efeito é desproporcional: TDEE inflado
   * a 2,7× o normal, medido. E um valor não-numérico vira NaN e se propaga
   * até o kcal final em silêncio, HTTP 200, dieta corrompida.
   *
   * Faixa fisiologicamente plausível de sono: 1 a 16h. Fora disso, ou não
   * finito, cai no mesmo padrão de 16h acordado que "não informado" já usa —
   * mesma filosofia do `assertFiniteBf`: dado implausível não é dado, é
   * ausência de dado. */
  const sonoValido =
    input.sleepHoursPerDay != null && Number.isFinite(input.sleepHoursPerDay) && input.sleepHoursPerDay >= 1 && input.sleepHoursPerDay <= 16;
  const horasAcordado = sonoValido ? Math.max(1, 24 - input.sleepHoursPerDay!) : HORAS_ACORDADO_PADRAO;
  const horasJaContadas =
    (input.sittingHoursPerDay ?? 0) +
    (input.standingWorkHoursPerDay ?? 0) +
    (input.activeCommuteMinutesPerDay ?? 0) / 60 +
    (input.choresHoursPerWeek ?? 0) / 7;
  const horasNaoContadas = Math.max(0, horasAcordado - horasJaContadas);
  const resto = horasNaoContadas * 60 * kcalPerMinuteAboveRest(MET_RESTO_DO_DIA, weightKg);

  return sitting + standing + commute + chores + stairs + resto;
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
  /* `!valor` trata 0 e "ausente" do mesmo jeito (certo: sem sessão, sem contribuição), mas NÃO barra
     negativo — `!(-5)` é `false` em JS, então um valor negativo passava o guard e virava EAT
     negativo, reduzindo o TDEE em silêncio. A rota já valida a faixa antes de chegar aqui, mas esta
     função é exportada indiretamente via `estimateTdeeFromComponents`/`estimateBodyComposition`, sem
     garantia de que todo chamador futuro passe pela mesma validação — defesa própria. */
  if (
    !input.otherSportActivity ||
    !input.otherSportSessionsPerWeek ||
    input.otherSportSessionsPerWeek < 0 ||
    !input.otherSportMinutesPerSession ||
    input.otherSportMinutesPerSession < 0
  )
    return 0;
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
/* Teto do bulking a 17% no homem (era 16), por decisão do Pedro.
 *
 * Aumenta a janela de ganho de 3 para 4 pontos percentuais, o que dá fases de
 * superávit mais longas antes do corte de retorno — e é o que a prática de
 * fisiculturismo natural costuma usar. Continua bem abaixo do ponto em que a
 * partição piora de forma relevante, e o corte de retorno segue mirando 13%. */
/* Até que FFMI a recomposição ainda é a aposta melhor que cortar.
 *
 * 19 no homem: acima da média do não-treinado (~17-18) e abaixo de quem já
 * treina consistentemente (20+). Mulher em 15,5 pela mesma lógica, ajustada
 * para a composição corporal de base ser diferente.
 *
 * Não é um limiar medido — é a fronteira declarada entre "ainda há muito
 * músculo fácil a ganhar" e "os dois objetivos começam a brigar". */
const FFMI_ATE_ONDE_VALE_RECOMPOR: Record<Sex, number> = {
  masculino: 19,
  feminino: 15.5,
};

const BF_THRESHOLDS: Record<Sex, { bulkBelow: number; cutAbove: number }> = {
  masculino: { bulkBelow: 13, cutAbove: 17 },
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
/* Teto de construção de massa magra por mês — RAMPA, não escada.
 *
 * Era uma escada de quatro degraus (0,9 / 0,6 / 0,35 / 0,2). O problema não era
 * a ordem de grandeza, era a descontinuidade: com FFMI 20,99 a pessoa
 * construía 0,60 kg/mês e com 21,01 construía 0,35 — uma queda de 42% ao
 * cruzar uma linha que existe só no código. Na projeção de 24 meses isso
 * aparecia como o ganho despencando do mês 19 para o 20 sem nada ter mudado
 * no corpo.
 *
 * A calibração: um usuário real de 1,90m e FFMI 20,0 entregou 0,71 kg de magra
 * por mês (79→85kg em 5 meses). A escada dava teto de 0,60 — ou seja, o
 * "limite" estava ABAIXO do que ele já havia demonstrado, o que faz dele uma
 * trava e não um teto. A rampa devolve ~0,83 nesse ponto: acima do observado,
 * como um teto deve ser.
 *
 * A forma continua vindo de Kouri et al. 1995 (FFMI natural com teto em ~25):
 * a capacidade cai linearmente conforme a margem até o teto se fecha, e o piso
 * de 0,1 existe porque mesmo perto do limite ainda há adaptação residual. */
const FFMI_TETO_NATURAL = 25;
const FFMI_INICIO_DA_DESACELERACAO = 19;
const GANHO_MAGRO_MAX_KG_MES = 1.0;
const GANHO_MAGRO_MIN_KG_MES = 0.1;

export function monthlyLeanGainCeilingKg(leanMassKg: number, heightCm: number): number {
  const ffmi = estimateFfmi(leanMassKg, heightCm);
  /* NO TETO, O GANHO PARA.
   *
   * O piso de 0,1 kg/mês era aplicado sempre, inclusive acima do teto natural —
   * então a projeção seguia somando massa magra indefinidamente. Varredura em
   * 5.170 casos pegou FFMI final de 26,3 em 19 cenários, ou seja, o modelo
   * projetava a pessoa ultrapassando o limite que ele mesmo declara como teto
   * natural (Kouri et al. 1995).
   *
   * O piso existe para representar adaptação residual de quem AINDA tem margem,
   * não para furar o limite. */
  if (ffmi >= FFMI_TETO_NATURAL) return 0;
  const margemRestante =
    (FFMI_TETO_NATURAL - ffmi) / (FFMI_TETO_NATURAL - FFMI_INICIO_DA_DESACELERACAO);
  return Math.max(
    GANHO_MAGRO_MIN_KG_MES,
    Math.min(GANHO_MAGRO_MAX_KG_MES, GANHO_MAGRO_MAX_KG_MES * margemRestante)
  );
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
  bfConfidence: "baixa" | "media" | "alta" = "alta",
  /** FFMI atual — quão longe a pessoa está do teto natural. Decide a janela de
   * recomposição; ver `FFMI_ATE_ONDE_VALE_RECOMPOR`. */
  ffmi?: number
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

  /* RECOMPOSIÇÃO PARA POUCO TREINADO COM %BF ALTO.
   *
   * Até aqui a estratégia saía SÓ do %BF, e isso trata como iguais dois casos
   * opostos. Um usuário real de 1,70m e 64kg com 21%BF tem 50,6kg de massa
   * magra — FFMI 17,5, quase 8 pontos abaixo do teto natural de ~25. Ele
   * recebia déficit de 18%, que tira o pouco de músculo que ele tem e o deixa
   * magro e fraco. Outro, com o mesmo 21% mas FFMI 23, está de fato precisando
   * cortar: não sobra margem para construir.
   *
   * Ganhar músculo e perder gordura ao mesmo tempo é possível justamente nessa
   * janela — pouco treinado, gordura sobrando como substrato, proteína
   * adequada. Quem já está perto do teto natural não tem esse luxo: para ele os
   * dois objetivos brigam, e por isso alternar fases é a única saída.
   *
   * A recomposição é prescrita como NORMOCALÓRICO: o déficit vem do próprio
   * tecido adiposo, que é abundante nesse perfil, não da comida. */
  /* A janela só substitui um CORTE DE VERDADE, nunca um superávit em curso.
   *
   * A condição era `cutFraction > 0`, e isso disparava também na rampa de SAÍDA
   * de um bulking — momento em que a fração de corte já é positiva mas a
   * prescrição líquida ainda é superávit. Efeito medido: alguém com 16,5%BF e
   * FFMI 18,8 vindo de bulking virava "normocalórico"; o ciclo seguinte gravava
   * essa fase, a janela reabria, e a pessoa nunca mais saía — 24 meses de
   * manutenção para ganhar 0,7kg. Exatamente a patologia que a histerese existe
   * para impedir, recriada por outro caminho.
   *
   * Pior: quem tinha MAIS margem até o teto natural era justamente quem era
   * jogado fora do superávit (FFMI 20,5 continuava ganhando; 18,8 não).
   *
   * Usar o superávit líquido resolve: só é recomposição quando a prescrição
   * seria negativa. */
  const surplusLiquido = MAX_SURPLUS * bulkFraction + MAX_DEFICIT * cutFraction;
  const dentroDaJanelaDeRecomposicao =
    ffmi != null && ffmi < FFMI_ATE_ONDE_VALE_RECOMPOR[sex] && surplusLiquido < 0;

  if (dentroDaJanelaDeRecomposicao) {
    return {
      path: "normocalorico",
      surplusPercent: 0,
      pathReason:
        `%BF (${bodyFatPercent}%) está acima da faixa de ganho, MAS o FFMI de ${ffmi.toFixed(1)} mostra bastante margem até o teto natural (~25) — ` +
        `então a resposta aqui não é cortar, é RECOMPOR: manutenção calórica com proteína alta, ganhando músculo e perdendo gordura ao mesmo tempo. ` +
        `Cortar quem tem pouca massa magra tira justamente o que falta construir. Essa janela fecha conforme o FFMI sobe: ` +
        `a partir de ${FFMI_ATE_ONDE_VALE_RECOMPOR[sex]}, os dois objetivos passam a brigar e alternar fases vira a saída.`,
    };
  }

  const surplusDeCada = surplusLiquido;
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
/* Proteína e gordura por kg de PESO TOTAL.
 *
 * Decisão do Pedro, e o argumento é bom: a massa magra é derivada da estimativa
 * de %BF, que tem erro de 2 a 4 pontos percentuais — prescrever sobre ela é
 * herdar essa imprecisão. Peso total é medido numa balança.
 *
 * A gordura sobe no DÉFICIT: a produção de hormônios esteroides depende dela, e
 * é no corte que a testosterona cai (Mitchell et al. 2018 mediu 16,4 → 10,1
 * nmol/L numa preparação, apesar de proteína alta). A proteína segue a mesma
 * lógica, para preservar massa magra quando o objetivo é justamente esse
 * (Helms et al. 2014). No superávit há energia sobrando e o carboidrato rende
 * mais no treino.
 *
 * A consequência aceita: em quem tem MUITA gordura, o g/kg de peso total
 * superestima a necessidade real. É por isso que existe o ajuste logo abaixo,
 * em `ajustarMacrosQueNaoCabem` — sem ele a prescrição fica incoerente. */
export function macroTargetsForStrategy(path: DietPath): { proteinPerKg: number; fatPerKg: number } {
  return {
    proteinPerKg: path === "cutting" ? 2.2 : path === "bulking" ? 1.9 : 2.0,
    fatPerKg: path === "cutting" ? 1.0 : path === "bulking" ? 0.8 : 0.9,
  };
}

/* Quando proteína + gordura não cabem nas calorias do dia.
 *
 * Achado por varredura, em 62 de 5.170 casos: mulher de 85kg com 55%BF em corte
 * recebia 187g de proteína (748 kcal) e 85g de gordura (765 kcal) — 1.513 kcal
 * só nesses dois, contra um alvo de 1.475. O carboidrato era zerado pelo clamp
 * e a prescrição ficava se contradizendo: dizia "coma 1.475" e os macros
 * somavam mais que isso.
 *
 * Não é caso raro: acontece com qualquer pessoa de %BF alto em déficit, porque
 * o g/kg é sobre peso total e o alvo calórico é sobre o gasto — que não cresce
 * na mesma proporção.
 *
 * O ajuste reserva uma fatia mínima para carboidrato e reparte o resto entre
 * proteína e gordura MANTENDO a proporção entre elas. Cortar só um dos dois
 * mudaria a estratégia por acidente aritmético. */
const FRACAO_MINIMA_DE_CARBO = 0.1;

export function ajustarMacrosQueNaoCabem(
  targetKcal: number,
  proteinG: number,
  fatG: number
): { proteinG: number; fatG: number; carbG: number; ajustado: boolean } {
  const kcalDisponivelParaProteinaEGordura = targetKcal * (1 - FRACAO_MINIMA_DE_CARBO);
  const kcalPedida = proteinG * 4 + fatG * 9;

  if (kcalPedida <= kcalDisponivelParaProteinaEGordura) {
    return {
      proteinG,
      fatG,
      carbG: Math.max(0, (targetKcal - kcalPedida) / 4),
      ajustado: false,
    };
  }

  const escala = kcalDisponivelParaProteinaEGordura / kcalPedida;
  const p = proteinG * escala;
  const g = fatG * escala;
  return { proteinG: p, fatG: g, carbG: Math.max(0, (targetKcal - p * 4 - g * 9) / 4), ajustado: true };
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
    sleepHoursPerDay,
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
        { dailyStepsAvg, sittingHoursPerDay, standingWorkHoursPerDay, activeCommuteMinutesPerDay, choresHoursPerWeek, stairFlightsPerDay, sleepHoursPerDay },
        { otherSportActivity, otherSportSessionsPerWeek, otherSportMinutesPerSession, otherSportTalkTest }
      )
    : null;
  const tdee = components ? components.tdee : bmr * ACTIVITY_MULTIPLIER[activityLevel ?? "moderado"];
  const neatKcal = components ? components.neat : 0;
  const eatKcal = components ? components.eat : 0;
  const activityLevelDisplay = activityLevelFromPAL(tdee, bmr);

  const { path, pathReason, surplusPercent } = classifyPathFromBf(
    bodyFatPercent,
    sex,
    input.recoveryScore ?? 0,
    input.previousPath,
    input.bfConfidence ?? "alta",
    // FFMI da composição de AGORA — é ele que abre ou fecha a janela de recomposição
    estimateFfmi(weightKg * (1 - bodyFatPercent / 100), heightCm)
  );

  const targetKcal = tdee * (1 + surplusPercent);
  const { proteinPerKg, fatPerKg } = macroTargetsForStrategy(path);
  const macros = ajustarMacrosQueNaoCabem(targetKcal, weightKg * proteinPerKg, weightKg * fatPerKg);
  const targetProteinG = macros.proteinG;
  const targetFatG = macros.fatG;
  const targetCarbG = macros.carbG;

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

