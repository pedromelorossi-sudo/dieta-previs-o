import { test } from "node:test";
import assert from "node:assert/strict";

import { classifyPathFromBf, macroTargetsForStrategy, estimateBodyComposition, bfThresholdsFor } from "../src/lib/bodyComposition";
import { planejarFases } from "../src/lib/planoDeFases";
import { applySafetyLimits } from "../src/lib/safety";
import { estimateEmpiricalTdeeSeries, weeklyRate, predictNextCycle, signedDaysBetween } from "../src/lib/dietEngine";
import { computeMuscleTargets, buildSplit, musclesCoveredBy } from "../src/lib/trainingSplitBuilder";
import { prescribeCardio } from "../src/lib/cardioPrescription";
import { assessTrainingCleanliness } from "../src/lib/calibration";
import { compareVolumeToTarget, VOLUME_LANDMARKS, landmarkFor } from "../src/lib/trainingVolume";
import { confrontarPlano } from "../src/lib/planoDeFases";
import { suggestLoadProgression } from "../src/lib/trainingPeriodization";
import { exerciseById } from "../src/lib/exerciseLibrary";
import { computeTdeeCalibration } from "../src/lib/calibration";
import type { Cycle } from "../src/lib/types";

/** Cada teste aqui corresponde a um achado da auditoria de 12 ciclos. O nome diz qual. */

/** Volume EFETIVO da divisão — work + topset apenas, mesma regra de `isEffective` em trainingVolume.ts.
 * Aquecimento existe na sessão mas não é estímulo, e não pode inflar a contagem. */
function seriesEfetivas(sessions: ReturnType<typeof buildSplit>): number {
  return sessions.reduce(
    (total, dia) =>
      total +
      dia.items.reduce(
        (porDia, item) =>
          porDia + item.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset").reduce((s, b) => s + b.sets, 0),
        0
      ),
    0
  );
}

// ---------------------------------------------------------------------------
// N-1 — o degrau de %BF virava ruído de foto em 460kcal
// ---------------------------------------------------------------------------

test("N-1: a prescrição é contínua em torno do limiar de %BF", () => {
  const tdee = 2300;
  const kcalAt = (bf: number) => tdee * (1 + classifyPathFromBf(bf, "masculino").surplusPercent);

  // o salto no antigo ponto de degrau tem que ser desprezível
  assert.ok(Math.abs(kcalAt(16.999) - kcalAt(17.0)) < 5, "degrau reapareceu no limiar de 17%");

  // e nenhum passo de 0,1pp pode mover mais que ~1,5% da prescrição
  for (let bf = 14; bf <= 21; bf += 0.1) {
    const delta = Math.abs(kcalAt(bf) - kcalAt(bf + 0.1));
    assert.ok(delta < tdee * 0.015, `salto de ${delta.toFixed(0)}kcal entre ${bf.toFixed(1)}% e ${(bf + 0.1).toFixed(1)}%`);
  }
});

test("N-1: a histerese segura a fase dentro da banda do ciclo", () => {
  // 13,5% está DENTRO da banda (entre o gatilho de bulking, 13, e o de corte, 16): é exatamente onde a
  // fase anterior tem que decidir, porque a leitura sozinha é ambígua.
  const vindoDeCorte = classifyPathFromBf(13.5, "masculino", 0, "cutting");
  const vindoDeManutencao = classifyPathFromBf(13.5, "masculino", 0, "normocalorico");
  assert.ok(
    vindoDeCorte.surplusPercent < vindoDeManutencao.surplusPercent,
    `quem já cortava deveria seguir cortando: corte ${vindoDeCorte.surplusPercent} vs manutenção ${vindoDeManutencao.surplusPercent}`
  );

  // no teto do bulking vale o oposto: quem já está em superávit segue mais tempo que quem chega de fora
  const vindoDeBulk = classifyPathFromBf(16.0, "masculino", 0, "bulking");
  const chegandoDeFora = classifyPathFromBf(16.0, "masculino", 0, "normocalorico");
  assert.ok(
    vindoDeBulk.surplusPercent > chegandoDeFora.surplusPercent,
    "quem já estava em superávit deveria seguir mais tempo antes de cortar"
  );
});

