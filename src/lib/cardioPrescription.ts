import { DietPath } from "./bodyComposition";
import { TalkTestIntensity, TALK_TEST_LABEL } from "./questionnaire";

export interface CardioSession {
  modality: string;
  frequencyPerWeek: number;
  minutesPerSession: number;
  talkTestTarget: TalkTestIntensity;
  intensityLabel: string;
  timingNote: string;
}

export interface CardioPrescription {
  sessions: CardioSession[];
  totalMinutesPerWeek: number;
  /** gasto estimado do cardio prescrito, kcal/dia — pra ser somado ao TDEE em vez de ficar invisível */
  estimatedKcalPerDay: number;
  reason: string;
  interferenceNote: string;
}

export interface CardioInput {
  strategy: DietPath;
  /** dias/semana de treino de força já prescritos — usado pra não empilhar estresse total e pra decidir
   * timing (mesmo dia vs. dia separado) */
  strengthDaysPerWeek: number;
  /** sinais de recuperação ruim do lado da dieta (ver Recuperação e Ajuste do Déficit) — cardio extra
   * não deveria ser somado em cima de um déficit que já está sendo mal tolerado */
  recoveryScore?: number;
  /** peso corporal, só pra estimar o gasto do cardio prescrito (ver estimatedKcalPerDay) */
  weightKg: number;
}

// O objetivo aqui não é só "gastar mais calorias" — é manter o turnover metabólico (energy flux) alto o
// bastante pra sustentar a capacidade do corpo de direcionar as calorias extras pra síntese muscular em
// vez de gordura, em qualquer fase de dieta, não só cutting. Miller 2026, Am J Clin Nutr (DOI
// 10.1016/j.ajcnut.2026.101398): baixa atividade física reduz a capacidade metabólica (sensibilidade à
// insulina, manejo de glicose, função vascular) mesmo antes de qualquer mudança de peso — "energy flux"
// (o quanto o corpo movimenta energia por dia) parece importar de um jeito que o TDEE total sozinho não
// captura. Howlett et al. 2008, Am J Physiol Endocrinol Metab (DOI 10.1152/ajpendo.00542.2007): um único
// bloco de exercício aeróbico já aumenta a fosforilação de AS160 (via de translocação do GLUT4) e a
// sensibilidade à insulina no músculo esquelético humano, efeito que se mantém horas depois — é o
// mecanismo mais direto ligando cardio regular a melhor partição de nutriente (mais carboidrato indo pro
// glicogênio/síntese muscular, menos sobrando pra virar gordura). Isso é o motivo de manter cardio
// significativo mesmo no bulking, não só reduzir ao mínimo.
const BASE_TURNOVER_MINUTES = 150;

// Ajuste por estratégia de dieta (ver Estratégia - Cutting Normo Bulking): cutting ganha cardio extra
// como ferramenta auxiliar de déficit. Bulking reduz frequência/duração (pra não competir com o
// superávit calórico nem com a recuperação do treino de força, que são a prioridade nessa fase) mas
// NÃO minimiza a ponto de abrir mão do turnover metabólico — a lógica de partição de nutriente acima
// vale especialmente em superávit, onde há mais glicose/energia sobrando pra ser mal direcionada.
const STRATEGY_MINUTES_ADJUSTMENT: Record<DietPath, number> = {
  cutting: 60,
  normocalorico: 0,
  bulking: -30,
};

// Interferência do cardio no treino de força não é uniforme — depende de modalidade, frequência e
// duração. Wilson et al. 2012, J Strength Cond Res (DOI 10.1519/JSC.0b013e31823a3e2d), meta-análise de
// 21 estudos: treino de força CONCORRENTE COM CORRIDA teve queda significativa de hipertrofia e força;
// concorrente com CICLISMO não teve o mesmo efeito significativo. Frequência (r -0,26 a -0,35) e duração
// (r -0,29 a -0,75) do treino de endurance correlacionam negativamente com hipertrofia/força/potência —
// sessões mais longas e mais frequentes de cardio custam mais caro pro ganho de força, não só mais tempo.
// Por isso o app prioriza modalidades de baixo impacto (bike/elíptico/remo) sobre corrida como padrão, e
// mantém duração por sessão moderada em vez de sessões muito longas — o objetivo é manter o turnover
// metabólico alto sem pagar o preço de interferência que a corrida especificamente mostrou ter.
const LOW_INTERFERENCE_MODALITY = "Bicicleta ergométrica, elíptico ou remo (baixo impacto)";
const HIIT_MODALITY = "Bicicleta ergométrica ou elíptico (HIIT)";

