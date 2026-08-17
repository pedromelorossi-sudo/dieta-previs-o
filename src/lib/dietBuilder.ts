import { getFood } from "./foods";

export interface DietItem {
  id: string;
  foodId: string;
  quantityG: number;
}

export interface DietMeal {
  id: string;
  name: string;
  items: DietItem[];
}

export interface Diet {
  id: string;
  name: string;
  createdAt: string;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
  meals: DietMeal[];
}

export interface MacroTotals {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
}

export function itemMacros(item: DietItem): MacroTotals {
  const food = getFood(item.foodId);
  if (!food) return { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  const ratio = item.quantityG / 100;
  return {
    kcal: food.kcal100 * ratio,
    proteinG: food.protein100 * ratio,
    fatG: food.fat100 * ratio,
    carbG: food.carb100 * ratio,
  };
}

export function mealTotals(meal: DietMeal): MacroTotals {
  return meal.items.reduce(
    (acc, item) => {
      const m = itemMacros(item);
      return { kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG, fatG: acc.fatG + m.fatG, carbG: acc.carbG + m.carbG };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );
}

export function dietTotals(diet: Diet): MacroTotals {
  return diet.meals.reduce(
    (acc, meal) => {
      const m = mealTotals(meal);
      return { kcal: acc.kcal + m.kcal, proteinG: acc.proteinG + m.proteinG, fatG: acc.fatG + m.fatG, carbG: acc.carbG + m.carbG };
    },
    { kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }
  );
}

export const MEAL_PRESETS = ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar", "Ceia"];