// ---------------------------------------------------------------------------
// Planejamento de fases — o ciclo tem que FECHAR, não parar no ponto de entrada
// ---------------------------------------------------------------------------

test("PLAN: o ciclo fecha — bulking sobe até o teto e o corte volta ao piso", () => {
  const plano = planejarFases({
    currentWeightKg: 78,
    currentBfPercent: 12.5,
    heightCm: 178,
    sex: "masculino",
    tdee: 2600,
    monthsAhead: 30,
  });

  const fases = plano.fases.map((f) => f.phase);
  assert.equal(fases[0], "bulking", `deveria começar em superávit a 12,5%BF, começou em ${fases[0]}`);
  assert.ok(fases.includes("cutting"), `o plano nunca chega ao corte: ${fases.join(" -> ")}`);

  const bulk = plano.fases[0];
  const limites = bfThresholdsFor("masculino");
  assert.ok(
    bulk.bfFimPercent > limites.bulkBelow + 1,
    `o bulking parou em ${bulk.bfFimPercent.toFixed(1)}%, praticamente no ponto de entrada (${limites.bulkBelow}%) — o ciclo não fechou`
  );
  assert.ok(bulk.duracaoMesesEstimada >= 3, `bulking de só ${bulk.duracaoMesesEstimada} mês(es) não é uma fase`);

  const corte = plano.fases.find((f) => f.phase === "cutting")!;
  assert.ok(corte.bfFimPercent < corte.bfInicioPercent, "o corte deveria reduzir a gordura corporal");
});

test("PLAN: massa magra cresce no bulking e é preservada no corte", () => {
  const plano = planejarFases({
    currentWeightKg: 78,
    currentBfPercent: 12.5,
    heightCm: 178,
    sex: "masculino",
    tdee: 2600,
    monthsAhead: 30,
  });
  const bulk = plano.fases[0];
  assert.ok(bulk.magraFimKg > bulk.magraInicioKg, "bulking sem ganho de massa magra projetado");

  const corte = plano.fases.find((f) => f.phase === "cutting");
  if (corte) {
    const perdaMagra = corte.magraInicioKg - corte.magraFimKg;
    const perdaTotal = corte.pesoInicioKg - corte.pesoFimKg;
    assert.ok(perdaMagra / perdaTotal < 0.25, `o corte projeta ${((perdaMagra / perdaTotal) * 100).toFixed(0)}% da perda como massa magra`);
  }
});

test("PLAN: o TDEE não fica congelado ao longo da projeção", () => {
  const plano = planejarFases({
    currentWeightKg: 78,
    currentBfPercent: 12.5,
    heightCm: 178,
    sex: "masculino",
    tdee: 2600,
    monthsAhead: 12,
  });
  const tdees = plano.meses.map((m) => m.tdee);
  assert.ok(new Set(tdees.map((t) => t.toFixed(0))).size > 3, "o TDEE projetado mal se move — está congelado como antes");
});

test("PLAN: toda fase declara o gatilho que a encerra", () => {
  const plano = planejarFases({
    currentWeightKg: 90,
    currentBfPercent: 24,
    heightCm: 178,
    sex: "masculino",
    tdee: 2700,
    monthsAhead: 24,
  });
  assert.ok(plano.fases.length > 0);
  for (const f of plano.fases) {
    assert.ok(f.gatilhoEntrada.length > 30, `fase ${f.index} sem gatilho de entrada`);
    assert.ok(f.gatilhoSaida.length > 30, `fase ${f.index} sem gatilho de saída`);
    assert.ok(f.oQuePodeMudar.length > 30, `fase ${f.index} sem o que pode mudar`);
  }
  assert.ok(plano.premissas.length >= 4, "o plano precisa declarar as premissas");
  assert.equal(plano.fases[0].phase, "cutting", "alguém a 24%BF deveria começar cortando");
});

// ---------------------------------------------------------------------------
// N-2 — não havia piso nenhum
// ---------------------------------------------------------------------------

