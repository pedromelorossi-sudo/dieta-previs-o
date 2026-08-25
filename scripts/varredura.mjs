#!/usr/bin/env node
/* VARREDURA DE INVARIANTES — exercita o algoritmo em centenas de combinações e
 * verifica o que tem de valer SEMPRE, em vez de conferir um caso por vez.
 *
 * Existe porque leitura de código falhou repetidamente neste projeto: oito
 * defeitos em dois dias passaram por `tsc`, lint e testes. Todos os achados
 * sérios vieram de RODAR alguma coisa. Um teste unitário cobre o caso que o
 * autor imaginou; uma varredura cobre o que ele não imaginou.
 *
 * Uso: npx tsc -p tsconfig.test.json && node scripts/varredura.mjs
 */

const B = new URL("../.test-build/src/lib/", import.meta.url).pathname;
const { estimateBodyComposition, classifyPathFromBf, estimateFfmi, macroTargetsForStrategy } = await import(B + "bodyComposition.js");
const { planejarFases } = await import(B + "planoDeFases.js");
const { computeMuscleTargets, buildSplit, ajusteDeFadigaPara, diasEfetivosPara } = await import(B + "trainingSplitBuilder.js");
const { landmarkFor, VOLUME_LANDMARKS } = await import(B + "trainingVolume.js");
const { exerciseById, MUSCLE_GROUP_LABEL } = await import(B + "exerciseLibrary.js");
const { applySafetyLimits } = await import(B + "safety.js");

const falhas = [];
let casos = 0;
const reportar = (grupo, cenario, msg) => falhas.push({ grupo, cenario, msg });

/* ── 1. DIETA: macros, pisos e coerência calórica ───────────────────────── */
const pesos = [45, 55, 64, 70, 85, 100, 120];
const alturas = [150, 160, 170, 180, 190, 200];
const idades = [16, 25, 40, 60, 75];
const bfs = [4, 8, 12, 15, 18, 21, 25, 30, 40, 55];
const sexos = ["masculino", "feminino"];

for (const peso of pesos)
  for (const altura of alturas)
    for (const idade of idades)
      for (const bf of bfs)
        for (const sexo of sexos) {
          casos++;
          const cen = `${sexo} ${peso}kg ${altura}cm ${idade}a ${bf}%BF`;
          let r;
          try {
            r = estimateBodyComposition({
              weightKg: peso, heightCm: altura, bodyFatPercent: bf, age: idade, sex: sexo,
              exerciseFreq: "3-4", sessionDuration: "60-90", sittingHoursPerDay: 8,
            });
          } catch (e) {
            reportar("dieta", cen, `EXCEÇÃO: ${e.message}`);
            continue;
          }

          for (const [nome, v] of Object.entries({
            tdee: r.tdee, bmr: r.bmr, kcal: r.targetKcal,
            proteina: r.targetProteinG, gordura: r.targetFatG, carbo: r.targetCarbG,
          })) {
            if (!Number.isFinite(v)) reportar("dieta", cen, `${nome} não é número finito: ${v}`);
            if (v < 0) reportar("dieta", cen, `${nome} negativo: ${v.toFixed(1)}`);
          }

          // a soma dos macros tem de bater com as calorias
          const somaMacros = r.targetProteinG * 4 + r.targetFatG * 9 + r.targetCarbG * 4;
          if (Math.abs(somaMacros - r.targetKcal) > Math.max(25, r.targetKcal * 0.02))
            reportar("dieta", cen, `macros somam ${somaMacros.toFixed(0)} mas kcal é ${r.targetKcal.toFixed(0)}`);

          // proteína dentro de faixa defensável
          const pPorKg = r.targetProteinG / peso;
          if (pPorKg < 1.2 || pPorKg > 3.5) reportar("dieta", cen, `proteína ${pPorKg.toFixed(2)} g/kg fora de 1,2-3,5`);

          const gPorKg = r.targetFatG / peso;
          if (gPorKg < 0.5) reportar("dieta", cen, `gordura ${gPorKg.toFixed(2)} g/kg abaixo do mínimo hormonal`);

          // o superávit/déficit não pode passar dos limites declarados
          const razao = r.targetKcal / r.tdee;
          if (razao > 1.15 || razao < 0.78) reportar("dieta", cen, `kcal/TDEE = ${razao.toFixed(3)} fora de 0,78-1,15`);

          // a prescrição que CHEGA no usuário passa pelo limitador
          const seg = applySafetyLimits({
            proposedKcal: r.targetKcal, proposedProteinG: r.targetProteinG, proposedFatG: r.targetFatG,
            weightKg: peso, sex: sexo, strategy: r.path, tdee: r.tdee, bmr: r.bmr,
          });
          const pisoSexo = sexo === "masculino" ? 1500 : 1200;
          if (seg.kcal < Math.min(pisoSexo, r.bmr) - 1)
            reportar("dieta", cen, `depois do limitador, ${seg.kcal.toFixed(0)}kcal < piso (BMR ${r.bmr.toFixed(0)}, sexo ${pisoSexo})`);
          if (!Number.isFinite(seg.kcal)) reportar("dieta", cen, `limitador devolveu não-número`);
        }

