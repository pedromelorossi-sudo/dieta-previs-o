"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Food, FOODS } from "@/lib/foods";
import { Diet, DietMeal, MEAL_PRESETS, dietTotals } from "@/lib/dietBuilder";
import { upsertDiet } from "@/lib/dietStorage";
import { generateDietPdf } from "@/lib/pdf";
import { loadLastPrediction } from "@/lib/predictionsLog";
import { RESTRICTION_LABEL, Restriction, UserPreferences, loadPreferences } from "@/lib/questionnaire";
import { IconCheck, IconClipboard, IconDroplet, IconFlame, IconWheat } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import { Field, MealCard, TotalCard, newId, newMeal } from "@/components/DietMealsEditor";

function filterFoodsByPreferences(foods: Food[], prefs: UserPreferences): Food[] {
  return foods.filter((f) => {
    if (prefs.dislikedFoodIds.includes(f.id)) return false;
    if (prefs.restrictions.includes("vegano") && !f.vegan) return false;
    if (prefs.restrictions.includes("vegetariano") && !f.vegetarian) return false;
    if (prefs.restrictions.includes("sem_lactose") && !f.lactoseFree) return false;
    if (prefs.restrictions.includes("sem_gluten") && !f.glutenFree) return false;
    return true;
  });
}

export default function NovaDietaPage() {
  const { ready, user } = useAuth();
  const [dietId] = useState(newId);
  const [name, setName] = useState("Meu plano alimentar");
  const [targetKcal, setTargetKcal] = useState("");
  const [targetProtein, setTargetProtein] = useState("");
  const [targetFat, setTargetFat] = useState("");
  const [targetCarb, setTargetCarb] = useState("");
  const [meals, setMeals] = useState<DietMeal[]>([newMeal("Café da manhã"), newMeal("Almoço"), newMeal("Jantar")]);
  const [saved, setSaved] = useState(false);
  const [openSubs, setOpenSubs] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [mustHaveIds, setMustHaveIds] = useState<string[]>([]);
  const [genRestrictions, setGenRestrictions] = useState<Restriction[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    (async () => {
      const pred = await loadLastPrediction();
      if (pred) {
        setTargetKcal(String(Math.round((pred.kcal.min + pred.kcal.max) / 2)));
        setTargetProtein(String(Math.round((pred.proteinG.min + pred.proteinG.max) / 2)));
        setTargetFat(String(Math.round((pred.fatG.min + pred.fatG.max) / 2)));
        setTargetCarb(String(Math.round((pred.carbG.min + pred.carbG.max) / 2)));
      }
      const p = await loadPreferences();
      setPrefs(p);
      setMustHaveIds(p.favoriteFoodIds);
      setGenRestrictions(p.restrictions);
      const mealCount = Math.min(6, Math.max(2, p.mealsPerDay || 3));
      setMeals(MEAL_PRESETS.slice(0, mealCount).map((n) => newMeal(n)));
    })();
  }, [ready, user]);

  function toggleMustHave(id: string) {
    setMustHaveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGenRestriction(r: Restriction) {
    setGenRestrictions((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    setGenWarnings([]);
    try {
      const res = await fetch("/api/gerar-dieta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetKcal: parseFloat(targetKcal) || 0,
          targetProteinG: parseFloat(targetProtein) || 0,
          targetFatG: parseFloat(targetFat) || 0,
          targetCarbG: parseFloat(targetCarb) || 0,
          mealsCount: meals.length || 4,
          mustHaveFoodIds: mustHaveIds,
          restrictions: genRestrictions,
          excludedFoodIds: prefs?.dislikedFoodIds ?? [],
          cookingTime: prefs?.cookingTime ?? "medio",
          notes: prefs?.notes ?? "",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar dieta.");
      setMeals(data.meals);
      setGenWarnings(data.warnings ?? []);
      setSaved(false);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Erro ao gerar dieta.");
    } finally {
      setGenerating(false);
    }
  }

  const availableFoods = useMemo(() => (prefs ? filterFoodsByPreferences(FOODS, prefs) : FOODS), [prefs]);

  const diet: Diet = useMemo(
    () => ({
      id: dietId,
      name,
      createdAt: new Date().toISOString(),
      targetKcal: parseFloat(targetKcal) || 0,
      targetProteinG: parseFloat(targetProtein) || 0,
      targetFatG: parseFloat(targetFat) || 0,
      targetCarbG: parseFloat(targetCarb) || 0,
      meals,
    }),
    [dietId, name, targetKcal, targetProtein, targetFat, targetCarb, meals]
  );

  const totals = dietTotals(diet);

  function updateMeal(id: string, fn: (m: DietMeal) => DietMeal) {
    setMeals((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));
    setSaved(false);
  }

  function addMeal() {
    const used = meals.map((m) => m.name);
    const preset = MEAL_PRESETS.find((p) => !used.includes(p)) ?? "Refeição extra";
    setMeals((prev) => [...prev, newMeal(preset)]);
    setSaved(false);
  }

  function removeMeal(id: string) {
    setMeals((prev) => prev.filter((m) => m.id !== id));
    setSaved(false);
  }

  async function handleSave() {
    if (!user) return;
    await upsertDiet(diet);
    setSaved(true);
  }

  async function handleDownloadPdf() {
    if (!user) return;
    generateDietPdf(diet);
    await upsertDiet(diet);
    setSaved(true);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Montar dieta</h1>
        <p className="text-sm text-muted mt-2">
          Escolha os alimentos por refeição, veja as substituições equivalentes e gere o PDF do plano.
        </p>
      </div>

      {prefs && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Filtros do questionário:</span>
          {prefs.restrictions.length === 0 && prefs.dislikedFoodIds.length === 0 ? (
            <span className="text-muted">nenhum</span>
          ) : (
            <>
              {prefs.restrictions.map((r) => (
                <span key={r} className="badge bg-accent/15 text-accent">
                  {RESTRICTION_LABEL[r]}
                </span>
              ))}
              {prefs.dislikedFoodIds.length > 0 && (
                <span className="badge bg-surface-raised text-muted border border-border">
                  {prefs.dislikedFoodIds.length} alimento(s) excluído(s)
                </span>
              )}
            </>
          )}
          <Link href="/perfil/questionario" className="text-accent hover:underline ml-1">
            editar
          </Link>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do plano">
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Meta kcal">
            <input type="number" value={targetKcal} onChange={(e) => setTargetKcal(e.target.value)} className="input" />
          </Field>
          <Field label="Meta proteína (g)">
            <input type="number" value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} className="input" />
          </Field>
          <Field label="Meta gordura (g)">
            <input type="number" value={targetFat} onChange={(e) => setTargetFat(e.target.value)} className="input" />
          </Field>
          <Field label="Meta carboidrato (g)">
            <input type="number" value={targetCarb} onChange={(e) => setTargetCarb(e.target.value)} className="input" />
          </Field>
        </div>
        <p className="text-xs text-muted">
          Preenchido automaticamente com a última previsão salva. Ajuste livremente se quiser outra meta.
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <h2 className="text-sm font-semibold mb-1">Gerar dieta automaticamente</h2>
          <p className="text-xs text-muted mb-3">
            A IA distribui os alimentos do catálogo entre as refeições pra bater as metas acima. Você pode editar
            tudo depois de gerado.
          </p>
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">Alimentos que não podem faltar</span>
          <div className="flex flex-wrap gap-1.5">
            {FOODS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => toggleMustHave(f.id)}
                className={`badge border transition-colors ${
                  mustHaveIds.includes(f.id)
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-surface-raised text-muted border-border hover:border-accent/30"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">Restrições para esta dieta</span>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(RESTRICTION_LABEL) as Restriction[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => toggleGenRestriction(r)}
                className={`badge border transition-colors ${
                  genRestrictions.includes(r)
                    ? "bg-accent/20 text-accent border-accent/40"
                    : "bg-surface-raised text-muted border-border hover:border-accent/30"
                }`}
              >
                {RESTRICTION_LABEL[r]}
              </button>
            ))}
          </div>
        </div>

        {genError && <p className="text-xs text-danger">{genError}</p>}
        {genWarnings.length > 0 && (
          <div className="text-xs text-warn space-y-1">
            {genWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}

        <button type="button" onClick={handleGenerate} disabled={generating} className="btn-primary">
          {generating ? "Gerando…" : "Gerar dieta automaticamente"}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4 sticky top-[73px] z-[5]">
        <TotalCard icon={<IconFlame className="h-4 w-4" />} label="Kcal" value={totals.kcal} target={diet.targetKcal} decimals={0} />
        <TotalCard icon={<IconFlame className="h-4 w-4" />} label="Proteína" value={totals.proteinG} target={diet.targetProteinG} suffix="g" />
        <TotalCard icon={<IconDroplet className="h-4 w-4" />} label="Gordura" value={totals.fatG} target={diet.targetFatG} suffix="g" />
        <TotalCard icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" value={totals.carbG} target={diet.targetCarbG} suffix="g" />
      </div>

      <div className="space-y-6">
        {meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            foods={availableFoods}
            onChange={(fn) => updateMeal(meal.id, fn)}
            onRemove={() => removeMeal(meal.id)}
            openSubs={openSubs}
            setOpenSubs={setOpenSubs}
          />
        ))}
        <button type="button" onClick={addMeal} className="btn-secondary">
          + Adicionar refeição
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center border-t border-border pt-6">
        <button type="button" onClick={handleDownloadPdf} className="btn-primary">
          <IconClipboard className="h-4 w-4" />
          Baixar PDF do plano
        </button>
        <button type="button" onClick={handleSave} className="btn-secondary">
          {saved ? <IconCheck className="h-4 w-4" /> : null}
          {saved ? "Salvo" : "Salvar rascunho"}
        </button>
      </div>
    </div>
  );
}
