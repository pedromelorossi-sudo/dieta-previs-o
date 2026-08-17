import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { FOODS, getFood } from "./foods";
import { DietMeal } from "./dietBuilder";
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

/** Monta o plano de refeições via Claude, restrito ao catálogo fechado de alimentos — usado tanto pela geração
 * standalone (/api/gerar-dieta) quanto pelo fluxo integrado de novo ciclo (/api/previsao-ia). */
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

  const contextText = `Catálogo de alimentos permitidos (use SOMENTE estes ids em foodId):
${catalogText}

Metas do dia: ${targetKcal.toFixed(0)}kcal, proteína ${targetProteinG.toFixed(0)}g, gordura ${targetFatG.toFixed(0)}g, carboidrato ${targetCarbG.toFixed(0)}g.
Número de refeições: ${mealsCount}.
Alimentos que não podem faltar (inclua todos, em pelo menos uma refeição cada): ${validMustHave.length ? validMustHave.map((id) => getFood(id)?.name ?? id).join(", ") : "nenhum especificado"}.
Preferência de tempo de preparo: ${cookingTime}.
Observações do usuário: ${notes || "nenhuma"}.`;

  const SYSTEM_PROMPT = `Você monta planos alimentares distribuindo alimentos de um catálogo fechado em refeições, para bater metas diárias de kcal/proteína/gordura/carboidrato. Regras: (1) use exclusivamente os ids do catálogo fornecido — nunca invente um alimento fora dele; (2) a soma de todas as refeições deve chegar o mais perto possível das metas (idealmente dentro de 5%); (3) todo alimento marcado como "não pode faltar" deve aparecer em pelo menos uma refeição; (4) distribua de forma plausível (proteína/carbo/gordura em cada refeição, não empilhe tudo numa só); (5) responda só pela ferramenta fornecida, com quantidades em gramas realistas (entre 10g e 500g por item).`;

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2000,
    output_config: { effort: "medium" },
    system: SYSTEM_PROMPT,
    tools: [
      {
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
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [{ role: "user", content: contextText }],
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

  const missingMustHave = validMustHave.filter((id) => !meals.some((m) => m.items.some((i) => i.foodId === id)));
  for (const id of missingMustHave) {
    warnings.push(`"${getFood(id)?.name ?? id}" não foi incluído pelo modelo — adicione manualmente se quiser.`);
  }

  return { meals, warnings };
}
