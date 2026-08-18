export type FoodCategory = "proteina" | "carboidrato" | "gordura" | "fruta" | "vegetal";

export interface Food {
  id: string;
  name: string;
  category: FoodCategory;
  /** grupo de substituição — trocas dentro do mesmo grupo mantêm o macro principal equivalente */
  group: string;
  kcal100: number;
  protein100: number;
  fat100: number;
  carb100: number;
  /** unidade prática de referência, ex: "1 unidade média ≈ 120g" */
  unitHint?: string;
  vegetarian: boolean;
  vegan: boolean;
  lactoseFree: boolean;
  glutenFree: boolean;
}

/** valores aproximados por 100g (cozido/preparado quando aplicável), base TACO/USDA */
export const FOODS: Food[] = [
  // proteínas animais
  { id: "frango-peito", name: "Peito de frango grelhado", category: "proteina", group: "prot_animal", kcal100: 165, protein100: 31, fat100: 3.6, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "patinho-moido", name: "Patinho moído cozido", category: "proteina", group: "prot_animal", kcal100: 172, protein100: 26, fat100: 7, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "carne-magra", name: "Carne bovina magra grelhada", category: "proteina", group: "prot_animal", kcal100: 190, protein100: 28, fat100: 8, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "tilapia", name: "Tilápia grelhada", category: "proteina", group: "prot_animal", kcal100: 128, protein100: 26, fat100: 2.7, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "salmao", name: "Salmão grelhado", category: "proteina", group: "prot_animal", kcal100: 208, protein100: 22, fat100: 13, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "ovo-inteiro", name: "Ovo inteiro cozido", category: "proteina", group: "prot_animal", kcal100: 155, protein100: 13, fat100: 11, carb100: 1.1, unitHint: "1 unidade ≈ 50g", vegetarian: true, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "clara-ovo", name: "Clara de ovo cozida", category: "proteina", group: "prot_animal", kcal100: 52, protein100: 11, fat100: 0.2, carb100: 0.7, vegetarian: true, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "atum-lata", name: "Atum enlatado (água)", category: "proteina", group: "prot_animal", kcal100: 116, protein100: 26, fat100: 1, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "iogurte-grego", name: "Iogurte grego natural", category: "proteina", group: "prot_animal", kcal100: 97, protein100: 9, fat100: 5, carb100: 4, vegetarian: true, vegan: false, lactoseFree: false, glutenFree: true },
  { id: "queijo-cottage", name: "Queijo cottage", category: "proteina", group: "prot_animal", kcal100: 98, protein100: 11, fat100: 4.3, carb100: 3.4, vegetarian: true, vegan: false, lactoseFree: false, glutenFree: true },
  { id: "whey", name: "Whey protein (pó)", category: "proteina", group: "prot_suplemento", kcal100: 380, protein100: 80, fat100: 6, carb100: 8, unitHint: "1 dose ≈ 30g", vegetarian: true, vegan: false, lactoseFree: false, glutenFree: true },
  { id: "peito-peru", name: "Peito de peru grelhado", category: "proteina", group: "prot_animal", kcal100: 135, protein100: 29, fat100: 1.7, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "lombo-suino", name: "Lombo suíno grelhado", category: "proteina", group: "prot_animal", kcal100: 173, protein100: 27, fat100: 6.5, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "camarao", name: "Camarão grelhado", category: "proteina", group: "prot_animal", kcal100: 99, protein100: 21, fat100: 1.4, carb100: 0.2, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "merluza", name: "Merluza grelhada", category: "proteina", group: "prot_animal", kcal100: 112, protein100: 23, fat100: 1.5, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "picanha", name: "Picanha grelhada", category: "proteina", group: "prot_animal", kcal100: 259, protein100: 25, fat100: 17, carb100: 0, vegetarian: false, vegan: false, lactoseFree: true, glutenFree: true },
  { id: "queijo-minas", name: "Queijo minas frescal", category: "proteina", group: "prot_animal", kcal100: 264, protein100: 17, fat100: 20, carb100: 3.2, vegetarian: true, vegan: false, lactoseFree: false, glutenFree: true },
  { id: "leite-desnatado", name: "Leite desnatado", category: "proteina", group: "prot_animal", kcal100: 35, protein100: 3.4, fat100: 0.2, carb100: 5, vegetarian: true, vegan: false, lactoseFree: false, glutenFree: true },
  // proteínas vegetais
  { id: "tofu", name: "Tofu firme", category: "proteina", group: "prot_vegetal", kcal100: 76, protein100: 8, fat100: 4.8, carb100: 1.9, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "feijao-preto", name: "Feijão preto cozido", category: "proteina", group: "prot_vegetal", kcal100: 77, protein100: 4.5, fat100: 0.5, carb100: 14, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "lentilha", name: "Lentilha cozida", category: "proteina", group: "prot_vegetal", kcal100: 93, protein100: 6.3, fat100: 0.4, carb100: 16, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "grao-de-bico", name: "Grão-de-bico cozido", category: "proteina", group: "prot_vegetal", kcal100: 121, protein100: 7.3, fat100: 2, carb100: 20, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "edamame", name: "Edamame cozido", category: "proteina", group: "prot_vegetal", kcal100: 122, protein100: 11, fat100: 5, carb100: 10, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "proteina-ervilha", name: "Proteína de ervilha (pó)", category: "proteina", group: "prot_suplemento", kcal100: 375, protein100: 78, fat100: 5, carb100: 7, unitHint: "1 dose ≈ 30g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  // carboidratos
  { id: "arroz-branco", name: "Arroz branco cozido", category: "carboidrato", group: "carbo", kcal100: 128, protein100: 2.5, fat100: 0.2, carb100: 28, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "arroz-integral", name: "Arroz integral cozido", category: "carboidrato", group: "carbo", kcal100: 124, protein100: 2.6, fat100: 1, carb100: 26, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "batata-doce", name: "Batata doce cozida", category: "carboidrato", group: "carbo", kcal100: 86, protein100: 1.6, fat100: 0.1, carb100: 20, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "batata-inglesa", name: "Batata inglesa cozida", category: "carboidrato", group: "carbo", kcal100: 87, protein100: 1.9, fat100: 0.1, carb100: 20, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "mandioca", name: "Mandioca cozida", category: "carboidrato", group: "carbo", kcal100: 125, protein100: 0.6, fat100: 0.3, carb100: 30, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "macarrao", name: "Macarrão cozido", category: "carboidrato", group: "carbo", kcal100: 131, protein100: 5, fat100: 1.1, carb100: 25, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: false },
  { id: "aveia", name: "Aveia em flocos", category: "carboidrato", group: "carbo_seco", kcal100: 389, protein100: 17, fat100: 7, carb100: 66, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "pao-frances", name: "Pão francês", category: "carboidrato", group: "carbo_seco", kcal100: 300, protein100: 8, fat100: 3, carb100: 58, unitHint: "1 unidade ≈ 50g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: false },
  { id: "pao-integral", name: "Pão integral", category: "carboidrato", group: "carbo_seco", kcal100: 253, protein100: 9, fat100: 3.5, carb100: 45, unitHint: "1 fatia ≈ 25g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: false },
  { id: "tapioca", name: "Tapioca (goma hidratada)", category: "carboidrato", group: "carbo", kcal100: 240, protein100: 0, fat100: 0, carb100: 60, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "quinoa", name: "Quinoa cozida", category: "carboidrato", group: "carbo", kcal100: 120, protein100: 4.4, fat100: 1.9, carb100: 21, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "cuscuz", name: "Cuscuz de milho", category: "carboidrato", group: "carbo", kcal100: 112, protein100: 2.2, fat100: 0.3, carb100: 25, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "mandioquinha", name: "Mandioquinha cozida", category: "carboidrato", group: "carbo", kcal100: 80, protein100: 1.3, fat100: 0.3, carb100: 19, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "milho", name: "Milho cozido", category: "carboidrato", group: "carbo", kcal100: 98, protein100: 3.4, fat100: 1.5, carb100: 21, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "granola", name: "Granola sem açúcar", category: "carboidrato", group: "carbo_seco", kcal100: 471, protein100: 10, fat100: 20, carb100: 64, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: false },
  { id: "batata-baroa", name: "Inhame cozido", category: "carboidrato", group: "carbo", kcal100: 118, protein100: 1.5, fat100: 0.2, carb100: 28, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  // gorduras
  { id: "azeite", name: "Azeite de oliva extra virgem", category: "gordura", group: "gordura", kcal100: 884, protein100: 0, fat100: 100, carb100: 0, unitHint: "1 colher de sopa ≈ 13g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "pasta-amendoim", name: "Pasta de amendoim integral", category: "gordura", group: "gordura", kcal100: 588, protein100: 25, fat100: 50, carb100: 20, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "castanha-para", name: "Castanha-do-pará", category: "gordura", group: "gordura", kcal100: 656, protein100: 14, fat100: 66, carb100: 12, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "amendoas", name: "Amêndoas", category: "gordura", group: "gordura", kcal100: 579, protein100: 21, fat100: 50, carb100: 22, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "abacate", name: "Abacate", category: "gordura", group: "gordura", kcal100: 160, protein100: 2, fat100: 15, carb100: 8.5, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "castanha-caju", name: "Castanha de caju", category: "gordura", group: "gordura", kcal100: 553, protein100: 18, fat100: 44, carb100: 30, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "chia", name: "Semente de chia", category: "gordura", group: "gordura", kcal100: 486, protein100: 17, fat100: 31, carb100: 42, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "linhaca", name: "Semente de linhaça", category: "gordura", group: "gordura", kcal100: 534, protein100: 18, fat100: 42, carb100: 29, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "oleo-coco", name: "Óleo de coco", category: "gordura", group: "gordura", kcal100: 862, protein100: 0, fat100: 100, carb100: 0, unitHint: "1 colher de sopa ≈ 13g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "azeitona", name: "Azeitona preta", category: "gordura", group: "gordura", kcal100: 349, protein100: 2.4, fat100: 36, carb100: 6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  // frutas
  { id: "banana", name: "Banana", category: "fruta", group: "fruta", kcal100: 89, protein100: 1.1, fat100: 0.3, carb100: 23, unitHint: "1 unidade ≈ 100g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "maca", name: "Maçã", category: "fruta", group: "fruta", kcal100: 52, protein100: 0.3, fat100: 0.2, carb100: 14, unitHint: "1 unidade ≈ 130g", vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "morango", name: "Morango", category: "fruta", group: "fruta", kcal100: 32, protein100: 0.7, fat100: 0.3, carb100: 7.7, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "mamao", name: "Mamão", category: "fruta", group: "fruta", kcal100: 43, protein100: 0.5, fat100: 0.3, carb100: 11, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "laranja", name: "Laranja", category: "fruta", group: "fruta", kcal100: 47, protein100: 0.9, fat100: 0.1, carb100: 12, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "uva", name: "Uva", category: "fruta", group: "fruta", kcal100: 69, protein100: 0.7, fat100: 0.2, carb100: 18, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "abacaxi", name: "Abacaxi", category: "fruta", group: "fruta", kcal100: 50, protein100: 0.5, fat100: 0.1, carb100: 13, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "manga", name: "Manga", category: "fruta", group: "fruta", kcal100: 60, protein100: 0.8, fat100: 0.4, carb100: 15, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "kiwi", name: "Kiwi", category: "fruta", group: "fruta", kcal100: 61, protein100: 1.1, fat100: 0.5, carb100: 15, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "melancia", name: "Melancia", category: "fruta", group: "fruta", kcal100: 30, protein100: 0.6, fat100: 0.2, carb100: 7.6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "pera", name: "Pera", category: "fruta", group: "fruta", kcal100: 57, protein100: 0.4, fat100: 0.1, carb100: 15, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  // vegetais (grupo "livre" — baixa caloria, à vontade)
  { id: "brocolis", name: "Brócolis cozido", category: "vegetal", group: "vegetal_livre", kcal100: 35, protein100: 2.4, fat100: 0.4, carb100: 7, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "alface", name: "Alface", category: "vegetal", group: "vegetal_livre", kcal100: 15, protein100: 1.4, fat100: 0.2, carb100: 2.9, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "tomate", name: "Tomate", category: "vegetal", group: "vegetal_livre", kcal100: 18, protein100: 0.9, fat100: 0.2, carb100: 3.9, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "cenoura", name: "Cenoura", category: "vegetal", group: "vegetal_livre", kcal100: 41, protein100: 0.9, fat100: 0.2, carb100: 10, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "couve", name: "Couve refogada", category: "vegetal", group: "vegetal_livre", kcal100: 40, protein100: 2.9, fat100: 1.4, carb100: 5.6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "abobrinha", name: "Abobrinha refogada", category: "vegetal", group: "vegetal_livre", kcal100: 20, protein100: 1.4, fat100: 0.3, carb100: 3.4, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "pepino", name: "Pepino", category: "vegetal", group: "vegetal_livre", kcal100: 15, protein100: 0.7, fat100: 0.1, carb100: 3.6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "pimentao", name: "Pimentão", category: "vegetal", group: "vegetal_livre", kcal100: 31, protein100: 1, fat100: 0.3, carb100: 6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "espinafre", name: "Espinafre refogado", category: "vegetal", group: "vegetal_livre", kcal100: 28, protein100: 3, fat100: 0.4, carb100: 3.8, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "berinjela", name: "Berinjela refogada", category: "vegetal", group: "vegetal_livre", kcal100: 26, protein100: 1, fat100: 0.2, carb100: 6, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "abobora", name: "Abóbora cozida", category: "vegetal", group: "vegetal_livre", kcal100: 39, protein100: 1.4, fat100: 0.1, carb100: 9, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "rucula", name: "Rúcula", category: "vegetal", group: "vegetal_livre", kcal100: 25, protein100: 2.6, fat100: 0.7, carb100: 3.7, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
  { id: "vagem", name: "Vagem refogada", category: "vegetal", group: "vegetal_livre", kcal100: 32, protein100: 1.8, fat100: 0.2, carb100: 7, vegetarian: true, vegan: true, lactoseFree: true, glutenFree: true },
];

export const CATEGORY_LABEL: Record<FoodCategory, string> = {
  proteina: "Proteína",
  carboidrato: "Carboidrato",
  gordura: "Gordura",
  fruta: "Fruta",
  vegetal: "Vegetal",
};

/** macro principal usado para calcular equivalência de substituição, por grupo */
export const GROUP_PRIMARY_MACRO: Record<string, "protein100" | "carb100" | "fat100" | "kcal100"> = {
  prot_animal: "protein100",
  prot_vegetal: "protein100",
  prot_suplemento: "protein100",
  carbo: "carb100",
  carbo_seco: "carb100",
  gordura: "fat100",
  fruta: "carb100",
  vegetal_livre: "kcal100",
};

export function getFood(id: string): Food | undefined {
  return FOODS.find((f) => f.id === id);
}

/** para um alimento + quantidade, retorna outros alimentos do mesmo grupo com a quantidade
 * equivalente no macro principal do grupo (ex: mesma proteína, mesmo carbo, mesma gordura) */
export function findSubstitutes(foodId: string, quantityG: number, pool: Food[] = FOODS): { food: Food; equivalentG: number }[] {
  const food = getFood(foodId);
  if (!food) return [];
  const macroKey = GROUP_PRIMARY_MACRO[food.group] ?? "kcal100";
  const referenceMacro = (food[macroKey] / 100) * quantityG;
  if (referenceMacro <= 0) return [];

  return pool
    .filter((f) => f.group === food.group && f.id !== food.id)
    .map((f) => {
      const perGram = f[macroKey] / 100;
      const equivalentG = perGram > 0 ? referenceMacro / perGram : 0;
      return { food: f, equivalentG };
    })
    .filter((s) => s.equivalentG > 0)
    .sort((a, b) => a.food.name.localeCompare(b.food.name));
}
