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
  const { strategy, strengthDaysPerWeek, recoveryScore = 0 } = input;

  const badRecovery = recoveryScore >= 2;
  const adjustment = badRecovery && strategy === "cutting" ? 0 : STRATEGY_MINUTES_ADJUSTMENT[strategy];
  const totalMinutesPerWeek = Math.max(90, BASE_TURNOVER_MINUTES + adjustment);

  const sessions: CardioSession[] = [];

  // maior parte do volume em steady-state moderado, 2-3x/semana — frequência regular é o que mantém a
  // via de sensibilidade à insulina "ativa" (Howlett et al. 2008 mostrou o efeito durando só horas após
  // uma sessão), então espalhar em mais dias vale mais aqui do que concentrar num dia só
  const steadyStateSessions = totalMinutesPerWeek >= 180 ? 3 : 2;
  const steadyStateMinutes = Math.round(totalMinutesPerWeek * 0.7 / steadyStateSessions);
  sessions.push({
    modality: LOW_INTERFERENCE_MODALITY,
    frequencyPerWeek: steadyStateSessions,
    minutesPerSession: steadyStateMinutes,
    talkTestTarget: "frases_curtas",
    intensityLabel: `Moderado — ${TALK_TEST_LABEL.frases_curtas}`,
    timingNote:
      strengthDaysPerWeek > 0
        ? "Em dia separado do treino de força, ou depois dele (nunca antes) — não compromete a performance no treino principal."
        : "Qualquer horário — sem treino de força concorrente pra se preocupar.",
  });

  // HIIT só entra como complemento (1x/semana) quando a recuperação permite — nunca é a maior parte do
  // volume, dado o custo de recuperação mais alto por minuto
  const hasRoomForHiit = !badRecovery && totalMinutesPerWeek - steadyStateSessions * steadyStateMinutes >= 15;
  if (hasRoomForHiit) {
    const hiitMinutes = totalMinutesPerWeek - steadyStateSessions * steadyStateMinutes;
    sessions.push({
      modality: HIIT_MODALITY,
      frequencyPerWeek: 1,
      minutesPerSession: Math.max(10, Math.min(20, hiitMinutes)),
      talkTestTarget: "nao_consegue_conversar",
      intensityLabel: `Alta — ${TALK_TEST_LABEL.nao_consegue_conversar}`,
      timingNote: "Em dia separado do treino de força de perna, se possível — HIIT tem custo de recuperação mais alto por minuto que o steady-state.",
    });
  }

  const reason =
    strategy === "cutting"
      ? badRecovery
        ? `Déficit já mostrando sinais de mal tolerado nesse ciclo — cardio mantido só no piso de turnover metabólico (${BASE_TURNOVER_MINUTES}min/semana), sem somar estresse extra em cima do déficit calórico.`
        : `Cutting — cardio extra (+${STRATEGY_MINUTES_ADJUSTMENT.cutting}min/semana sobre o piso) como ferramenta auxiliar de déficit, sem depender só de cortar mais comida.`
      : strategy === "bulking"
        ? `Bulking — cardio reduzido pra não competir com o superávit calórico nem com a recuperação do treino de força, mas mantido em ${totalMinutesPerWeek}min/semana (não minimizado): frequência regular de aeróbico sustenta a sensibilidade à insulina que ajuda a direcionar as calorias extras pra síntese muscular em vez de gordura (Howlett et al. 2008).`
        : `Normocalórico — piso padrão de turnover metabólico (${BASE_TURNOVER_MINUTES}min/semana), sem viés pra mais ou menos.`;

  const interferenceNote =
    strengthDaysPerWeek >= 4
      ? `Treino de força em ${strengthDaysPerWeek} dias/semana — priorizada modalidade de baixo impacto (bike/elíptico/remo) em vez de corrida, que é a única modalidade com interferência significativa documentada em hipertrofia/força (Wilson et al. 2012).`
      : "Frequência de força atual deixa mais espaço pra cardio sem risco relevante de interferência, mas a modalidade de baixo impacto ainda é a escolha mais segura por padrão.";

  return { sessions, totalMinutesPerWeek, reason, interferenceNote };
}
