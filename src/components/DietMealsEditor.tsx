"use client";

import { CATEGORY_LABEL, Food, FOODS, FoodCategory, findSubstitutes, getFood } from "@/lib/foods";
import { DietItem, DietMeal, itemMacros, mealTotals } from "@/lib/dietBuilder";
import { fmt } from "@/lib/format";
import { AnimatedNumber } from "@/components/AnimatedNumber";

export const CATEGORIES: FoodCategory[] = ["proteina", "carboidrato", "gordura", "fruta", "vegetal"];

export function newId() {
  return crypto.randomUUID();
}

export function newMeal(name: string): DietMeal {
  return { id: newId(), name, items: [] };
}

export function newItem(pool: Food[]): DietItem {
  return { id: newId(), foodId: pool[0]?.id ?? FOODS[0].id, quantityG: 100 };
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export function TotalCard({
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
        <AnimatedNumber value={value} decimals={decimals} durationMs={400} />
        {suffix}
        {hasTarget && <span className="text-muted font-normal text-xs"> / {fmt(target, decimals)}{suffix}</span>}
      </div>
      {hasTarget && (
        <div className="mt-1.5 h-1 rounded-[2px] bg-background border border-rule-2 overflow-hidden">
          <div
            className={`h-full transition-[width] duration-500 ease-out ${close ? "bg-accent animate-glow-pulse" : "bg-warn"}`}
            style={{ width: `${Math.min(100, pct * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function MealCard({
  meal,
  foods,
  onChange,
  onRemove,
  openSubs,
  setOpenSubs,
  readOnly = false,
}: {
  meal: DietMeal;
  foods: Food[];
  onChange: (fn: (m: DietMeal) => DietMeal) => void;
  onRemove: () => void;
  openSubs: string | null;
  setOpenSubs: (id: string | null) => void;
  readOnly?: boolean;
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
          disabled={readOnly}
          className="bg-transparent text-base font-semibold tracking-tight outline-none border-b border-transparent hover:border-border focus:border-accent transition-colors disabled:cursor-default"
        />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">
            {fmt(totals.kcal, 0)} kcal · {fmt(totals.proteinG, 0)}p / {fmt(totals.fatG, 0)}g / {fmt(totals.carbG, 0)}c
          </span>
          {!readOnly && (
            <button type="button" onClick={onRemove} className="text-xs text-muted hover:text-danger transition-colors">
              remover
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {meal.items.map((item) => {
          const food = getFood(item.foodId);
          const m = itemMacros(item);
          const subsKey = `${meal.id}:${item.id}`;
          const subs = food ? findSubstitutes(item.foodId, item.quantityG, foods) : [];
          return (
            <div key={item.id} className="rounded-md border border-border bg-surface-raised/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={item.foodId}
                  onChange={(e) => updateItem(item.id, { foodId: e.target.value })}
                  disabled={readOnly}
                  className="input flex-1 min-w-[180px] disabled:opacity-70"
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
                  disabled={readOnly}
                  className="input w-24 disabled:opacity-70"
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
                  {!readOnly && (
                    <button type="button" onClick={() => removeItem(item.id)} className="text-xs text-muted hover:text-danger">
                      ×
                    </button>
                  )}
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

      {!readOnly && (
        <button type="button" onClick={addFood} className="mt-3 text-sm text-accent hover:underline">
          + adicionar alimento
        </button>
      )}
    </div>
  );
}
