"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  ACTIVITY_LABEL,
  ActivityLevel,
  COOKING_LABEL,
  CookingTime,
  DEFAULT_PREFERENCES,
  RESTRICTION_LABEL,
  Restriction,
  UserPreferences,
  loadPreferences,
  savePreferences,
} from "@/lib/questionnaire";
import { CATEGORY_LABEL, FOODS, FoodCategory } from "@/lib/foods";
import { MuscleGroup, MUSCLE_GROUP_LABEL } from "@/lib/exerciseLibrary";
import { IconCheck } from "@/components/icons";

const MUSCLE_GROUPS: MuscleGroup[] = Object.keys(MUSCLE_GROUP_LABEL) as MuscleGroup[];

const CATEGORIES: FoodCategory[] = ["proteina", "carboidrato", "gordura", "fruta", "vegetal"];

import { ReadingPage } from "@/components/apple";

export default function QuestionarioPage() {
  const { ready, user, profile } = useAuth();
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function togglePriorityMuscle(m: MuscleGroup) {
    update(
      "priorityMuscles",
      prefs.priorityMuscles.includes(m) ? prefs.priorityMuscles.filter((x) => x !== m) : [...prefs.priorityMuscles, m]
    );
  }

  async function handleSave() {
    if (!user) return;
    setSaveError(null);
    try {
      await savePreferences(prefs);
      setSaved(true);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar preferências.");
    }
  }

  if (!loaded) {
    return (
      <ReadingPage>
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-96 w-full" />
      </ReadingPage>
    );
  }

  return (
    <ReadingPage>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Questionário de hábitos</h1>
        <p className="text-sm text-muted mt-2">
          Personaliza o montador de dieta de {profile?.name ?? "este perfil"} — filtra alimentos por restrição e
          ajusta o número de refeições sugerido.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        {/* A PERGUNTA "OBJETIVO PRINCIPAL" SAIU.
            Quem decide cutting, bulking ou manutenção é o algoritmo, a partir
            do %BF lido nas fotos e da fase do ciclo anterior — nunca foi a
            resposta do usuário. `dietGoal` era coletado e não entrava em
            `classifyPathFromBf`, em `planoDeFases` nem em lugar nenhum da
            decisão.

            Perguntar e ignorar é pior que não perguntar: um usuário respondeu
            "manutenção" e recebeu um déficit de 18%, sem nada na tela ligando
            uma coisa à outra. A estratégia decidida aparece em /previsao-ia com
            o motivo junto, que é onde ela deve ser explicada. */}
        <div className="grid gap-4 lg:grid-cols-2">
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
          <Field label="Refeições por dia (padrão 5)">
            <input
              type="number"
              min={2}
              max={8}
              value={prefs.mealsPerDay}
              onChange={(e) => update("mealsPerDay", parseInt(e.target.value) || 5)}
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

      <div className="card p-6 space-y-3">
        <div>
          <h2 className="text-sm font-semibold mb-1">Prioridade de treino</h2>
          <p className="text-xs text-muted">
            Grupos musculares em foco agora (ex: definido pela sua consultoria). Entram primeiro na sessão, ganham
            meta de volume no teto recuperável (MRV) em vez do padrão, e frequência semanal extra quando possível —
            vale mais que a leitura visual das fotos, porque é orientação de um coach de verdade.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MUSCLE_GROUPS.map((m) => {
            const active = prefs.priorityMuscles.includes(m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => togglePriorityMuscle(m)}
                className={`badge border px-3 py-1.5 text-xs transition-colors ${
                  active ? "bg-accent/15 text-accent border-accent/30" : "bg-surface-raised text-muted border-border"
                }`}
              >
                {MUSCLE_GROUP_LABEL[m]}
              </button>
            );
          })}
        </div>
      </div>

      {saveError && <p className="text-xs text-danger">{saveError}</p>}

      <button type="button" onClick={handleSave} className="btn-primary">
        {saved ? <IconCheck className="h-4 w-4" /> : null}
        {saved ? "Preferências salvas" : "Salvar preferências"}
      </button>
    </ReadingPage>
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
          <span className="text-[12px] text-neutral w-20 shrink-0">{CATEGORY_LABEL[cat]}</span>
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
