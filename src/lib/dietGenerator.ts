import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { FOODS, getFood } from "./foods";
import { DietMeal, mealTotals, MacroTotals } from "./dietBuilder";
import { Restriction } from "./questionnaire";

export interface GenerateDietParams {
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
  mealsCount: number;
  mustHaveFoodIds: string[];
  restrictions: Restriction[];
  excludedFoodIds: string[];
  cookingTime: string;
  notes: string;
}

export interface GenerateDietResult {
  meals: DietMeal[];
  warnings: string[];
}

const TOOL_NAME = "gerar_plano";

// tolerância pra considerar o plano "bateu a meta" sem precisar de mais uma rodada de correção —
// dentro disso a diferença é irrelevante na prática (arredondamento de porção)
const KCAL_TOLERANCE_PCT = 0.05;
const PROTEIN_TOLERANCE_G = 8;
const MAX_ATTEMPTS = 3;

export function allowedFoods(restrictions: Restriction[], excludedFoodIds: string[]) {
  return FOODS.filter((f) => {
    if (excludedFoodIds.includes(f.id)) return false;
    if (restrictions.includes("vegano") && !f.vegan) return false;
    if (restrictions.includes("vegetariano") && !f.vegetarian) return false;
    if (restrictions.includes("sem_lactose") && !f.lactoseFree) return false;
    if (restrictions.includes("sem_gluten") && !f.glutenFree) return false;
    return true;
  });
}

