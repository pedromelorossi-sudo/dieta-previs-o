"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FOODS } from "@/lib/foods";
import { Diet, DietMeal, dietTotals } from "@/lib/dietBuilder";
import { loadDietById, adminUpdateDiet, deleteDiet } from "@/lib/dietStorage";
import { IconCheck, IconDroplet, IconFlame, IconWheat } from "@/components/icons";
import { Field, MealCard, TotalCard, newMeal } from "@/components/DietMealsEditor";

export default function AdminEditDietPage() {
  const params = useParams<{ userId: string; dietId: string }>();
  const router = useRouter();
  const { ready, profile } = useAuth();

  const [diet, setDiet] = useState<Diet | null>(null);
  const [openSubs, setOpenSubs] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !profile?.isAdmin) return;
    loadDietById(params.dietId)
      .then((d) => setDiet(d))
      .catch((e) => setError(e.message));
  }, [ready, profile, params.dietId]);

  const totals = useMemo(() => (diet ? dietTotals(diet) : null), [diet]);

  function updateMeal(id: string, fn: (m: DietMeal) => DietMeal) {
    setDiet((prev) => (prev ? { ...prev, meals: prev.meals.map((m) => (m.id === id ? fn(m) : m)) } : prev));
    setSaved(false);
  }

  function addMeal() {
    setDiet((prev) => (prev ? { ...prev, meals: [...prev.meals, newMeal("Refeição extra")] } : prev));
    setSaved(false);
  }

  function removeMeal(id: string) {
    setDiet((prev) => (prev ? { ...prev, meals: prev.meals.filter((m) => m.id !== id) } : prev));
    setSaved(false);
  }

  async function handleSave() {
    if (!diet) return;
    setSaving(true);
    setError(null);
    try {
      await adminUpdateDiet(diet);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!diet) return;
    if (!window.confirm(`Excluir a dieta "${diet.name}" deste usuário? Essa ação não pode ser desfeita.`)) return;
    await deleteDiet(diet.id);
    router.push(`/admin/${params.userId}`);
  }

  if (!ready) {
    return <div className="mx-auto max-w-4xl px-6 py-16 text-muted">Carregando…</div>;
  }
  if (!profile?.isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-muted">Acesso restrito a administradores.</p>
      </div>
    );
  }
  if (error && !diet) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-16">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }
  if (!diet || !totals) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <a href={`/admin/${params.userId}`} className="text-sm text-accent hover:underline">
          ← Voltar pro usuário
        </a>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text mt-2">Editando: {diet.name}</h1>
        <p className="text-sm text-muted mt-1">Como administrador, as mudanças aqui afetam a dieta real do usuário.</p>
      </div>

      <div className="card p-6 space-y-4">
        <Field label="Nome do plano">
          <input value={diet.name} onChange={(e) => setDiet({ ...diet, name: e.target.value })} className="input" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Meta kcal">
            <input
              type="number"
              value={diet.targetKcal}
              onChange={(e) => setDiet({ ...diet, targetKcal: parseFloat(e.target.value) || 0 })}
              className="input"
            />
          </Field>
          <Field label="Meta proteína (g)">
            <input
              type="number"
              value={diet.targetProteinG}
              onChange={(e) => setDiet({ ...diet, targetProteinG: parseFloat(e.target.value) || 0 })}
              className="input"
            />
          </Field>
          <Field label="Meta gordura (g)">
            <input
              type="number"
              value={diet.targetFatG}
              onChange={(e) => setDiet({ ...diet, targetFatG: parseFloat(e.target.value) || 0 })}
              className="input"
            />
          </Field>
          <Field label="Meta carboidrato (g)">
            <input
              type="number"
              value={diet.targetCarbG}
              onChange={(e) => setDiet({ ...diet, targetCarbG: parseFloat(e.target.value) || 0 })}
              className="input"
            />
          </Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4 sticky top-[73px] z-[5]">
        <TotalCard icon={<IconFlame className="h-4 w-4" />} label="Kcal" value={totals.kcal} target={diet.targetKcal} decimals={0} />
        <TotalCard icon={<IconFlame className="h-4 w-4" />} label="Proteína" value={totals.proteinG} target={diet.targetProteinG} suffix="g" />
        <TotalCard icon={<IconDroplet className="h-4 w-4" />} label="Gordura" value={totals.fatG} target={diet.targetFatG} suffix="g" />
        <TotalCard icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" value={totals.carbG} target={diet.targetCarbG} suffix="g" />
      </div>

      <div className="space-y-6">
        {diet.meals.map((meal) => (
          <MealCard
            key={meal.id}
            meal={meal}
            foods={FOODS}
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

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center border-t border-border pt-6">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
          {saved ? <IconCheck className="h-4 w-4" /> : null}
          {saving ? "Salvando…" : saved ? "Salvo" : "Salvar alterações"}
        </button>
        <button type="button" onClick={handleDelete} className="text-xs text-danger hover:underline ml-auto">
          Excluir esta dieta
        </button>
      </div>
    </div>
  );
}
