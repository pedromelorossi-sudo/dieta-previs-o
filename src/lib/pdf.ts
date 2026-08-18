import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Diet, dietTotals, itemMacros, mealTotals } from "./dietBuilder";
import { findSubstitutes, getFood } from "./foods";
import { fmt, fmtDate } from "./format";

const ACCENT: [number, number, number] = [16, 150, 100];
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