/** Monta a prescrição de cardio: frequência, duração e intensidade (via talk test, não "leve/moderado/
 * intenso" autoavaliado — mesmo raciocínio de EAT - Treino Principal e Outro Esporte) com foco em manter
 * o turnover metabólico alto o bastante pra sustentar ganho de massa (partição de nutriente, sensibilidade
 * à insulina), não só saúde cardiovascular genérica. A maior parte do volume fica em steady-state
 * moderado (mais barato pra recuperação, sustentável, frequência regular é o que ativa a via de GLUT4 —
 * ver Howlett et al. 2008); HIIT entra como complemento pontual, só quando a recuperação está indo bem.
 *
 * Comparação HIIT vs. contínuo pra saúde cardiometabólica: Strauss et al. 2026, Cochrane Database Syst
 * Rev (DOI 10.1002/14651858.CD013617.pub2), revisão de 58 ensaios randomizados em adultos sedentários
 * saudáveis — HIIT aumenta VO2 e reduz circunferência de cintura de forma consistente comparado a não
 * fazer exercício, e tem ganho a mais (pequeno) de VO2 sobre treino contínuo moderado; sem diferença
 * clara em pressão arterial ou triglicerídeos entre HIIT e contínuo — os dois funcionam, HIIT não é
 * estritamente superior, então a escolha aqui prioriza o que sobra menos caro pra recuperação do treino
 * de força, que é a prioridade desse app. Piso geral ancorado na diretriz da OMS (Bull et al. 2020, Br J
 * Sports Med, DOI 10.1136/bjsports-2020-102955): 150-300min/semana moderado ou 75-150min vigoroso. */