test("N-2: nenhuma prescrição fica abaixo do piso de segurança", () => {
  const r = applySafetyLimits({
    proposedKcal: 900, // absurdo de propósito
    proposedProteinG: 60,
    proposedFatG: 20,
    weightKg: 80,
    sex: "masculino",
    strategy: "cutting",
    tdee: 2400,
    bmr: 1750,
  });
  assert.ok(r.kcal >= 1750, `piso do BMR não respeitado: ${r.kcal}`);
  assert.ok(r.proteinG >= 80 * 1.8, "piso de proteína não respeitado");
  assert.ok(r.fatG >= 80 * 0.5, "piso de gordura não respeitado");
  assert.ok(r.warnings.length > 0, "ajustou em silêncio, sem avisar");
});

test("N-2: a variação entre ciclos consecutivos é limitada", () => {
  const r = applySafetyLimits({
    proposedKcal: 1500,
    proposedProteinG: 176,
    proposedFatG: 56,
    weightKg: 80,
    sex: "masculino",
    strategy: "cutting",
    tdee: 2000,
    bmr: 1700,
    previousKcal: 2400,
  });
  assert.ok(r.kcal >= 2400 * 0.85 - 1, `queda de ${(((r.kcal - 2400) / 2400) * 100).toFixed(0)}% passou da trava`);
});

// ---------------------------------------------------------------------------
// N-6 — a soma dos macros tem que bater com o kcal prescrito
// ---------------------------------------------------------------------------

test("N-6: kcal e macros fecham, mesmo em prescrição muito baixa", () => {
  for (const proposedKcal of [900, 1200, 1600, 2000, 3200]) {
    const r = applySafetyLimits({
      proposedKcal,
      proposedProteinG: 176,
      proposedFatG: 56,
      weightKg: 80,
      sex: "masculino",
      strategy: "cutting",
      tdee: 2400,
      bmr: 1700,
    });
    const somaMacros = r.proteinG * 4 + r.fatG * 9 + r.carbG * 4;
    assert.ok(Math.abs(somaMacros - r.kcal) < 1, `${proposedKcal}kcal: macros somam ${somaMacros.toFixed(0)}, kcal é ${r.kcal.toFixed(0)}`);
    assert.ok(r.carbG >= 0, "carboidrato negativo");
  }
});

// ---------------------------------------------------------------------------
// N-3 — a catraca de proteína
// ---------------------------------------------------------------------------

test("N-3: proteína por kg não deriva ao longo dos ciclos", () => {
  // a proteína é decisão de estratégia, não série temporal — mesma estratégia, mesmo g/kg, sempre
  const a = macroTargetsForStrategy("cutting");
  const b = macroTargetsForStrategy("cutting");
  assert.equal(a.proteinPerKg, b.proteinPerKg);
  assert.ok(a.proteinPerKg >= 1.8, "proteína de corte abaixo do piso");
  assert.ok(macroTargetsForStrategy("bulking").proteinPerKg >= 1.6);
});

// ---------------------------------------------------------------------------
// C-2 — data retroativa invertia o sinal da taxa
// ---------------------------------------------------------------------------

test("C-2: dias entre datas têm sinal", () => {
  assert.ok(signedDaysBetween("2026-01-01", "2026-01-31") > 0);
  assert.ok(signedDaysBetween("2026-01-31", "2026-01-01") < 0);
});

test("C-2: um ciclo com data anterior ao último não inverte a taxa", () => {
  const prev: Cycle = { id: "a", date: "2026-03-01", weightKg: 80, bodyFatPercent: 18, kcal: 2400, proteinG: 176, fatG: 56, carbG: 250 };
  // data ANTERIOR ao ciclo anterior: a taxa não pode sair positiva como se tivesse ganho peso
  assert.equal(weeklyRate(82, "2026-02-01", prev), 0, "taxa deveria ser neutralizada, não invertida");
});

// ---------------------------------------------------------------------------
// Convenção de ingestão por intervalo — foi o que enganou a própria simulação
// ---------------------------------------------------------------------------

