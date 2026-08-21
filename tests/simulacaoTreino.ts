/* Simulador de treino — roda o pipeline REAL do app e imprime o programa que
 * sai, para auditoria humana.
 *
 * Não é teste: não afirma nada. Existe para materializar o que o algoritmo
 * produz, porque auditar o código sem ver a saída é opinião, não auditoria.
 *
 * Rodar:  npx tsc -p tsconfig.test.json && node .test-build/tests/simulacaoTreino.js
 */

import {
  computeMuscleTargets,
  buildSplit,
  planTrainingPeriodization,
  type MuscleAssessmentInput,
} from "../src/lib/trainingSplitBuilder";
import { exerciseById, MUSCLE_GROUP_LABEL, type MuscleGroup } from "../src/lib/exerciseLibrary";
import { VOLUME_LANDMARKS, landmarkFor } from "../src/lib/trainingVolume";

const linha = (c = "─") => c.repeat(78);

interface Cenario {
  nome: string;
  contexto: string;
  dias: number;
  /** leitura visual das fotos pelo Claude — é daqui que sai o ponto fraco */
  leitura: MuscleAssessmentInput[];
  /** prioridade declarada por coach humano (vence a foto) */
  prioridade: MuscleGroup[];
  /** 0 = aderiu bem; >=1 corta orçamento */
  adesao: number;
  /** 0 = recuperado; >=2 corta; >=4 corta muito */
  recuperacao: number;
}

const CENARIOS: Cenario[] = [
  {
    nome: "A · 5 dias, braço e ombro atrasados",
    contexto:
      "Fisiculturista natural, off-season, 4 anos de treino. A leitura das fotos apontou bíceps e ombro atrás do resto; peito em destaque. Adesão boa, recuperado.",
    dias: 5,
    leitura: [
      { muscle: "biceps", relativeDevelopment: "atras_dos_outros", confidence: "alta" },
      { muscle: "ombro", relativeDevelopment: "atras_dos_outros", confidence: "media" },
      { muscle: "peito", relativeDevelopment: "destaque", confidence: "alta" },
      { muscle: "costas", relativeDevelopment: "proporcional", confidence: "alta" },
      { muscle: "quadriceps", relativeDevelopment: "proporcional", confidence: "media" },
    ],
    prioridade: [],
    adesao: 0,
    recuperacao: 0,
  },
  {
    nome: "B · 3 dias, posterior de coxa atrasado",
    contexto:
      "Mesma pessoa numa fase com pouco tempo — só 3 dias de academia. Posterior de coxa lido como atrasado. Adesão boa, recuperado.",
    dias: 3,
    leitura: [
      { muscle: "posterior_coxa", relativeDevelopment: "atras_dos_outros", confidence: "alta" },
      { muscle: "quadriceps", relativeDevelopment: "destaque", confidence: "alta" },
    ],
    prioridade: [],
    adesao: 0,
    recuperacao: 0,
  },
  {
    nome: "C · 5 dias, prioridade declarada pelo coach (costas e braço)",
    contexto:
      "Consultoria humana mandou focar costas e bíceps — prioridade declarada vence a leitura da foto. Adesão boa, recuperado.",
    dias: 5,
    leitura: [{ muscle: "costas", relativeDevelopment: "proporcional", confidence: "alta" }],
    prioridade: ["costas", "biceps"],
    adesao: 0,
    recuperacao: 0,
  },
  {
    nome: "D · 5 dias, sinais de recuperação ruim",
    contexto:
      "Fim de um cutting agressivo: sono ruim, força caindo, fome alta. O orçamento de volume deve encolher — o teste é se o algoritmo recua de verdade.",
    dias: 5,
    leitura: [{ muscle: "biceps", relativeDevelopment: "atras_dos_outros", confidence: "alta" }],
    prioridade: [],
    adesao: 1,
    recuperacao: 4,
  },
];