function planTotals(meals: DietMeal[]): MacroTotals {
  return meals.reduce(
    (acc, m) => {
      const t = mealTotals(m);
      return { kcal: acc.kcal + t.kcal, proteinG: acc.proteinG + t.proteinG, fatG: acc.fatG + t.fatG, carbG: acc.carbG + t.carbG };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );
}

function withinTolerance(totals: MacroTotals, targetKcal: number, targetProteinG: number): boolean {
  const kcalOk = Math.abs(totals.kcal - targetKcal) <= targetKcal * KCAL_TOLERANCE_PCT;
  const proteinOk = Math.abs(totals.proteinG - targetProteinG) <= PROTEIN_TOLERANCE_G;
  return kcalOk && proteinOk;
}

// pontuação de desvio (menor é melhor) — usada só pra escolher a MELHOR tentativa entre as rodadas de
// correção, caso nenhuma feche dentro da tolerância; proteína pesa mais porque é a meta clínica
// prioritária (kcal tem mais margem de negociação natural via carbo/gordura)
function deviationScore(totals: MacroTotals, targetKcal: number, targetProteinG: number): number {
  const kcalDevPct = targetKcal > 0 ? Math.abs(totals.kcal - targetKcal) / targetKcal : 0;
  const proteinDevPct = targetProteinG > 0 ? Math.abs(totals.proteinG - targetProteinG) / targetProteinG : 0;
  return proteinDevPct * 2 + kcalDevPct;
}

/** Monta o plano de refeições via Claude, restrito ao catálogo fechado de alimentos — usado tanto pela geração
 * standalone (/api/gerar-dieta) quanto pelo fluxo integrado de novo ciclo (/api/previsao-ia).
 *
 * Não é uma sugestão solta: kcal/proteína são as metas prescritas pelo algoritmo determinístico (previsão do
 * usuário), então o modelo tem algumas rodadas pra se corrigir com feedback do desvio real antes de aceitar
 * o resultado — sempre usando julgamento sobre o catálogo/contexto, nunca distorcendo porções de forma
 * pouco plausível só pra bater um número exato. */
export async function generateDietMeals(client: Anthropic, params: GenerateDietParams): Promise<GenerateDietResult> {
  const { targetKcal, targetProteinG, targetFatG, targetCarbG, mealsCount, mustHaveFoodIds, restrictions, excludedFoodIds, cookingTime, notes } = params;

  const catalog = allowedFoods(restrictions ?? [], excludedFoodIds ?? []);
  const warnings: string[] = [];

  const validMustHave = (mustHaveFoodIds ?? []).filter((id) => {
    const ok = catalog.some((f) => f.id === id);
    if (!ok) {
      const food = getFood(id);
      warnings.push(`"${food?.name ?? id}" foi ignorado por conflitar com suas restrições.`);
    }
    return ok;
  });

  const catalogText = catalog
    .map((f) => `- ${f.id} | ${f.name} | ${f.category} | por 100g: ${f.kcal100}kcal, P${f.protein100}g, G${f.fat100}g, C${f.carb100}g`)
    .join("\n");

  const baseContextText = `Catálogo de alimentos permitidos (use SOMENTE estes ids em foodId):
${catalogText}

Metas do dia (prescritas pelo algoritmo, não são sugestões): ${targetKcal.toFixed(0)}kcal, proteína ${targetProteinG.toFixed(0)}g, gordura ${targetFatG.toFixed(0)}g, carboidrato ${targetCarbG.toFixed(0)}g.
Número de refeições: ${mealsCount}.
Alimentos que não podem faltar (inclua todos, em pelo menos uma refeição cada): ${validMustHave.length ? validMustHave.map((id) => getFood(id)?.name ?? id).join(", ") : "nenhum especificado"}.
Preferência de tempo de preparo: ${cookingTime}.
Observações do usuário: ${notes || "nenhuma"}.`;

  const SYSTEM_PROMPT = `Você monta planos alimentares distribuindo alimentos de um catálogo fechado em refeições, para bater metas diárias de kcal/proteína/gordura/carboidrato prescritas por um algoritmo determinístico (não são chutes, são as metas reais do usuário). Regras: (1) use exclusivamente os ids do catálogo fornecido — nunca invente um alimento fora dele; (2) a prioridade número 1 é chegar o mais perto possível de kcal e proteína — dentro de ${(KCAL_TOLERANCE_PCT * 100).toFixed(0)}% de kcal e ${PROTEIN_TOLERANCE_G}g de proteína; gordura/carboidrato têm mais margem; (3) todo alimento marcado como "não pode faltar" deve aparecer em pelo menos uma refeição; (4) distribua de forma plausível (proteína/carbo/gordura em cada refeição, não empilhe tudo numa só, porções realistas de uma pessoa comendo aquilo); (5) use julgamento sobre o catálogo e o contexto (preferência de preparo, observações do usuário) — não distorça uma porção pra algo pouco plausível (ex: 550g de peito de frango numa refeição) só pra fechar um número exato; é melhor ficar muito perto e plausível do que exato e absurdo; (6) responda só pela ferramenta fornecida, com quantidades em gramas realistas (entre 10g e 500g por item).`;

  const toolDef: Anthropic.Tool = {
    name: TOOL_NAME,
    description: "Registra o plano alimentar gerado.",
    input_schema: {
      type: "object",
      properties: {
        meals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    foodId: { type: "string", enum: catalog.map((f) => f.id) },
                    quantityG: { type: "number" },
                  },
                  required: ["foodId", "quantityG"],
                },
              },
            },
            required: ["name", "items"],
          },
        },
      },
      required: ["meals"],
    },
  };

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: baseContextText }];

  let bestMeals: DietMeal[] | null = null;
  let bestTotals: MacroTotals | null = null;
  let bestScore = Infinity;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [toolDef],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages,
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use" && b.name === TOOL_NAME);
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("O modelo não retornou um plano válido.");
    }

    const raw = toolBlock.input as { meals: { name: string; items: { foodId: string; quantityG: number }[] }[] };

    const meals: DietMeal[] = raw.meals.map((m) => ({
      id: randomUUID(),
      name: m.name || "Refeição",
      items: m.items
        .filter((i) => catalog.some((f) => f.id === i.foodId))
        .map((i) => ({
          id: randomUUID(),
          foodId: i.foodId,
          quantityG: Math.min(600, Math.max(5, Math.round(i.quantityG))),
        })),
    }));

    const totals = planTotals(meals);
    const score = deviationScore(totals, targetKcal, targetProteinG);
    if (score < bestScore) {
      bestMeals = meals;
      bestTotals = totals;
      bestScore = score;
    }

    if (withinTolerance(totals, targetKcal, targetProteinG) || attempt === MAX_ATTEMPTS) break;

    const kcalDelta = targetKcal - totals.kcal;
    const proteinDelta = targetProteinG - totals.proteinG;
    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: toolBlock.id, content: "Recebido — plano fora da tolerância, precisa de um ajuste." },
        {
          type: "text",
          text: `Esse plano ficou em ${totals.kcal.toFixed(0)}kcal (meta ${targetKcal.toFixed(0)}kcal, ${
            kcalDelta >= 0 ? "faltam" : "sobram"
          } ${Math.abs(kcalDelta).toFixed(0)}kcal) e ${totals.proteinG.toFixed(0)}g de proteína (meta ${targetProteinG.toFixed(0)}g, ${
            proteinDelta >= 0 ? "faltam" : "sobram"
          } ${Math.abs(proteinDelta).toFixed(1)}g). Ajuste as quantidades (ou troque por outro alimento do catálogo mais adequado) pra chegar mais perto dessas duas metas — sem deixar nenhuma porção implausível. Devolva o plano completo de novo pela ferramenta.`,
        },
      ],
    });
  }

  const meals = bestMeals!;
  const finalTotals = bestTotals!;

  const missingMustHave = validMustHave.filter((id) => !meals.some((m) => m.items.some((i) => i.foodId === id)));
  for (const id of missingMustHave) {
    warnings.push(`"${getFood(id)?.name ?? id}" não foi incluído pelo modelo — adicione manualmente se quiser.`);
  }

  if (!withinTolerance(finalTotals, targetKcal, targetProteinG)) {
    warnings.push(
      `Mesmo após ajustes, o plano ficou em ${finalTotals.kcal.toFixed(0)}kcal e ${finalTotals.proteinG.toFixed(
        0
      )}g de proteína (meta: ${targetKcal.toFixed(0)}kcal, ${targetProteinG.toFixed(
        0
      )}g) — o catálogo disponível não permitiu chegar mais perto sem porções pouco plausíveis. Ajuste manualmente se precisar bater a meta com mais precisão.`
    );
  }

  return { meals, warnings };
}