test("ingestão é atribuída ao intervalo que ela cobre (linha do ciclo ANTERIOR)", () => {
  const history: Cycle[] = [
    { id: "1", date: "2026-01-01", weightKg: 80, bodyFatPercent: 18, kcal: 2500, proteinG: 176, fatG: 56, carbG: 250, actualKcal: 2500 },
    { id: "2", date: "2026-01-31", weightKg: 80, bodyFatPercent: 18, kcal: 3000, proteinG: 176, fatG: 56, carbG: 250 },
  ];
  // peso estável comendo 2500 no intervalo -> TDEE ~2500, NÃO ~3000 (que é a prescrição do ciclo 2,
  // referente ao intervalo seguinte e ainda não vivido)
  const r = estimateEmpiricalTdeeSeries(history, 80, "2026-01-31", "misto");
  assert.ok(Math.abs(r.min - 2500) < 60, `TDEE saiu ${r.min.toFixed(0)}, esperado ~2500 — ingestão atribuída ao intervalo errado`);
});

// ---------------------------------------------------------------------------
// T-1 / T-2 — a meta de volume prometia o que a divisão não entregava
// ---------------------------------------------------------------------------

test("T-1: o volume prescrito é entregue pela divisão, em qualquer nº de dias", () => {
  for (const dias of [1, 2, 3, 4, 5, 6]) {
    const alvos = computeMuscleTargets([], [], 0, dias, 0);
    const meta = alvos.reduce((s, t) => s + t.weeklySets, 0);
    const entregue = seriesEfetivas(buildSplit(dias, alvos));
    const cobertura = entregue / meta;
    assert.ok(cobertura >= 0.95 && cobertura <= 1.1, `${dias} dias: meta ${meta}, entregue ${entregue} (${(cobertura * 100).toFixed(0)}%)`);
  }
});

test("T-1: mais dias de treino nunca entregam menos volume", () => {
  const total = (dias: number) => seriesEfetivas(buildSplit(dias, computeMuscleTargets([], [], 0, dias, 0)));
  for (let dias = 2; dias <= 6; dias++) {
    assert.ok(total(dias) > total(dias - 1), `${dias} dias entregou ${total(dias)}, menos que ${dias - 1} dias (${total(dias - 1)})`);
  }
});

test("T-2: nenhum grupo treinável fica com zero séries na divisão de 3 dias", () => {
  const alvos = computeMuscleTargets([], [], 0, 3, 0);
  const semExercicio = new Set(["lombar"]); // sem exercício primário no catálogo, por design
  for (const alvo of alvos) {
    if (semExercicio.has(alvo.muscle)) continue;
    assert.ok(alvo.weeklySets > 0, `${alvo.muscle} ficou com zero séries`);
  }
});

test("T-2: dois exercícios do mesmo grupo no mesmo dia são padrões diferentes", () => {
  for (const dias of [3, 4, 5, 6]) {
    for (const dia of buildSplit(dias, computeMuscleTargets([], [], 0, dias, 0))) {
      const familiasPorGrupo = new Map<string, Set<string>>();
      for (const item of dia.items) {
        const ex = exerciseById(item.exerciseId)!;
        const vistas = familiasPorGrupo.get(ex.primaryMuscle) ?? new Set<string>();
        assert.ok(
          !vistas.has(ex.movementFamily),
          `${dias} dias, ${dia.label}: dois exercícios da família "${ex.movementFamily}" para ${ex.primaryMuscle}`
        );
        vistas.add(ex.movementFamily);
        familiasPorGrupo.set(ex.primaryMuscle, vistas);
      }
    }
  }
});

test("T-2: o dia de costas tem remada, não só puxada", () => {
  const dias = buildSplit(3, computeMuscleTargets([], [], 0, 3, 0));
  const familiasDeCostas = dias
    .flatMap((d) => d.items)
    .map((i) => exerciseById(i.exerciseId)!)
    .filter((e) => e.primaryMuscle === "costas")
    .map((e) => e.movementFamily);
  assert.ok(familiasDeCostas.includes("remada-horizontal"), `só apareceu ${familiasDeCostas.join(", ")}`);
});