/* ── 2. ESTRATÉGIA: coerência entre %BF, FFMI e fase ─────────────────────── */
for (const sexo of sexos)
  for (let bf = 4; bf <= 50; bf += 1)
    for (const ffmi of [15, 17, 18.9, 19, 21, 23, 25]) {
      casos++;
      const cen = `${sexo} ${bf}%BF FFMI ${ffmi}`;
      const r = classifyPathFromBf(bf, sexo, 0, undefined, "media", ffmi);
      if (!["cutting", "bulking", "normocalorico"].includes(r.path))
        reportar("estratégia", cen, `fase inválida: ${r.path}`);
      if (!Number.isFinite(r.surplusPercent)) reportar("estratégia", cen, `superávit não finito`);
      if (r.surplusPercent > 0.125 || r.surplusPercent < -0.21)
        reportar("estratégia", cen, `superávit ${(r.surplusPercent * 100).toFixed(1)}% fora dos limites`);
      if (!r.pathReason || r.pathReason.length < 20) reportar("estratégia", cen, `razão vazia ou curta`);
      // rótulo tem de bater com o sinal
      if (r.path === "bulking" && r.surplusPercent <= 0) reportar("estratégia", cen, `"bulking" com superávit ${r.surplusPercent}`);
      if (r.path === "cutting" && r.surplusPercent >= 0) reportar("estratégia", cen, `"cutting" com superávit ${r.surplusPercent}`);
    }

/* ── 3. PROJEÇÃO: 24 meses sem NaN, sem peso absurdo ─────────────────────── */
for (const peso of [50, 64, 85, 110])
  for (const bf of [8, 15, 22, 32])
    for (const sexo of sexos)
      for (const tdee of [1700, 2400, 3100]) {
        casos++;
        const cen = `${sexo} ${peso}kg ${bf}%BF TDEE ${tdee}`;
        let p;
        try {
          p = planejarFases({ currentWeightKg: peso, currentBfPercent: bf, heightCm: 175, sex: sexo, tdee, monthsAhead: 24 });
        } catch (e) { reportar("projeção", cen, `EXCEÇÃO: ${e.message}`); continue; }
        if (p.meses.length !== 24) reportar("projeção", cen, `${p.meses.length} meses em vez de 24`);
        for (const m of p.meses) {
          for (const [k, v] of Object.entries({ peso: m.endWeightKg, bf: m.endBfPercent, magra: m.leanMassKg, kcal: m.recommendedKcal })) {
            if (!Number.isFinite(v)) reportar("projeção", `${cen} mês ${m.monthIndex}`, `${k} não finito`);
          }
          if (m.endBfPercent < 2 || m.endBfPercent > 70) reportar("projeção", `${cen} mês ${m.monthIndex}`, `%BF ${m.endBfPercent.toFixed(1)} implausível`);
          if (m.endWeightKg < 30 || m.endWeightKg > 250) reportar("projeção", `${cen} mês ${m.monthIndex}`, `peso ${m.endWeightKg.toFixed(1)} implausível`);
          if (m.leanMassKg > m.endWeightKg) reportar("projeção", `${cen} mês ${m.monthIndex}`, `massa magra maior que o peso total`);
          if (m.recommendedKcal < 800) reportar("projeção", `${cen} mês ${m.monthIndex}`, `kcal ${m.recommendedKcal.toFixed(0)} abaixo de qualquer piso`);
        }
        /* O modelo não pode EMPURRAR ninguém além do teto natural.
         *
         * A checagem anterior comparava o FFMI final contra 26 em absoluto, e
         * acusava entradas que já nasciam impossíveis — 110kg com 8%BF tem
         * FFMI 33 antes de o modelo tocar em nada. O invariante certo é sobre o
         * que o MODELO faz: se já começa acima do teto, não pode crescer; se
         * começa abaixo, não pode passar. */
        const ffmiInicial = estimateFfmi(peso * (1 - bf / 100), 175);
        const ffmiFinal = estimateFfmi(p.meses[23].leanMassKg, 175);
        if (ffmiInicial >= 25 && ffmiFinal > ffmiInicial + 0.05)
          reportar("projeção", cen, `já começava no teto (FFMI ${ffmiInicial.toFixed(1)}) e o modelo ainda somou massa magra (${ffmiFinal.toFixed(1)})`);
        if (ffmiInicial < 25 && ffmiFinal > 25.5)
          reportar("projeção", cen, `modelo empurrou FFMI de ${ffmiInicial.toFixed(1)} para ${ffmiFinal.toFixed(1)}, acima do teto natural`);
      }

