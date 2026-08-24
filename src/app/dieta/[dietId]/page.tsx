"use client";

/* apple-design · arquétipo D (Formulário) · coluna de grade 1080
 *
 * Abrir de novo um plano já salvo. É o par de /dieta (a lista): sem esta rota a
 * lista não teria para onde levar.
 *
 * Espelha /admin/[userId]/dieta/[dietId], que faz a mesma coisa para o
 * administrador. A diferença está em qual gravação é usada: aqui `upsertDiet`,
 * que carimba `user_id` com o usuário logado — correto porque o dono está
 * editando o próprio plano. A versão do admin precisa de `adminUpdateDiet`
 * justamente para NÃO reatribuir a dieta a quem está editando.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { FOODS } from "@/lib/foods";
import { Diet, DietMeal, dietTotals } from "@/lib/dietBuilder";
import { loadDietById, upsertDiet, deleteDiet } from "@/lib/dietStorage";
import { IconCheck, IconDroplet, IconFlame, IconWheat } from "@/components/icons";
import { MealCard, TotalCard, newMeal } from "@/components/DietMealsEditor";
import { GridPage, PageHero, FormPanel, FormRow } from "@/components/apple";

export default function EditarDietaPage() {
  const params = useParams<{ dietId: string }>();
  const router = useRouter();
  const { ready, user } = useAuth();

  const [diet, setDiet] = useState<Diet | null>(null);
  const [naoEncontrada, setNaoEncontrada] = useState(false);
  const [openSubs, setOpenSubs] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !user) return;
    loadDietById(params.dietId)
      .then((d) => {
        /* `maybeSingle` devolve null tanto para id inexistente quanto para uma
           dieta de outro usuário — a RLS simplesmente não retorna a linha. Os
           dois casos são a mesma coisa para quem está olhando a tela. */
        if (d) setDiet(d);
        else setNaoEncontrada(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar a dieta."));
  }, [ready, user, params.dietId]);

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
      await upsertDiet(diet);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    if (!diet) return;
    (await import("@/lib/pdf")).generateDietPdf(diet);
  }

  async function handleDelete() {
    if (!diet) return;
    if (!window.confirm(`Excluir "${diet.name}"? Essa ação não pode ser desfeita.`)) return;
    await deleteDiet(diet.id);
    router.push("/dieta");
  }

  if (!ready) return <GridPage>Carregando…</GridPage>;

  if (!user) {
    return (
      <GridPage>
        <PageHero
          eyebrow="Plano alimentar"
          title="Entrar"
          lede="Entre na sua conta para abrir este plano."
          actions={
            <Link href="/login" className="btn-primary">
              Entrar
            </Link>
          }
        />
      </GridPage>
    );
  }

  if (naoEncontrada) {
    return (
      <GridPage>
        <PageHero
          eyebrow="Plano alimentar"
          title="Dieta não encontrada"
          lede="Ela pode ter sido excluída, ou o endereço não corresponde a um plano seu."
          actions={
            <Link href="/dieta" className="btn-primary">
              Ver minhas dietas
            </Link>
          }
        />
      </GridPage>
    );
  }

  if (error && !diet) {
    return (
      <GridPage>
        <div className="panel border-warn/30 bg-warn/5 p-4 text-sm text-warn">{error}</div>
      </GridPage>
    );
  }

  if (!diet || !totals) {
    return (
      <GridPage>
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </GridPage>
    );
  }

  return (
    <GridPage>
      <div>
        <Link href="/dieta" className="text-[13.5px] text-accent hover:underline">
          ← Minhas dietas
        </Link>
        <PageHero
          eyebrow="Plano alimentar"
          title={diet.name}
          lede="As mudanças só valem depois de salvar."
        />
      </div>

      <FormPanel label="Metas" desc="O que este plano deveria entregar por dia.">
        <FormRow label="Nome do plano">
          <input
            value={diet.name}
            onChange={(e) => {
              setDiet({ ...diet, name: e.target.value });
              setSaved(false);
            }}
            className="input w-full"
          />
        </FormRow>
        <FormRow label="Meta de calorias" hint="kcal por dia">
          <input
            type="number"
            value={diet.targetKcal}
            onChange={(e) => {
              setDiet({ ...diet, targetKcal: parseFloat(e.target.value) || 0 });
              setSaved(false);
            }}
            className="input w-full"
          />
        </FormRow>
        <FormRow label="Meta de proteína" hint="gramas por dia">
          <input
            type="number"
            value={diet.targetProteinG}
            onChange={(e) => {
              setDiet({ ...diet, targetProteinG: parseFloat(e.target.value) || 0 });
              setSaved(false);
            }}
            className="input w-full"
          />
        </FormRow>
        <FormRow label="Meta de gordura" hint="gramas por dia">
          <input
            type="number"
            value={diet.targetFatG}
            onChange={(e) => {
              setDiet({ ...diet, targetFatG: parseFloat(e.target.value) || 0 });
              setSaved(false);
            }}
            className="input w-full"
          />
        </FormRow>
        <FormRow label="Meta de carboidrato" hint="gramas por dia">
          <input
            type="number"
            value={diet.targetCarbG}
            onChange={(e) => {
              setDiet({ ...diet, targetCarbG: parseFloat(e.target.value) || 0 });
              setSaved(false);
            }}
            className="input w-full"
          />
        </FormRow>
      </FormPanel>

      <div className="grid gap-3 sm:grid-cols-4">
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

      {error && <p className="text-[13px] text-warn">{error}</p>}

      <div className="flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
        <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
          {saved ? <IconCheck className="h-4 w-4" /> : null}
          {saving ? "Salvando…" : saved ? "Salvo" : "Salvar alterações"}
        </button>
        <button type="button" onClick={handleDownloadPdf} className="btn-secondary">
          Baixar PDF
        </button>
        <button type="button" onClick={handleDelete} className="ml-auto text-[13px] text-warn hover:underline">
          Excluir esta dieta
        </button>
      </div>
    </GridPage>
  );
}