// ---------------------------------------------------------------------------
// T-4 — recuperação ruim não tocava no treino; adesão baixa era no-op
// ---------------------------------------------------------------------------

test("T-4: recuperação ruim e adesão baixa reduzem o volume total", () => {
  const total = (adesao: number, recuperacao: number) =>
    computeMuscleTargets([], [], adesao, 3, recuperacao).reduce((s, t) => s + t.weeklySets, 0);
  const base = total(0, 0);
  assert.ok(total(1, 0) < base, "adesão baixa não mudou nada (era no-op antes)");
  assert.ok(total(0, 2) < base, "recuperação ruim não mudou nada");
  assert.ok(total(0, 6) < total(0, 2), "recuperação muito ruim deveria cortar mais");
});

// ---------------------------------------------------------------------------
// T-5 — o cardio declarava mais do que prescrevia
// ---------------------------------------------------------------------------

test("T-5: o total de cardio declarado é a soma das sessões", () => {
  for (const strategy of ["cutting", "normocalorico", "bulking"] as const) {
    for (const recoveryScore of [0, 2, 4]) {
      const c = prescribeCardio({ strategy, strengthDaysPerWeek: 3, recoveryScore, weightKg: 82 });
      const soma = c.sessions.reduce((s, x) => s + x.frequencyPerWeek * x.minutesPerSession, 0);
      assert.equal(c.totalMinutesPerWeek, soma, `${strategy}/rec${recoveryScore}: declarou ${c.totalMinutesPerWeek}, prescreveu ${soma}`);
      assert.ok(c.estimatedKcalPerDay > 0, "cardio prescrito sem estimativa de gasto");
      for (const s of c.sessions) {
        assert.ok(s.minutesPerSession <= 45, `sessão de ${s.minutesPerSession}min passa do teto`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// T-3 — não havia progressão de carga
// ---------------------------------------------------------------------------

test("T-3: carga parada por 2+ sessões gera sugestão de aumento", () => {
  const logs = ["2026-01-05", "2026-01-12", "2026-01-19"].map((date, i) => ({
    id: `l${i}`,
    date,
    sessionLabel: "Peito",
    setsLogged: [{ exerciseId: "supino-reto-smith", sets: 4, reserveType: "work" as const, loadKg: 60 }],
  }));
  const s = suggestLoadProgression(logs);
  const sug = s.get("supino-reto-smith");
  assert.ok(sug, "nenhuma sugestão gerada");
  assert.ok(sug!.suggestedLoadKg > sug!.lastLoadKg, "carga parada há 3 sessões e não sugeriu subir");
});

test("T-3: carga que acabou de subir não sobe de novo", () => {
  const logs = [
    { id: "a", date: "2026-01-05", sessionLabel: "P", setsLogged: [{ exerciseId: "supino-reto-smith", sets: 4, reserveType: "work" as const, loadKg: 60 }] },
    { id: "b", date: "2026-01-12", sessionLabel: "P", setsLogged: [{ exerciseId: "supino-reto-smith", sets: 4, reserveType: "work" as const, loadKg: 62.5 }] },
  ];
  const sug = suggestLoadProgression(logs).get("supino-reto-smith")!;
  assert.equal(sug.suggestedLoadKg, 62.5, "deveria sustentar a carga recém-aumentada");
});

// ---------------------------------------------------------------------------
// N-4 — a calibração aprendia e o resultado era descartado
// ---------------------------------------------------------------------------

test("N-4: a calibração só aprende de ciclos limpos", () => {
  const sujo = computeTdeeCalibration([
    { date: "2026-01-01", formulaTdee: 2600, empiricalTdee: 2300, dietClean: false, trainingClean: true },
    { date: "2026-02-01", formulaTdee: 2600, empiricalTdee: 2300, dietClean: true, trainingClean: false },
  ]);
  assert.equal(sujo.factor, 1, "aprendeu de ciclo sujo");
  assert.equal(sujo.confidence, "nenhuma");

  const limpo = computeTdeeCalibration([
    { date: "2026-01-01", formulaTdee: 2600, empiricalTdee: 2340, dietClean: true, trainingClean: true },
    { date: "2026-02-01", formulaTdee: 2600, empiricalTdee: 2340, dietClean: true, trainingClean: true },
  ]);
  assert.ok(limpo.factor < 1, "não detectou que a fórmula superestima");
  assert.ok(limpo.factor >= 0.85, "fator passou do limite de segurança");
});

// ---------------------------------------------------------------------------
// Sanidade de ponta a ponta
// ---------------------------------------------------------------------------

test("um ciclo completo produz números plausíveis", () => {
  const comp = estimateBodyComposition({
    weightKg: 82,
    heightCm: 178,
    bodyFatPercent: 17,
    age: 24,
    sex: "masculino",
    exerciseFreq: "3-4",
    sessionDuration: "60-90",
    dailyStepsAvg: 8000,
  });
  assert.ok(comp.bmr > 1400 && comp.bmr < 2200, `BMR implausível: ${comp.bmr}`);
  assert.ok(comp.tdee > comp.bmr, "TDEE menor que BMR");
  assert.ok(comp.targetCarbG >= 0);

  const history: Cycle[] = [
    { id: "1", date: "2026-01-01", weightKg: 84, bodyFatPercent: 19, kcal: 2400, proteinG: 185, fatG: 59, carbG: 220 },
    { id: "2", date: "2026-02-01", weightKg: 83, bodyFatPercent: 18, kcal: 2400, proteinG: 183, fatG: 58, carbG: 220 },
  ];
  const r = predictNextCycle({
    history,
    currentWeightKg: 82,
    currentDate: "2026-03-01",
    weeksToNextConsult: 4,
    gainComposition: "misto",
    stabilityMode: false,
  });
  assert.ok(r, "predictNextCycle devolveu null com histórico válido");
  assert.ok(r!.tdeeRange.min > 1200 && r!.tdeeRange.max < 5000, `TDEE empírico fora de faixa: ${JSON.stringify(r!.tdeeRange)}`);
});


// ---------------------------------------------------------------------------
// T-6 — as sessões saíam sem nenhum aquecimento prescrito
// ---------------------------------------------------------------------------

test("T-6: todo exercício composto que abre um grupo tem aquecimento, e ele não conta como volume", () => {
  const alvos = computeMuscleTargets([], [], 0, 3, 0);
  const sessions = buildSplit(3, alvos);

  let aquecimentos = 0;
  for (const dia of sessions) {
    for (const item of dia.items) {
      const ex = exerciseById(item.exerciseId)!;
      const temAquecimento = item.blocks.some((b) => b.reserveType === "warmup");
      if (temAquecimento) {
        aquecimentos += 1;
        assert.equal(ex.pattern, "composto", `aquecimento prescrito em isolado (${ex.name})`);
      }
    }
  }
  assert.ok(aquecimentos > 0, "nenhuma sessão recebeu aquecimento");

  // a meta continua batendo com o volume EFETIVO, não com o total de séries
  const meta = alvos.reduce((s, t) => s + t.weeklySets, 0);
  assert.ok(Math.abs(seriesEfetivas(sessions) - meta) <= meta * 0.1, "aquecimento inflou o volume efetivo");
});


test("PLAN: a fase é definida por %BF, não por prazo — velocidades diferentes, mesmo alvo", () => {
  // dois cenários idênticos exceto pelo TDEE, que muda a velocidade da resposta: o ALVO de %BF que
  // encerra cada fase tem que ser o mesmo, só o mês estimado muda.
  const lento = planejarFases({ currentWeightKg: 78, currentBfPercent: 12.5, heightCm: 178, sex: "masculino", tdee: 2200, monthsAhead: 30 });
  const rapido = planejarFases({ currentWeightKg: 78, currentBfPercent: 12.5, heightCm: 178, sex: "masculino", tdee: 3200, monthsAhead: 30 });

  assert.equal(lento.fases[0].bfAlvoTermino, rapido.fases[0].bfAlvoTermino, "o alvo de %BF que encerra a fase mudou com a velocidade");
  assert.notEqual(
    lento.fases[0].duracaoMesesEstimada,
    rapido.fases[0].duracaoMesesEstimada,
    "metabolismos diferentes deveriam levar tempos diferentes pra chegar ao mesmo %BF"
  );

  const limites = bfThresholdsFor("masculino");
  assert.equal(lento.fases[0].bfAlvoTermino, limites.cutAbove, "o bulking deveria terminar no teto de %BF do ciclo");
  for (const p of [lento, rapido]) {
    const corte = p.fases.find((f) => f.phase === "cutting");
    if (corte) assert.equal(corte.bfAlvoTermino, limites.bulkBelow, "o corte deveria terminar no piso de %BF do ciclo");
  }
});


// ---------------------------------------------------------------------------
// Laços de realimentação — o app prescrevia cinco coisas e media duas
// ---------------------------------------------------------------------------

test("LAÇO: cardio não feito suja o ciclo (era o único bloco prescrito sem medição)", () => {
  const feito = assessTrainingCleanliness({
    completedSessions: 12, plannedSessions: 12, keptExercisesAndLoads: "seguiu_de_perto",
    effortNearFailure: "sim", cardioSessionsCompleted: 12, cardioSessionsPlanned: 12,
  });
  assert.equal(feito.clean, true, "ciclo com tudo em dia deveria ser limpo");

  const semCardio = assessTrainingCleanliness({
    completedSessions: 12, plannedSessions: 12, keptExercisesAndLoads: "seguiu_de_perto",
    effortNearFailure: "sim", cardioSessionsCompleted: 2, cardioSessionsPlanned: 12,
  });
  assert.equal(semCardio.clean, false, "cardio prescrito e não feito precisa sujar o ciclo");
  assert.ok(semCardio.reasons.some((r) => r.includes("cardio")), "o motivo tem que dizer que foi o cardio");
});

test("LAÇO: confiança baixa na leitura amortece a resposta", () => {
  const alta = classifyPathFromBf(16.5, "masculino", 0, "bulking", "alta").surplusPercent;
  const baixa = classifyPathFromBf(16.5, "masculino", 0, "bulking", "baixa").surplusPercent;
  assert.ok(
    Math.abs(baixa) < Math.abs(alta),
    `leitura de confiança baixa deveria mover menos: alta ${alta}, baixa ${baixa}`
  );
});

test("LAÇO: meta de volume é confrontada com o volume logado, por grupo", () => {
  const alvos = [
    { muscle: "peito" as const, weeklySets: 10 },
    { muscle: "costas" as const, weeklySets: 10 },
  ];
  const logado = new Map([["peito" as const, 9], ["costas" as const, 2]]);
  const r = compareVolumeToTarget(alvos, logado);

  const costas = r.perMuscle.find((m) => m.muscle === "costas")!;
  assert.ok(costas.ratio < 0.3, "costas deveria aparecer como bem abaixo da meta");
  assert.ok(r.summary.includes("Costas"), "o resumo tem que NOMEAR o grupo que ficou pra trás");
  assert.ok(r.overallRatio < 0.7);
});

test("LAÇO: o plano anterior é confrontado com a realidade e distingue as causas", () => {
  const plano = [
    { mes: 1, fase: "bulking" as const, peso: 80, bf: 13.5, kcal: 2900 },
    { mes: 2, fase: "bulking" as const, peso: 81, bf: 14.2, kcal: 2950 },
  ];

  const naRota = confrontarPlano(plano, 2, 81.2, 14.4, "bulking")!;
  assert.equal(naRota.dentroDoPlano, true, "diferença dentro da margem não deveria ser 'fora do plano'");

  // peso fora, %BF na rota -> execução
  const pesoFora = confrontarPlano(plano, 2, 86, 14.2, "bulking")!;
  assert.equal(pesoFora.dentroDoPlano, false);
  assert.ok(pesoFora.veredito.includes("execução"), "peso fora com %BF na rota aponta execução");

  // peso na rota, %BF fora -> repartição
  const bfFora = confrontarPlano(plano, 2, 81, 19, "bulking")!;
  assert.ok(bfFora.veredito.includes("repartição"), "%BF fora com peso na rota aponta repartição");

  assert.equal(confrontarPlano([], 2, 81, 14, "bulking"), null, "sem plano anterior devolve null");
});

/* ─────────────────────────────────────────────────────────────────────────────
 * TREINO — modelo push/pull/legs/upper/lower
 * Pedido do usuário em 2026-08-21: "um treino completo que contemple todos os
 * grupos musculares ao final da semana", no modelo PPL/UL, variando conforme
 * os dias disponíveis, com ponto fraco recebendo exercício a mais.
 * ────────────────────────────────────────────────────────────────────────────*/

test("PPL: todo arranjo de dias cobre todos os grupos com MEV > 0 na semana", () => {
  const obrigatorios = VOLUME_LANDMARKS.filter((l) => l.mev > 0).map((l) => l.muscle);
  for (let dias = 1; dias <= 6; dias++) {
    const cobertos = musclesCoveredBy(dias);
    const faltando = obrigatorios.filter((m) => !cobertos.includes(m));
    assert.deepEqual(faltando, [], `${dias} dia(s)/semana deixou de fora: ${faltando.join(", ")}`);
  }
});

test("PPL: os rótulos dos dias são padrões de movimento, não grupamentos", () => {
  const permitidos = /^(Push|Pull|Legs|Upper|Lower|Corpo inteiro)( [AB])?$/;
  for (let dias = 1; dias <= 6; dias++) {
    const alvos = VOLUME_LANDMARKS.map((l) => ({
      muscle: l.muscle,
      muscleLabel: l.muscle,
      weeklySets: l.mav,
      isPriority: false,
      reason: "",
    }));
    for (const sessao of buildSplit(dias, alvos)) {
      assert.match(sessao.label, permitidos, `rótulo fora do modelo PPL/UL: "${sessao.label}"`);
    }
  }
});

test("PPL: nenhum exercício sai sem séries prescritas", () => {
  for (let dias = 1; dias <= 6; dias++) {
    const alvos = VOLUME_LANDMARKS.map((l) => ({
      muscle: l.muscle,
      muscleLabel: l.muscle,
      weeklySets: l.mav,
      isPriority: false,
      reason: "",
    }));
    for (const sessao of buildSplit(dias, alvos)) {
      for (const item of sessao.items) {
        assert.ok(item.blocks.length > 0, `${sessao.label}/${item.exerciseId} sem nenhum bloco`);
        const work = item.blocks.filter((b) => b.reserveType === "work");
        assert.ok(work.length > 0, `${sessao.label}/${item.exerciseId} sem bloco de trabalho`);
        for (const b of work) {
          assert.ok(b.sets >= 1, `${sessao.label}/${item.exerciseId} com sets=${b.sets}`);
          assert.ok(b.repRange && b.repRange.length > 0, `${sessao.label}/${item.exerciseId} sem faixa de repetição`);
        }
      }
    }
  }
});

test("PPL: ponto fraco recebe MAIS exercícios do que o mesmo grupo sem prioridade", () => {
  const base = VOLUME_LANDMARKS.map((l) => ({
    muscle: l.muscle,
    muscleLabel: l.muscle,
    weeklySets: l.mav,
    isPriority: false,
    reason: "",
  }));
  const comPrioridade = base.map((t) =>
    t.muscle === "biceps" ? { ...t, weeklySets: landmarkFor("biceps").mrv, isPriority: true } : t
  );

  const contaBiceps = (alvos: typeof base) =>
    buildSplit(5, alvos)
      .flatMap((s) => s.items)
      .filter((i) => exerciseById(i.exerciseId)?.primaryMuscle === "biceps").length;

  assert.ok(
    contaBiceps(comPrioridade) > contaBiceps(base),
    `prioridade deveria somar exercícios de bíceps (sem: ${contaBiceps(base)}, com: ${contaBiceps(comPrioridade)})`
  );
});