/* ── 4. TREINO: cobertura, orçamento e prescrição válida ─────────────────── */
const gruposComMev = VOLUME_LANDMARKS.filter((l) => l.mev > 0).map((l) => l.muscle);
for (let dias = 1; dias <= 6; dias++)
  for (const rec of [0, 2, 4])
    for (const ader of [0, 1])
      for (const sexo of sexos)
        for (const prio of [[], ["biceps"], ["quadriceps", "peito"]]) {
          casos++;
          const cen = `${dias} dias, rec ${rec}, adesão ${ader}, ${sexo}, prio [${prio}]`;
          let alvos, sessoes;
          try {
            const efet = diasEfetivosPara(dias, rec);
            alvos = computeMuscleTargets([], prio, ader, efet, rec, efet < dias, sexo);
            sessoes = buildSplit(efet, alvos, undefined, ajusteDeFadigaPara(rec));
          } catch (e) { reportar("treino", cen, `EXCEÇÃO: ${e.message}`); continue; }

          const entregue = new Map();
          for (const s of sessoes) {
            let seriesNaSessao = 0;
            const vistosNoDia = new Map();
            for (const it of s.items) {
              const ex = exerciseById(it.exerciseId);
              if (!ex) { reportar("treino", cen, `exercício inexistente no catálogo: ${it.exerciseId}`); continue; }
              if (!it.blocks?.length) reportar("treino", cen, `${ex.name} sem nenhum bloco de série`);
              let efetivas = 0;
              for (const b of it.blocks) {
                if (!Number.isFinite(b.sets) || b.sets <= 0) reportar("treino", cen, `${ex.name}: sets inválido (${b.sets})`);
                if (!b.repRange) reportar("treino", cen, `${ex.name}: sem faixa de repetição`);
                if (b.rirTarget != null && (b.rirTarget < 0 || b.rirTarget > 8)) reportar("treino", cen, `${ex.name}: RIR ${b.rirTarget} fora de 0-8`);
                if (b.reserveType === "work" || b.reserveType === "topset") efetivas += b.sets;
              }
              seriesNaSessao += efetivas;
              entregue.set(ex.primaryMuscle, (entregue.get(ex.primaryMuscle) ?? 0) + efetivas);
              // duas vezes a MESMA família para o MESMO grupo no MESMO dia é redundância
              const chave = `${ex.primaryMuscle}|${ex.movementFamily}`;
              if (vistosNoDia.has(chave)) reportar("treino", cen, `${s.label}: ${ex.movementFamily} repetida para ${MUSCLE_GROUP_LABEL[ex.primaryMuscle]}`);
              vistosNoDia.set(chave, true);
            }
            if (seriesNaSessao > 18 + 3) reportar("treino", cen, `${s.label} com ${seriesNaSessao} séries (teto 18 + abdominal)`);
          }

          // nenhum grupo pode passar do MRV
          for (const [m, n] of entregue) {
            const lm = landmarkFor(m);
            if (lm && n > lm.mrv) reportar("treino", cen, `${MUSCLE_GROUP_LABEL[m]} com ${n} séries acima do MRV ${lm.mrv}`);
          }
          // com 3+ dias, todo grupo de MEV>0 tem de aparecer
          if (dias >= 3) {
            for (const m of gruposComMev) {
              if (!entregue.has(m)) reportar("treino", cen, `${MUSCLE_GROUP_LABEL[m]} (MEV ${landmarkFor(m).mev}) não aparece na semana`);
            }
          }
          // prioridade declarada tem de receber pelo menos tanto quanto sem prioridade
          for (const p of prio) {
            const alvo = alvos.find((a) => a.muscle === p);
            if (alvo && alvo.weeklySets <= 0) reportar("treino", cen, `prioridade ${MUSCLE_GROUP_LABEL[p]} com meta zero`);
          }
        }

/* ── RELATÓRIO ───────────────────────────────────────────────────────────── */
console.log("═".repeat(76));
console.log(`VARREDURA DE INVARIANTES — ${casos.toLocaleString("pt-BR")} casos exercitados`);
console.log("═".repeat(76));

if (falhas.length === 0) {
  console.log("\n✓ Nenhuma violação de invariante.\n");
} else {
  const porGrupo = new Map();
  for (const f of falhas) {
    if (!porGrupo.has(f.grupo)) porGrupo.set(f.grupo, new Map());
    const g = porGrupo.get(f.grupo);
    const chave = f.msg.replace(/[\d.,]+/g, "N");
    if (!g.has(chave)) g.set(chave, []);
    g.get(chave).push(f);
  }
  for (const [grupo, tipos] of porGrupo) {
    console.log(`\n▸ ${grupo.toUpperCase()}  —  ${[...tipos.values()].reduce((n, a) => n + a.length, 0)} ocorrência(s), ${tipos.size} tipo(s)`);
    for (const [, lista] of [...tipos.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n   ✗ ${lista[0].msg}`);
      console.log(`     ${lista.length}× — ex: ${lista[0].cenario}`);
      if (lista.length > 1) console.log(`     ..... ${lista[lista.length - 1].cenario}`);
    }
  }
  console.log(`\n${"═".repeat(76)}\nTOTAL: ${falhas.length} violação(ões) em ${casos.toLocaleString("pt-BR")} casos.`);
}