export function prescribeCardio(input: CardioInput): CardioPrescription {
  const { strategy, strengthDaysPerWeek, recoveryScore = 0, weightKg } = input;

  const badRecovery = recoveryScore >= 2;
  const adjustment = badRecovery && strategy === "cutting" ? 0 : STRATEGY_MINUTES_ADJUSTMENT[strategy];
  const targetMinutes = Math.max(90, BASE_TURNOVER_MINUTES + adjustment);

  // HIIT entra só como complemento (1x/semana) e quando a recuperação permite — nunca é a maior parte
  // do volume, dado o custo de recuperação mais alto por minuto.
  const HIIT_MIN_MINUTES = 10;
  const HIIT_MAX_MINUTES = 20;
  const hiitMinutes =
    !badRecovery && targetMinutes * 0.3 >= HIIT_MIN_MINUTES
      ? Math.min(HIIT_MAX_MINUTES, Math.round(targetMinutes * 0.3))
      : 0;

  // Teto de duração POR SESSÃO antes de teto de volume total. Wilson et al. 2012 (DOI
  // 10.1519/JSC.0b013e31823a3e2d) mede correlação negativa com hipertrofia/força tanto pra frequência
  // do aeróbico (r -0,26 a -0,35) quanto pra DURAÇÃO (r -0,29 a -0,75) — duração pesa mais. Então é
  // preferível NÃO entregar o alvo de turnover a entregar sessões longas: o que passa do teto é cortado
  // e declarado no `reason`, não empurrado pra dentro de sessões de 60-75min.
  const MAX_STEADY_SESSIONS = 3;
  const MAX_STEADY_SESSION_MINUTES = 45;
  const MIN_STEADY_SESSION_MINUTES = 25;

  const steadyTargetTotal = targetMinutes - hiitMinutes;
  const steadyStateSessions = Math.max(2, Math.min(MAX_STEADY_SESSIONS, Math.round(steadyTargetTotal / 40)));
  const steadyStateMinutes = Math.max(
    MIN_STEADY_SESSION_MINUTES,
    Math.min(MAX_STEADY_SESSION_MINUTES, Math.round(steadyTargetTotal / steadyStateSessions))
  );
  const trimmedMinutes = steadyTargetTotal - steadyStateSessions * steadyStateMinutes;

  const sessions: CardioSession[] = [
    {
      modality: LOW_INTERFERENCE_MODALITY,
      frequencyPerWeek: steadyStateSessions,
      minutesPerSession: steadyStateMinutes,
      talkTestTarget: "frases_curtas",
      intensityLabel: `Moderado — ${TALK_TEST_LABEL.frases_curtas}`,
      timingNote:
        strengthDaysPerWeek > 0
          ? "Em dia separado do treino de força, ou depois dele (nunca antes) — não compromete a performance no treino principal."
          : "Qualquer horário — sem treino de força concorrente pra se preocupar.",
    },
  ];

  if (hiitMinutes > 0) {
    sessions.push({
      modality: HIIT_MODALITY,
      frequencyPerWeek: 1,
      minutesPerSession: hiitMinutes,
      talkTestTarget: "nao_consegue_conversar",
      intensityLabel: `Alta — ${TALK_TEST_LABEL.nao_consegue_conversar}`,
      timingNote: "Em dia separado do treino de força de perna, se possível — HIIT tem custo de recuperação mais alto por minuto que o steady-state.",
    });
  }

  // Fonte única de verdade: o total declarado É a soma do que foi prescrito. Antes o total era o alvo
  // teórico e as sessões saíam de um arredondamento com resíduo descartado, então o app anunciava
  // 210min/semana enquanto prescrevia 167 (e 106 quando a recuperação ruim eliminava o HIIT).
  const totalMinutesPerWeek = sessions.reduce((sum, s) => sum + s.frequencyPerWeek * s.minutesPerSession, 0);

  // Gasto estimado do cardio prescrito, pra ser SOMADO ao TDEE em vez de ficar invisível: o app
  // prescrevia 150min/semana de aeróbico e não contabilizava um minuto disso no gasto. Steady-state
  // moderado fica em torno de 6 METs e HIIT em torno de 9 (Compendium of Physical Activities,
  // Ainsworth et al. 2011, DOI 10.1249/MSS.0b013e31821ece12); conta-se (MET-1) porque o BMR já cobre
  // o repouso, mesma convenção do NEAT em bodyComposition.ts.
  const STEADY_MET = 6.0;
  const HIIT_MET = 9.0;
  const kcalPerMin = (met: number) => ((met - 1) * 3.5 * weightKg) / 200;
  const estimatedKcalPerDay =
    (steadyStateSessions * steadyStateMinutes * kcalPerMin(STEADY_MET) + hiitMinutes * kcalPerMin(HIIT_MET)) / 7;

  const trimNote =
    trimmedMinutes > 10
      ? ` O alvo de turnover pediria ${targetMinutes}min/semana, mas foram prescritos ${totalMinutesPerWeek}min: a sessão de steady-state é limitada a ${MAX_STEADY_SESSION_MINUTES}min e a ${MAX_STEADY_SESSIONS}x/semana, porque duração de aeróbico é a variável que mais custa hipertrofia (Wilson et al. 2012) — entregar o alvo cheio sairia mais caro que não entregar.`
      : "";

  const reason =
    (strategy === "cutting"
      ? badRecovery
        ? "Déficit já mostrando sinais de mal tolerado nesse ciclo — cardio mantido só no piso de turnover metabólico, sem somar estresse extra em cima do déficit calórico."
        : "Cutting — cardio acima do piso de turnover como ferramenta auxiliar de déficit, sem depender só de cortar mais comida."
      : strategy === "bulking"
        ? `Bulking — cardio reduzido pra não competir com o superávit calórico nem com a recuperação do treino de força, mas mantido em ${totalMinutesPerWeek}min/semana (não minimizado): frequência regular de aeróbico sustenta a sensibilidade à insulina que ajuda a direcionar as calorias extras pra síntese muscular em vez de gordura (Howlett et al. 2008).`
        : "Normocalórico — piso padrão de turnover metabólico, sem viés pra mais ou menos.") +
    ` Gasto estimado: ~${estimatedKcalPerDay.toFixed(0)}kcal/dia, já somados ao TDEE usado na prescrição.` +
    trimNote;

  const interferenceNote =
    strengthDaysPerWeek >= 4
      ? `Treino de força em ${strengthDaysPerWeek} dias/semana — priorizada modalidade de baixo impacto (bike/elíptico/remo) em vez de corrida, que é a única modalidade com interferência significativa documentada em hipertrofia/força (Wilson et al. 2012).`
      : "Frequência de força atual deixa mais espaço pra cardio sem risco relevante de interferência, mas a modalidade de baixo impacto ainda é a escolha mais segura por padrão.";

  return { sessions, totalMinutesPerWeek, estimatedKcalPerDay, reason, interferenceNote };
}
