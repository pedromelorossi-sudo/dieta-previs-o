"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORY_LABEL, Food, FOODS, FoodCategory, findSubstitutes, getFood } from "@/lib/foods";
import { Diet, DietItem, DietMeal, MEAL_PRESETS, dietTotals, itemMacros, mealTotals } from "@/lib/dietBuilder";
import { upsertDiet } from "@/lib/dietStorage";
import { generateDietPdf } from "@/lib/pdf";
import { loadLastPrediction } from "@/lib/predictionsLog";
import { RESTRICTION_LABEL, UserPreferences, loadPreferences } from "@/lib/questionnaire";
import { fmt } from "@/lib/format";
import { IconCheck, IconClipboard, IconDroplet, IconFlame, IconWheat } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";

const CATEGORIES: FoodCategory[] = ["proteina", "carboidrato", "gordura", "fruta", "vegetal"];

function newId() {
  return crypto.randomUUID();
}

function newMeal(name: string): DietMeal {
  return { id: newId(), name, items: [] };
}

function newItem(pool: Food[]): DietItem {
  return { id: newId(), foodId: pool[0]?.id ?? FOODS[0].id, quantityG: 100 };
}

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
      const mealCount = Math.min(6, Math.max(2, p.mealsPerDay || 3));
      setMeals(MEAL_PRESETS.slice(0, mealCount).map((n) => newMeal(n)));
    })();
  }, [ready, user]);

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
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">Montar dieta</h1>
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
          <a href="/perfil/questionario" className="text-accent hover:underline ml-1">
            editar
          </a>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function TotalCard({
  icon,
  label,
  value,
  target,
  suffix = "",
  decimals = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  target: number;
  suffix?: string;
  decimals?: number;
}) {
  const hasTarget = target > 0;
  const pct = hasTarget ? value / target : 0;
  const close = hasTarget && Math.abs(pct - 1) <= 0.05;
  const tone = !hasTarget ? "text-muted" : close ? "text-accent" : "text-warn";
  return (
    <div className="card p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className={tone}>{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-base font-semibold">
        {fmt(value, decimals)}
        {suffix}
        {hasTarget && <span className="text-muted font-normal text-xs"> / {fmt(target, decimals)}{suffix}</span>}
      </div>
      {hasTarget && (
        <div className="mt-1.5 h-1 rounded-full bg-surface-raised overflow-hidden">
          <div
            className={`h-full rounded-full ${close ? "bg-accent" : "bg-warn"}`}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MealCard({
  meal,
  foods,
  onChange,
  onRemove,
  openSubs,
  setOpenSubs,
}: {
  meal: DietMeal;
  foods: Food[];
  onChange: (fn: (m: DietMeal) => DietMeal) => void;
  onRemove: () => void;
  openSubs: string | null;
  setOpenSubs: (id: string | null) => void;
}) {
  const totals = mealTotals(meal);

  function addFood() {
    onChange((m) => ({ ...m, items: [...m.items, newItem(foods)] }));
  }

  function updateItem(itemId: string, patch: Partial<DietItem>) {
    onChange((m) => ({ ...m, items: m.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) }));
  }

  function removeItem(itemId: string) {
    onChange((m) => ({ ...m, items: m.items.filter((i) => i.id !== itemId) }));
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <input
          value={meal.name}
          onChange={(e) => onChange((m) => ({ ...m, name: e.target.value }))}
          className="bg-transparent text-base font-semibold tracking-tight outline-none border-b border-transparent hover:border-border focus:border-accent transition-colors"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {fmt(totals.kcal, 0)} kcal · {fmt(totals.proteinG, 0)}p / {fmt(totals.fatG, 0)}g / {fmt(totals.carbG, 0)}c
          </span>
          <button type="button" onClick={onRemove} className="text-xs text-muted hover:text-danger transition-colors">
            remover
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {meal.items.map((item) => {
          const food = getFood(item.foodId);
          const m = itemMacros(item);
          const subsKey = `${meal.id}:${item.id}`;
          const subs = food ? findSubstitutes(item.foodId, item.quantityG, foods) : [];
          return (
            <div key={item.id} className="rounded-lg border border-border bg-surface-raised/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={item.foodId}
                  onChange={(e) => updateItem(item.id, { foodId: e.target.value })}
                  className="input flex-1 min-w-[180px]"
                >
                  {CATEGORIES.map((cat) => (
                    <optgroup key={cat} label={CATEGORY_LABEL[cat]}>
                      {foods.filter((f) => f.category === cat).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <input
                  type="number"
                  value={item.quantityG}
                  onChange={(e) => updateItem(item.id, { quantityG: parseFloat(e.target.value) || 0 })}
                  className="input w-24"
                />
                <span className="text-xs text-muted w-10">g</span>
                <span className="text-xs text-muted whitespace-nowrap">
                  {fmt(m.kcal, 0)} kcal · {fmt(m.proteinG, 0)}p / {fmt(m.fatG, 0)}g / {fmt(m.carbG, 0)}c
                </span>
                <div className="ml-auto flex items-center gap-3">
                  {subs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setOpenSubs(openSubs === subsKey ? null : subsKey)}
                      className="text-xs text-accent hover:underline"
                    >
                      substituições
                    </button>
                  )}
                  <button type="button" onClick={() => removeItem(item.id)} className="text-xs text-muted hover:text-danger">
                    ×
                  </button>
                </div>
              </div>
              {openSubs === subsKey && subs.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-border pt-2.5">
                  {subs.slice(0, 6).map((s) => (
                    <span key={s.food.id} className="badge bg-surface text-muted border border-border">
                      {s.food.name} · {fmt(s.equivalentG, 0)}g
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addFood} className="mt-3 text-sm text-accent hover:underline">
        + adicionar alimento
      </button>
    </div>
  );
}