function imprimeCenario(c: Cenario) {
  console.log("\n" + linha("━"));
  console.log(`CENÁRIO ${c.nome}`);
  console.log(linha("━"));
  console.log(c.contexto);
  console.log(`\nDias de treino por semana: ${c.dias}`);
  if (c.prioridade.length) {
    console.log(`Prioridade declarada pelo coach: ${c.prioridade.map((m) => MUSCLE_GROUP_LABEL[m]).join(", ")}`);
  }
  console.log(`Sinal de adesão: ${c.adesao} · Sinal de recuperação: ${c.recuperacao}`);

  const alvos = computeMuscleTargets(c.leitura, c.prioridade, c.adesao, c.recuperacao === 0 ? c.dias : c.dias, c.recuperacao);

  console.log("\n" + linha());
  console.log("META DE VOLUME SEMANAL POR GRUPO (séries efetivas)");
  console.log(linha());
  console.log("grupo".padEnd(20) + "meta".padStart(6) + "MEV".padStart(6) + "MAV".padStart(6) + "MRV".padStart(6) + "  situação");
  for (const t of alvos) {
    const lm = landmarkFor(t.muscle);
    const situacao =
      t.weeklySets === 0
        ? "SEM VOLUME"
        : t.weeklySets < lm.mev
          ? "abaixo do MEV"
          : t.weeklySets > lm.mrv
            ? "ACIMA DO MRV"
            : t.weeklySets >= lm.mav
              ? "entre MAV e MRV"
              : "entre MEV e MAV";
    console.log(
      MUSCLE_GROUP_LABEL[t.muscle].padEnd(20) +
        String(t.weeklySets).padStart(6) +
        String(lm.mev).padStart(6) +
        String(lm.mav).padStart(6) +
        String(lm.mrv).padStart(6) +
        "  " +
        situacao +
        (t.isPriority ? "  ★ prioridade" : "")
    );
  }
  const total = alvos.reduce((n, t) => n + t.weeklySets, 0);
  console.log(`\nTotal semanal: ${total} séries efetivas em ${c.dias} dias (${(total / c.dias).toFixed(1)}/sessão)`);

  console.log("\n" + linha());
  console.log("PROGRAMA DA SEMANA");
  console.log(linha());

  const sessoes = buildSplit(c.dias, alvos);
  const seriesPorGrupo = new Map<MuscleGroup, number>();
  const exerciciosPorGrupo = new Map<MuscleGroup, Set<string>>();

  for (const s of sessoes) {
    const efetivas = s.items.reduce(
      (n, it) => n + it.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset").reduce((k, b) => k + b.sets, 0),
      0
    );
    console.log(`\n▸ ${s.label}  —  ${s.items.length} exercícios, ${efetivas} séries efetivas`);
    for (const item of s.items) {
      const ex = exerciseById(item.exerciseId);
      if (!ex) {
        console.log(`   ?? exercício desconhecido: ${item.exerciseId}`);
        continue;
      }
      const blocos = item.blocks
        .map((b) => `${b.reserveType} ${b.sets}×${b.repRange}${b.rirTarget != null ? ` RIR${b.rirTarget}` : ""}`)
        .join("  |  ");
      console.log(
        `   ${ex.name.padEnd(42)} ${MUSCLE_GROUP_LABEL[ex.primaryMuscle].padEnd(18)} ${ex.pattern.padEnd(9)} ${blocos}`
      );

      const efet = item.blocks
        .filter((b) => b.reserveType === "work" || b.reserveType === "topset")
        .reduce((k, b) => k + b.sets, 0);
      seriesPorGrupo.set(ex.primaryMuscle, (seriesPorGrupo.get(ex.primaryMuscle) ?? 0) + efet);
      if (!exerciciosPorGrupo.has(ex.primaryMuscle)) exerciciosPorGrupo.set(ex.primaryMuscle, new Set());
      exerciciosPorGrupo.get(ex.primaryMuscle)!.add(ex.id);
    }
  }

  console.log("\n" + linha());
  console.log("CONFERÊNCIA: o que o programa ENTREGA vs. a meta");
  console.log(linha());
  console.log("grupo".padEnd(20) + "meta".padStart(6) + "entregue".padStart(10) + "exercícios".padStart(12) + "  frequência");
  const freq = new Map<MuscleGroup, number>();
  for (const s of sessoes) {
    const gruposNoDia = new Set(s.items.map((i) => exerciseById(i.exerciseId)?.primaryMuscle).filter(Boolean) as MuscleGroup[]);
    for (const g of gruposNoDia) freq.set(g, (freq.get(g) ?? 0) + 1);
  }
  for (const lm of VOLUME_LANDMARKS) {
    const meta = alvos.find((t) => t.muscle === lm.muscle)?.weeklySets ?? 0;
    const entregue = seriesPorGrupo.get(lm.muscle) ?? 0;
    const nEx = exerciciosPorGrupo.get(lm.muscle)?.size ?? 0;
    const f = freq.get(lm.muscle) ?? 0;
    const alerta = meta > 0 && entregue === 0 ? "  ⚠ META > 0 MAS NADA PRESCRITO" : meta > 0 && entregue < meta * 0.7 ? "  ⚠ entrega bem abaixo da meta" : "";
    console.log(
      MUSCLE_GROUP_LABEL[lm.muscle].padEnd(20) +
        String(meta).padStart(6) +
        String(entregue).padStart(10) +
        String(nEx).padStart(12) +
        `  ${f}×/semana` +
        alerta
    );
  }
}

for (const c of CENARIOS) imprimeCenario(c);

/* Mesociclo: a rampa de volume ao longo de 5 semanas, no cenário A */
console.log("\n\n" + linha("━"));
console.log("MESOCICLO — cenário A, 5 semanas (progressão de volume + deload)");
console.log(linha("━"));
const alvosA = computeMuscleTargets(CENARIOS[0].leitura, [], 0, 5, 0);
for (const semana of planTrainingPeriodization(alvosA, 5, 5)) {
  const totalSemana = semana.sessions.reduce(
    (n, s) =>
      n +
      s.items.reduce(
        (k, it) => k + it.blocks.filter((b) => b.reserveType === "work" || b.reserveType === "topset").reduce((j, b) => j + b.sets, 0),
        0
      ),
    0
  );
  console.log(`\n${semana.label}${semana.isDeload ? "  [DELOAD]" : ""} — ${totalSemana} séries efetivas na semana`);
  console.log(`   ${semana.focusNote}`);
}
console.log("");
