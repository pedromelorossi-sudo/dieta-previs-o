"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ACTIVITY_LABEL,
  ActivityLevel,
  COOKING_LABEL,
  CookingTime,
  DEFAULT_PREFERENCES,
  DietGoal,
  GOAL_LABEL,
  RESTRICTION_LABEL,
  Restriction,
  UserPreferences,
  loadPreferences,
  savePreferences,
} from "@/lib/questionnaire";
import { CATEGORY_LABEL, FOODS, FoodCategory } from "@/lib/foods";
import { IconCheck } from "@/components/icons";

const CATEGORIES: FoodCategory[] = ["proteina", "carboidrato", "gordura", "fruta", "vegetal"];

export default function QuestionarioPage() {
  const { ready, user, profile } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    loadPreferences().then((p) => {
      setPrefs(p);
      setLoaded(true);
    });
  }, [ready, user]);

  function update<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  function toggleRestriction(r: Restriction) {
    update(
      "restrictions",
      prefs.restrictions.includes(r) ? prefs.restrictions.filter((x) => x !== r) : [...prefs.restrictions, r]
    );
  }

  function toggleFoodTag(list: "dislikedFoodIds" | "favoriteFoodIds", id: string) {
    const current = prefs[list];
    update(list, current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  async function handleSave() {
    if (!user) return;
    await savePreferences(prefs);
    setSaved(true);
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">Questionário de hábitos</h1>
        <p className="text-sm text-muted mt-2">
          Personaliza o montador de dieta de {profile?.name ?? "este perfil"} — filtra alimentos por restrição e
          ajusta o número de refeições sugerido.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Objetivo principal">
            <select value={prefs.dietGoal} onChange={(e) => update("dietGoal", e.target.value as DietGoal)} className="input">
              {(Object.keys(GOAL_LABEL) as DietGoal[]).map((g) => (
                <option key={g} value={g}>
                  {GOAL_LABEL[g]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Nível de atividade física">
            <select
              value={prefs.activityLevel}
              onChange={(e) => update("activityLevel", e.target.value as ActivityLevel)}
              className="input"
            >
              {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_LABEL[a]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Refeições por dia">
            <input
              type="number"
              min={2}
              max={6}
              value={prefs.mealsPerDay}
              onChange={(e) => update("mealsPerDay", parseInt(e.target.value) || 3)}
              className="input"
            />
          </Field>
          <Field label="Tempo disponível para cozinhar">
            <select
              value={prefs.cookingTime}
              onChange={(e) => update("cookingTime", e.target.value as CookingTime)}
              className="input"
            >
              {(Object.keys(COOKING_LABEL) as CookingTime[]).map((c) => (
                <option key={c} value={c}>
                  {COOKING_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">Restrições alimentares</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RESTRICTION_LABEL) as Restriction[]).map((r) => {
              const active = prefs.restrictions.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRestriction(r)}
                  className={`badge border px-3 py-1.5 text-xs transition-colors ${
                    active ? "bg-accent/15 text-accent border-accent/30" : "bg-surface-raised text-muted border-border"
                  }`}
                >
                  {RESTRICTION_LABEL[r]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">Alimentos que você não gosta (excluídos do montador)</span>
          <FoodTagPicker selected={prefs.dislikedFoodIds} onToggle={(id) => toggleFoodTag("dislikedFoodIds", id)} tone="warn" />
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">Alimentos favoritos (opcional, só como referência)</span>
          <FoodTagPicker selected={prefs.favoriteFoodIds} onToggle={(id) => toggleFoodTag("favoriteFoodIds", id)} tone="accent" />
        </div>

        <Field label="Observações (alergias, horários, preferências gerais)">
          <textarea
            value={prefs.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="input resize-none"
          />
        </Field>
      </div>

      <button type="button" onClick={handleSave} className="btn-primary">
        {saved ? <IconCheck className="h-4 w-4" /> : null}
        {saved ? "Preferências salvas" : "Salvar preferências"}
      </button>
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

function FoodTagPicker({
  selected,
  onToggle,
  tone,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  tone: "warn" | "accent";
}) {
  return (
    <div className="space-y-2">
      {CATEGORIES.map((cat) => (
        <div key={cat} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-muted w-20 shrink-0">{CATEGORY_LABEL[cat]}</span>
          {FOODS.filter((f) => f.category === cat).map((f) => {
            const active = selected.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onToggle(f.id)}
                className={`badge border px-2 py-1 text-[11px] transition-colors ${
                  active
                    ? tone === "warn"
                      ? "bg-warn/15 text-warn border-warn/30"
                      : "bg-accent/15 text-accent border-accent/30"
                    : "bg-surface-raised text-muted border-border"
                }`}
              >
                {f.name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
