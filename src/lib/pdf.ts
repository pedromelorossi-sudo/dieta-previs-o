/* jsPDF entra por import DINÂMICO, não estático.
 *
 * Estático, ele viajava no bundle inicial destas páginas: 460 KB — 20% de todo
 * o JavaScript do app — baixados por QUEM NUNCA CLICA em "baixar PDF". Gerar
 * PDF é ação pontual e deliberada; carregar a biblioteca no momento do clique
 * custa alguns décimos de segundo a quem realmente usa, e zero a todo mundo. */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Diet, dietTotals, itemMacros, mealTotals } from "./dietBuilder";
import { TrainingSession } from "./trainingBuilder";
import { exerciseById, MUSCLE_GROUP_LABEL } from "./exerciseLibrary";
import { findSubstitutes, getFood } from "./foods";
import { fmt, fmtDate } from "./format";

// azul #0071e3, o mesmo acento da interface. Era verde de um tema anterior.
const ACCENT: [number, number, number] = [0, 113, 227];
const MUTED: [number, number, number] = [110, 120, 118];
const DARK: [number, number, number] = [20, 24, 24];

function finalY(doc: jsPDF): number {
  const anyDoc = doc as unknown as { lastAutoTable?: { finalY: number } };
  return anyDoc.lastAutoTable?.finalY ?? 40;
}

