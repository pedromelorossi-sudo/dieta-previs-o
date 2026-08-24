"use client";

/* apple-design · arquétipo D (Formulário) · coluna de grade 1080
 * Metas em painel de linhas rótulo/controle; filtros do questionário viram
 * linha de painel em vez de fileira de etiquetas coloridas soltas na página.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Food, FOODS } from "@/lib/foods";
import { Diet, DietMeal, MEAL_PRESETS, dietTotals } from "@/lib/dietBuilder";
import { upsertDiet } from "@/lib/dietStorage";
import { loadLastPrediction } from "@/lib/predictionsLog";
import { RESTRICTION_LABEL, Restriction, UserPreferences, loadPreferences } from "@/lib/questionnaire";
import { IconCheck, IconClipboard, IconDroplet, IconFlame, IconWheat } from "@/components/icons";
import { useAuth } from "@/context/AuthContext";
import { MealCard, TotalCard, newId, newMeal } from "@/components/DietMealsEditor";

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

import { GridPage, PageHero, FormPanel, FormRow, Panel, SectionHeading } from "@/components/apple";

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
    (await import("@/lib/pdf")).generateDietPdf(diet);
    await upsertDiet(diet);
    setSaved(true);
  }

  return (
    <GridPage>
      <PageHero
        eyebrow="Plano alimentar"
        title="Montar dieta"
        lede="Escolha os alimentos por refeição, veja as substituições equivalentes e gere o PDF do plano."
      />

      {prefs && (
        <Panel>
          <div className="panel-row flex items-center justify-between gap-5">
            <div className="min-w-0">
              <div className="text-[15px] font-medium">Filtros do questionário</div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {prefs.restrictions.length === 0 && prefs.dislikedFoodIds.length === 0 ? (
                  <span className="text-[13.5px] text-muted">Nenhum filtro ativo.</span>
                ) : (
                  <>
                    {prefs.restrictions.map((r) => (
                      <span key={r} className="badge">
                        {RESTRICTION_LABEL[r]}
                      </span>
                    ))}
                    {prefs.dislikedFoodIds.length > 0 && (
                      <span className="badge">{prefs.dislikedFoodIds.length} alimento(s) excluído(s)</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <Link href="/perfil/questionario" className="shrink-0 text-[13px] text-accent hover:underline">
              Editar
            </Link>
          </div>
        </Panel>
      )}

      <FormPanel
        label="Metas do plano"
        footer="Preenchido automaticamente com a última previsão salva. Ajuste livremente se quiser outra meta."
      >
        <FormRow label="Nome do plano">
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </FormRow>
        <FormRow label="Calorias" hint="Meta diária.">
          <input type="number" value={targetKcal} onChange={(e) => setTargetKcal(e.target.value)} className="input" />
        </FormRow>
        <FormRow label="Proteína" hint="Em gramas.">
          <input type="number" value={targetProtein} onChange={(e) => setTargetProtein(e.target.value)} className="input" />
        </FormRow>
        <FormRow label="Gordura" hint="Em gramas.">
          <input type="number" value={targetFat} onChange={(e) => setTargetFat(e.target.value)} className="input" />
        </FormRow>
        <FormRow label="Carboidrato" hint="Em gramas.">
          <input type="number" value={targetCarb} onChange={(e) => setTargetCarb(e.target.value)} className="input" />
        </FormRow>
      </FormPanel>

      <section>
        <SectionHeading
          title="Gerar dieta automaticamente"
          desc="A IA distribui os alimentos do catálogo entre as refeições para bater as metas acima. Você pode editar tudo depois de gerado."
        />
        <div className="panel">
        <div className="panel-row">
          <span className="block text-[15px] font-medium mb-2.5">Alimentos que não podem faltar</span>
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

        <div className="panel-row">
          <span className="block text-[15px] font-medium mb-2.5">Restrições para esta dieta</span>
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

        {genError && <p className="panel-row text-[14.5px] text-danger">{genError}</p>}
        {genWarnings.length > 0 && (
          <div className="panel-row space-y-1 text-[14.5px] leading-[1.5] text-warn">
            {genWarnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </div>
        )}
        </div>

        <button type="button" onClick={handleGenerate} disabled={generating} className="btn-primary mt-4">
          {generating ? "Gerando…" : "Gerar dieta automaticamente"}
        </button>
      </section>

      {/* Barra de totais: um painel só, dividido por fio vertical. Antes eram
          quatro cartões flutuando lado a lado — fragmentação de itens irmãos. */}
      <div className="panel sticky top-[61px] z-[5] grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
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
        {/* Metade do guia é orientação de dieta — o botão precisa existir aqui
            também, não só na tela de treino. */}
        <button type="button" onClick={async () => (await import("@/lib/pdf")).generateMetodologiaPdf()} className="btn-secondary">
          Guia de metodologia
        </button>
        <button type="button" onClick={handleSave} className="btn-secondary">
          {saved ? <IconCheck className="h-4 w-4" /> : null}
          {/* Era "Salvar rascunho". O plano vai para o banco e fica disponível
              depois — chamar de rascunho fazia parecer descartável. */}
          {saved ? "Salvo" : "Salvar dieta"}
        </button>
      </div>

      {/* Sem esta linha, salvar não tinha consequência visível: a pessoa clicava,
          o botão virava "Salvo" e não havia nada indicando ONDE o plano ficou. */}
      {saved && (
        <p className="text-[13.5px] text-muted">
          Plano salvo.{" "}
          <Link href="/dieta" className="text-accent hover:underline">
            Ver minhas dietas
          </Link>
          .
        </p>
      )}
    </GridPage>
  );
}