export function generateDietPdf(diet: Diet): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text(diet.name || "Plano alimentar", marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  y += 16;
  doc.text(`Gerado em ${fmtDate(new Date().toISOString().slice(0, 10))}`, marginX, y);

  y += 18;
  const totals = dietTotals(diet);
  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [["Meta diária", "Kcal", "Proteína", "Gordura", "Carboidrato"]],
    body: [
      [
        "Alvo",
        fmt(diet.targetKcal, 0),
        `${fmt(diet.targetProteinG, 0)} g`,
        `${fmt(diet.targetFatG, 0)} g`,
        `${fmt(diet.targetCarbG, 0)} g`,
      ],
      [
        "Total do plano",
        fmt(totals.kcal, 0),
        `${fmt(totals.proteinG, 0)} g`,
        `${fmt(totals.fatG, 0)} g`,
        `${fmt(totals.carbG, 0)} g`,
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    styles: { cellPadding: 6 },
  });
  y = finalY(doc) + 24;

  for (const meal of diet.meals) {
    if (meal.items.length === 0) continue;
    if (y > 700) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text(meal.name, marginX, y);
    y += 8;

    const mt = mealTotals(meal);
    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Alimento", "Quantidade", "Kcal", "Proteína", "Gordura", "Carboidrato"]],
      body: meal.items.map((item) => {
        const food = getFood(item.foodId);
        const m = itemMacros(item);
        return [
          food?.name ?? "—",
          `${fmt(item.quantityG, 0)} g`,
          fmt(m.kcal, 0),
          `${fmt(m.proteinG, 0)} g`,
          `${fmt(m.fatG, 0)} g`,
          `${fmt(m.carbG, 0)} g`,
        ];
      }),
      foot: [["Subtotal", "", fmt(mt.kcal, 0), `${fmt(mt.proteinG, 0)} g`, `${fmt(mt.fatG, 0)} g`, `${fmt(mt.carbG, 0)} g`]],
      theme: "striped",
      headStyles: { fillColor: [30, 41, 40], textColor: [255, 255, 255], fontSize: 8.5 },
      footStyles: { fillColor: [235, 245, 241], textColor: DARK, fontSize: 8.5, fontStyle: "bold" },
      bodyStyles: { fontSize: 8.5, textColor: DARK },
      styles: { cellPadding: 5 },
    });
    y = finalY(doc) + 22;
  }

  // substituições
  const usedFoodIds = new Set<string>();
  const referenceQty = new Map<string, number>();
  for (const meal of diet.meals) {
    for (const item of meal.items) {
      usedFoodIds.add(item.foodId);
      if (!referenceQty.has(item.foodId)) referenceQty.set(item.foodId, item.quantityG);
    }
  }

  if (usedFoodIds.size > 0) {
    if (y > 650) {
      doc.addPage();
      y = 48;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...DARK);
    doc.text("Lista de substituições", marginX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    y += 12;
    doc.text("Trocas equivalentes no macro principal do grupo (proteína, carboidrato ou gordura).", marginX, y);
    y += 10;

    const rows: string[][] = [];
    usedFoodIds.forEach((foodId) => {
      const food = getFood(foodId);
      const qty = referenceQty.get(foodId) ?? 100;
      const subs = findSubstitutes(foodId, qty).slice(0, 4);
      if (!food || subs.length === 0) return;
      rows.push([
        `${food.name} (${fmt(qty, 0)}g)`,
        subs.map((s) => `${s.food.name} (${fmt(s.equivalentG, 0)}g)`).join("  ·  "),
      ]);
    });

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Alimento original", "Pode substituir por"]],
      body: rows,
      theme: "grid",
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8, textColor: DARK, valign: "top" },
      columnStyles: { 0: { cellWidth: 150 }, 1: { cellWidth: "auto" } },
      styles: { cellPadding: 5 },
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text("Gerado por Degrau — não substitui acompanhamento profissional.", marginX, 820);
  }

  const filename = `${(diet.name || "dieta").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  doc.save(filename);
}


/** Plano de treino em PDF — o artefato que se leva pra academia. A dieta já tinha o equivalente
 * (generateDietPdf); o treino era só uma lista na tela, e uma divisão de 5 dias não cabe na memória.
 *
 * Uma decisão de conteúdo: as séries de AQUECIMENTO aparecem, mas em linha separada e discreta, porque
 * não são estímulo e não entram na contagem de volume (mesma regra de isEffective em trainingVolume.ts).
 * Misturá-las com as séries de trabalho faria o praticante achar que fez mais volume do que fez. */
export function generateTrainingPdf(sessions: TrainingSession[], nome = "Plano de treino"): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 40;
  let y = 48;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...DARK);
  doc.text(nome, marginX, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  y += 16;

  const totalTrabalho = sessions.reduce(
    (a, s) =>
      a +
      s.items.reduce(
        (b, it) => b + it.blocks.filter((x) => x.reserveType === "work" || x.reserveType === "topset").reduce((c, x) => c + x.sets, 0),
        0
      ),
    0
  );
  doc.text(
    `Gerado em ${fmtDate(new Date().toISOString().slice(0, 10))} · ${sessions.length} ${sessions.length === 1 ? "dia" : "dias"}/semana · ${totalTrabalho} séries efetivas/semana`,
    marginX,
    y
  );
  y += 22;

  for (const [i, session] of sessions.entries()) {
    const trabalho = session.items.reduce(
      (b, it) => b + it.blocks.filter((x) => x.reserveType === "work" || x.reserveType === "topset").reduce((c, x) => c + x.sets, 0),
      0
    );
    const aquecimento = session.items.reduce(
      (b, it) => b + it.blocks.filter((x) => x.reserveType === "warmup").reduce((c, x) => c + x.sets, 0),
      0
    );
    /* `buildSplit` prescreve um bloco `feeder` (aproximação) pra TODO exercício, sempre — diferente do
       `warmup`, que é condicional. Antes só entrava aquecimento na estimativa de minutos e nenhum bloco
       feeder aparecia na tabela abaixo, embora a série estivesse de fato prescrita. */
    const aproximacaoMin = session.items.reduce(
      (b, it) => b + it.blocks.filter((x) => x.reserveType === "feeder").reduce((c, x) => c + x.sets, 0),
      0
    );
    const minutos = Math.round(trabalho * 2.5 + aquecimento + aproximacaoMin);

    // quebra de página quando o dia não cabe no que sobrou da folha
    if (y > 690) {
      doc.addPage();
      y = 48;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...DARK);
    doc.text(`Dia ${i + 1} — ${session.label}`, marginX, y);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(`${session.items.length} exercícios · ${trabalho} séries · ~${minutos}min`, marginX, y + 12);
    y += 22;

    const linhas: string[][] = [];
    for (const [j, item] of session.items.entries()) {
      const ex = exerciseById(item.exerciseId);
      const nomeEx = ex?.name ?? item.exerciseId;
      const alvo = ex ? `${MUSCLE_GROUP_LABEL[ex.primaryMuscle]}${ex.unilateral ? " (por lado)" : ""}` : "";

      const aq = item.blocks.find((b) => b.reserveType === "warmup");
      const aprox = item.blocks.find((b) => b.reserveType === "feeder");
      const primeiraLinha = aq || aprox;
      if (aq) {
        linhas.push([`${j + 1}. ${nomeEx}`, alvo, "aquecimento", `${aq.sets} x ${aq.repRange}`, "leve"]);
      }
      if (aprox) {
        linhas.push([aq ? "" : `${j + 1}. ${nomeEx}`, aq ? "" : alvo, "aproximação", `${aprox.sets} x ${aprox.repRange}`, "leve"]);
      }
      for (const b of item.blocks.filter((x) => x.reserveType === "work" || x.reserveType === "topset")) {
        linhas.push([
          primeiraLinha ? "" : `${j + 1}. ${nomeEx}`,
          primeiraLinha ? "" : alvo,
          b.reserveType === "topset" ? "top set" : "trabalho",
          `${b.sets} x ${b.repRange}`,
          [b.loadKg != null ? `${fmt(b.loadKg, 1)}kg` : "", b.rirTarget != null ? `${b.rirTarget} na reserva` : ""].filter(Boolean).join(" · ") || "-",
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      margin: { left: marginX, right: marginX },
      head: [["Exercício", "Alvo", "Tipo", "Séries x reps", "Carga / esforço"]],
      body: linhas,
      theme: "grid",
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontSize: 8.5 },
      bodyStyles: { fontSize: 8.5, textColor: DARK },
      styles: { cellPadding: 5 },
      columnStyles: {
        0: { cellWidth: 175 },
        1: { cellWidth: 80 },
        2: { cellWidth: 62 },
        3: { cellWidth: 72 },
      },
      // linha de aquecimento em cinza, pra não ser confundida com série de trabalho
      didParseCell: (data) => {
        if (data.section === "body" && data.row.raw && (data.row.raw as string[])[2] === "aquecimento") {
          data.cell.styles.textColor = MUTED;
          data.cell.styles.fontStyle = "italic";
        }
      },
    });
    y = finalY(doc) + 22;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(
    "RIR = repetições em reserva: quantas você ainda conseguiria fazer ao encerrar a série. Aquecimento nao conta como volume.",
    marginX,
    Math.min(y, 800)
  );

  doc.save(`${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * GUIA DE METODOLOGIA — treino e dieta
 *
 * O app prescreve "work 3×6-10 RIR 2" e assume que a pessoa sabe o que isso
 * quer dizer. Este PDF é o documento que fecha essa lacuna: explica o
 * vocabulário da prescrição e o raciocínio por trás dela, para levar impresso
 * ou consultar fora do site.
 *
 * Regra do projeto que vale aqui também: onde existe evidência publicada, ela é
 * citada; onde não existe, o texto diz que é convenção prática. Não inventar
 * respaldo é mais importante num documento que a pessoa vai tratar como manual.
 * ══════════════════════════════════════════════════════════════════════════ */

interface Secao {
  titulo: string;
  paragrafos?: string[];
  itens?: [string, string][];
  nota?: string;
}

const GUIA_TREINO: Secao[] = [
  {
    titulo: "Como ler a prescrição",
    paragrafos: [
      "Cada exercício aparece como uma sequência de blocos. Um bloco diz o tipo de série, quantas séries, a faixa de repetições, o quão perto da falha parar e o intervalo de descanso. Exemplo: “Trabalho 3×6-10 · RIR 2 · 3 min” significa três séries de trabalho, entre 6 e 10 repetições cada, parando quando ainda restariam 2 repetições no tanque, descansando 3 minutos entre elas.",
    ],
    itens: [
      ["Aquecimento", "Séries leves de aproximação, feitas só no primeiro movimento pesado de cada padrão na sessão. Servem para preparar articulação e sistema nervoso, não para gerar estímulo. Saem em rampa: uma série a ~50% da carga de trabalho com mais repetições, outra a ~70% com menos."],
      ["Aproximação (feeder)", "Série intermediária, muito leve, usada para achar a execução antes da carga pesada. Não conta como volume."],
      ["Trabalho (work set)", "A série que constrói músculo. É ela, e só ela, que entra na contagem de volume semanal. Todas as decisões do app sobre MEV/MAV/MRV contam séries de trabalho."],
      ["Top set", "A série mais pesada do exercício no dia, quando o esquema pede uma série máxima antes das demais. Conta como volume, igual à série de trabalho."],
      ["RIR", "Repetições em reserva: quantas repetições você ainda conseguiria fazer quando encerra a série. RIR 2 = parou com 2 no tanque. RIR 0 = foi até a falha."],
    ],
    nota: "Aquecimento e aproximação NÃO contam volume de propósito. Se contassem, o app acharia que você treinou mais do que treinou e reduziria o estímulo real.",
  },
  {
    titulo: "Por que RIR e não “sempre até a falha”",
    paragrafos: [
      "Treinar até a falha em todas as séries não produz mais hipertrofia do que parar 1-2 repetições antes, e cobra bem mais em fadiga e tempo de recuperação. Por isso a prescrição usa RIR 2 em exercícios compostos (agachamento, supino, remada) e RIR 1 em isolados.",
      "A diferença tem lógica prática: falhar num agachamento com barra tem custo real — articular, neural e de segurança. Falhar numa rosca não tem. Quanto maior o exercício, mais longe da falha vale parar.",
      "Em semanas de recuperação ruim ou de deload, o app afasta ainda mais: RIR 4 em composto e 3 em isolado. Cortar volume mantendo RIR 1 não é recuperar — é fazer uma semana normal mais curta.",
    ],
  },
  {
    titulo: "Volume: MEV, MAV e MRV",
    paragrafos: [
      "O volume de cada grupo muscular é medido em séries de trabalho por semana, e o app trabalha com três referências:",
    ],
    itens: [
      ["MEV", "Volume mínimo efetivo. Abaixo disso o grupo não progride — em fase de restrição calórica, pode até regredir. É um piso, não um alvo."],
      ["MAV", "Faixa de melhor custo-benefício. É onde o app tenta colocar a maioria dos grupos quando o orçamento de tempo permite."],
      ["MRV", "Volume máximo recuperável. Passando daqui, a recuperação vira o fator limitante e mais série deixa de virar mais músculo."],
    ],
    nota: "A relação entre séries semanais e hipertrofia é bem documentada (Schoenfeld, Ogborn & Krieger 2016, DOI 10.1080/02640414.2016.1210197; atualizada por Pelland et al. 2025, DOI 10.1007/s40279-025-02344-w). O que NÃO existe publicado é uma tabela de MEV/MAV/MRV por grupo muscular individual — os números que o app usa são os intervalos genéricos dessas meta-análises ajustados pela prática comum. Trate como ponto de partida ajustável pela sua resposta real, não como lei.",
  },
  {
    titulo: "Volume indireto",
    paragrafos: [
      "Um exercício treina mais de um músculo. Toda puxada e toda remada trabalham bíceps; todo supino e desenvolvimento trabalham tríceps e ombro. O app conta esse estímulo indireto com metade do peso de uma série direta, porque o músculo secundário trabalha em amplitude e tensão menores.",
      "Isso muda a prescrição de verdade: um bíceps com 10 séries diretas mais 12 séries de puxada já soma perto do teto recuperável. Nesse ponto, somar mais rosca não acelera nada — pode atrapalhar. O que fecha diferença ali é trocar exercício e posição na sessão, não volume.",
    ],
  },
  {
    titulo: "A divisão: Push, Pull, Legs, Upper, Lower",
    paragrafos: [
      "Os dias são nomeados pelo PADRÃO DE MOVIMENTO, não pelo grupo muscular. Push é tudo que empurra (peito, ombro, tríceps), Pull é tudo que puxa (costas, deltoide posterior, bíceps, antebraço, lombar), Legs são as pernas. Upper e Lower são metade de cima e metade de baixo.",
      "A vantagem sobre nomear por grupo é que o particionamento não deixa buraco: todo músculo do tronco pertence a exatamente um dos dois padrões, então nenhum fica esquecido na semana.",
    ],
    itens: [
      ["1 dia", "Corpo inteiro"],
      ["2 dias", "Upper / Lower"],
      ["3 dias", "Push / Pull / Legs"],
      ["4 dias", "Upper / Lower × 2"],
      ["5 dias", "Push / Pull / Legs / Upper / Lower"],
      ["6 dias", "Push / Pull / Legs × 2"],
    ],
    nota: "Frequência por si só não muda hipertrofia quando o volume total é igual (Schoenfeld, Grgic & Krieger 2018, DOI 10.1080/02640414.2018.1555906). A divisão existe para encaixar o volume-alvo em sessões de tamanho treinável, não porque uma frequência seja superior.",
  },
  {
    titulo: "Ponto fraco",
    paragrafos: [
      "Quando a leitura das fotos marca um grupo como atrás dos outros, ou quando você declara uma prioridade, o app faz quatro coisas — e volume é só uma delas:",
    ],
    itens: [
      ["Frequência", "O grupo passa a aparecer duas vezes na semana, não uma."],
      ["Posição", "Entra no começo da sessão, com você descansado."],
      ["Variedade", "O mesmo volume é espalhado em MAIS exercícios, cobrindo mais ângulos — não empilhado em séries do mesmo movimento."],
      ["Volume", "A meta sobe, mas limitada pelo teto recuperável e pelo que o volume indireto já entrega."],
    ],
    nota: "Somar duas séries por semana num grupo atrasado não fecha diferença nenhuma. Frequência, posição na sessão e variedade de ângulo pesam mais — por isso o app mexe nos quatro.",
  },
  {
    titulo: "Progressão e deload",
    paragrafos: [
      "O bloco de treino tem cinco semanas: quatro de acúmulo, com o volume subindo em passos de cerca de 8%, e uma quinta de deload.",
      "O deload não é só volume pela metade. É volume pela metade MAIS o RIR dois pontos mais longe da falha, sem agachamento nem levantamento terra com barra, e concentrado em menos sessões. Cortar série mantendo RIR 1 não recupera nada.",
      "Quando os dias disponíveis não dão margem para rampa de volume, o app avisa e aponta o caminho real de progressão naquele cenário: mais carga na mesma série, não mais séries.",
    ],
  },
  {
    titulo: "Carga axial",
    paragrafos: [
      "Agachamento, levantamento terra, stiff e afins carregam a coluna sob flexão de quadril. Eretor lombar e tecido conjuntivo recuperam mais devagar que o músculo dos membros e não avisam antes de falhar.",
      "Por isso o app limita: no máximo dois desses exercícios com barra por semana, e no máximo um por sessão. Passando disso, ele troca por uma alternativa que não carrega a coluna — mesa flexora, leg press, cadeira extensora. Numa semana de recuperação ruim, tira todos.",
    ],
  },
];

const GUIA_DIETA: Secao[] = [
  {
    titulo: "Proteína a cada 3 horas",
    paragrafos: [
      "A síntese proteica muscular não responde de forma contínua ao que está no sangue. Ela dispara quando a leucina de uma refeição ultrapassa um limiar, sustenta por volta de duas horas e volta ao basal por volta da terceira — mesmo que os aminoácidos continuem elevados no sangue. É o chamado “muscle full effect”.",
      "A consequência prática: espaçar refeições proteicas em torno de 3 em 3 horas aproveita mais disparos por dia do que concentrar tudo em duas refeições grandes, ou do que fracionar demais em porções pequenas que não alcançam o limiar.",
      "Um ensaio comparou a mesma quantidade total de proteína em três padrões ao longo de 12 horas: 20 g a cada 3 h, 40 g a cada 6 h, e 10 g a cada 1,5 h. O padrão de 20 g a cada 3 h produziu a maior síntese proteica (Areta et al. 2013, J Physiol, DOI 10.1113/jphysiol.2012.244897).",
    ],
    itens: [
      ["Quantas refeições", "Quatro a cinco refeições com proteína, espaçadas em torno de 3 horas."],
      ["Quanto por refeição", "O suficiente para cruzar o limiar de leucina — na prática, cerca de 0,4 g de proteína por quilo de peso, ou 30-40 g para a maioria dos adultos treinados."],
      ["Fonte importa", "Proteína animal, whey, ovo e laticínio têm mais leucina por grama. Fonte vegetal costuma precisar de porção maior para o mesmo efeito."],
    ],
    nota: "O total diário continua sendo o fator mais importante. A distribuição é um refinamento em cima dele, não um substituto: comer 2 g/kg mal distribuídos ainda vence comer 1 g/kg em horários perfeitos.",
  },
  {
    titulo: "Proteína total do dia",
    paragrafos: [
      "A faixa que a literatura sustenta para maximizar ganho de massa magra em quem treina é de 1,6 a 2,2 g por quilo de peso corporal por dia. Acima disso, o ganho adicional é desprezível (Morton et al. 2018, Br J Sports Med, DOI 10.1136/bjsports-2017-097608).",
      "O app usa pisos mais altos em fase de restrição calórica: quanto maior o déficit, mais proteína protege massa magra. Em cutting o piso sobe para 1,8 g/kg.",
    ],
  },
  {
    titulo: "Gordura: existe um piso",
    paragrafos: [
      "Gordura não é só caloria — ela sustenta produção hormonal e absorção de vitaminas lipossolúveis. Por isso o app trata 0,5 g por quilo como piso intransponível, mesmo quando cortar gordura seria o jeito mais fácil de fechar as calorias do déficit.",
      "Na prática isso significa que, num corte agressivo, o carboidrato cede antes da gordura descer do piso.",
    ],
  },
  {
    titulo: "Carboidrato como resíduo",
    paragrafos: [
      "A ordem de cálculo é: primeiro as calorias totais, depois a proteína (por peso), depois a gordura (por peso, respeitando o piso), e o carboidrato recebe o que sobrou.",
      "Isso não é desprezo pelo carboidrato — é reconhecer que proteína e gordura têm requisitos mínimos ligados a função, e o carboidrato é a variável de ajuste que sobra para fechar a conta energética.",
    ],
  },
  {
    titulo: "De onde vem o seu gasto calórico",
    paragrafos: [
      "O app não usa só fórmula. A partir do segundo ciclo, ele retrocalcula o seu gasto real a partir de como o seu peso respondeu ao que você comeu — o que a fórmula errava, a sua resposta corrige.",
      "É a diferença entre estimar e medir. Nas simulações de validação, a estimativa por fórmula errou cerca de 10,8% e o gasto retrocalculado errou 2,3%. É por isso que registrar o ciclo com honestidade vale mais que qualquer ajuste fino de macro.",
    ],
    nota: "Um ciclo só “ensina” o algoritmo se a adesão foi real. Se você comeu bem diferente do prescrito, o app detecta e descarta aquele ciclo da calibração em vez de aprender uma lição errada.",
  },
  {
    titulo: "Limites de déficit e superávit",
    paragrafos: [
      "Superávit máximo de 12% acima do gasto. Acima disso, a proporção do ganho que vira gordura sobe sem ganho proporcional de massa magra.",
      "Déficit de retorno de 12% para voltar ao ponto de partida depois de um bulking, e déficit profundo de até 20% quando há mais gordura a perder. O corte mais leve preserva mais massa magra; o mais agressivo é para quando o tempo importa mais.",
      "Existe também um piso calórico absoluto e um teto de mudança por ciclo, para o algoritmo nunca prescrever um salto que o corpo não acompanha.",
    ],
    nota: "Os tamanhos de superávit e déficit têm respaldo em ensaio randomizado. Os limiares de percentual de gordura que decidem QUANDO trocar de fase não têm — são convenção prática do projeto, e o app diz isso em vez de fingir precisão.",
  },
];

function desenhaGuia(doc: jsPDF, titulo: string, secoes: Secao[], corTitulo: [number, number, number]): void {
  const marginX = 44;
  const larguraTexto = 595 - marginX * 2;
  let y = 60;

  const quebraPagina = (altura: number) => {
    if (y + altura > 780) {
      doc.addPage();
      y = 60;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...corTitulo);
  doc.text(titulo, marginX, y);
  y += 26;

  for (const secao of secoes) {
    quebraPagina(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...DARK);
    doc.text(secao.titulo, marginX, y);
    y += 16;

    for (const p of secao.paragrafos ?? []) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...DARK);
      const linhas = doc.splitTextToSize(p, larguraTexto) as string[];
      quebraPagina(linhas.length * 12 + 6);
      doc.text(linhas, marginX, y);
      y += linhas.length * 12 + 6;
    }

    if (secao.itens?.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: marginX, right: marginX },
        body: secao.itens,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: { top: 3, bottom: 3, left: 0, right: 6 }, textColor: DARK },
        // só a coluna do rótulo tem largura fixa; a da explicação é dimensionada
        // pelo autoTable, que já desconta padding e margem sozinho
        columnStyles: { 0: { cellWidth: 110, fontStyle: "bold" } },
        tableWidth: larguraTexto,
      });
      y = finalY(doc) + 8;
    }

    if (secao.nota) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      const linhas = doc.splitTextToSize(secao.nota, larguraTexto - 12) as string[];
      quebraPagina(linhas.length * 11 + 14);
      // fio vertical à esquerda da nota, no lugar de caixa colorida
      doc.setDrawColor(...MUTED);
      doc.setLineWidth(1.2);
      doc.line(marginX, y - 8, marginX, y + linhas.length * 11 - 6);
      doc.text(linhas, marginX + 10, y);
      y += linhas.length * 11 + 12;
    }

    y += 8;
  }
}

/** Monta o documento e devolve, sem salvar. Separado de `generateMetodologiaPdf`
 * para o conteúdo poder ser gerado e conferido fora do navegador — `doc.save()`
 * só existe no browser, e um PDF de manual precisa ser LIDO antes de ir ao ar. */
export function buildMetodologiaPdf(): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  desenhaGuia(doc, "Metodologia de treino", GUIA_TREINO, ACCENT);
  doc.addPage();
  desenhaGuia(doc, "Orientações de dieta", GUIA_DIETA, ACCENT);

  // rodapé com a mesma ressalva que o app exibe no rodapé da tela
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(
      "Degrau · modelo pessoal com poucos pontos de dado — hipóteses de trabalho, não leis confirmadas. Não substitui acompanhamento profissional.",
      44,
      812
    );
    doc.text(`${i}/${total}`, 551, 812, { align: "right" });
  }

  return doc;
}

/** Guia de metodologia — treino e dieta, num PDF só. */
export function generateMetodologiaPdf(): void {
  buildMetodologiaPdf().save("degrau-metodologia.pdf");
}
