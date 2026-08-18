"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Cycle } from "@/lib/types";
import { loadCycles, addCycle, deleteCycle } from "@/lib/storage";
import { sortByDate } from "@/lib/dietEngine";
import {
  Sex,
  ActivityLevel,
  ACTIVITY_LABEL,
  ExerciseFreq,
  DailyRoutine,
  EXERCISE_FREQ_LABEL,
  DAILY_ROUTINE_LABEL,
  calculateActivityLevel,
  loadPreferences,
  savePreferences,
} from "@/lib/questionnaire";
import { fmt, fmtDate } from "@/lib/format";
import { saveLastPrediction } from "@/lib/predictionsLog";
import { addProgressPhoto } from "@/lib/photos";
import { resizeImageToBase64 } from "@/lib/imageResize";
import { Diet, DietMeal, dietTotals, mealTotals, itemMacros } from "@/lib/dietBuilder";
import { getFood } from "@/lib/foods";
import { upsertDiet } from "@/lib/dietStorage";
import { generateDietPdf } from "@/lib/pdf";
import { IconCheck, IconClipboard, IconDrumstick, IconDroplet, IconFlame, IconScale, IconTarget, IconWheat } from "@/components/icons";

const todayISO = () => new Date().toISOString().slice(0, 10);

type Angle = "frente" | "costas" | "lado_esquerdo" | "lado_direito";

const ANGLES: { key: Angle; label: string; required: boolean }[] = [
  { key: "frente", label: "Frente", required: true },
  { key: "costas", label: "Costas", required: false },
  { key: "lado_esquerdo", label: "Lado esquerdo", required: false },
  { key: "lado_direito", label: "Lado direito", required: false },
];

interface PredictionResponse {
  isFirstCycle: boolean;
  bfPercentVisual: number;
  bfConfidence: "baixa" | "media" | "alta";
  bfReasoning: string;
  evolutionNote: string | null;
  strategy: "cutting" | "normocalorico" | "bulking";
  strategyLabel: string;
  strategyReason: string;
  gainComposition: "musculo" | "misto" | "gordura" | null;
  gainCompositionLabel: string | null;
  gainCompositionReasoning: string | null;
  recommendedKcal: number;
  recommendedProteinG: number;
  recommendedFatG: number;
  recommendedCarbG: number;
  note: string;
  ranges: {
    kcal: { min: number; max: number };
    protein: { min: number; max: number };
    fat: { min: number; max: number };
    carb: { min: number; max: number };
    weight: { min: number; max: number };
  };
  rateKgWeek: number;
  meals: DietMeal[];
  dietWarnings: string[];
  oneMonthProjection: {
    weightRange: { min: number; max: number };
    note: string;
  };
}

export default function PrevisaoIaPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  const [files, setFiles] = useState<Partial<Record<Angle, File>>>({});
  const [previews, setPreviews] = useState<Partial<Record<Angle, string>>>({});
  const [sex, setSex] = useState<Sex>("masculino");
  const [heightCm, setHeightCm] = useState("");
  const [age, setAge] = useState("");
  const [exerciseFreq, setExerciseFreq] = useState<ExerciseFreq>("3-4");
  const [dailyRoutine, setDailyRoutine] = useState<DailyRoutine>("sedentaria");
  const activityLevel: ActivityLevel = useMemo(() => calculateActivityLevel(exerciseFreq, dailyRoutine), [exerciseFreq, dailyRoutine]);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayISO());
  const [weeks, setWeeks] = useState("4");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [dietSaved, setDietSaved] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    loadCycles().then((c) => setCycles(sortByDate(c)));
    loadPreferences().then((p) => {
      if (p.sex) setSex(p.sex);
      if (p.heightCm) setHeightCm(String(p.heightCm));
      if (p.age) setAge(String(p.age));
      setPrefsLoaded(true);
    });
  }, [ready, user]);

  const last = cycles && cycles.length ? cycles[cycles.length - 1] : null;
  const isFirstCycle = cycles !== null && cycles.length === 0;

  const canSubmit = useMemo(() => {
    return !!files.frente && !!weight && !!heightCm && !!age && parseFloat(weight) > 0 && parseFloat(heightCm) > 0 && parseFloat(age) > 0;
  }, [files, weight, heightCm, age]);

  function handleFileChange(angle: Angle, f: File | null) {
    setFiles((prev) => ({ ...prev, [angle]: f ?? undefined }));
    setPreviews((prev) => {
      const old = prev[angle];
      if (old) URL.revokeObjectURL(old);
      return { ...prev, [angle]: f ? URL.createObjectURL(f) : undefined };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || cycles === null) return;

    // duas entradas na mesma data quebram o cálculo de taxa de variação (fica ~0, TDEE vira uma
    // cópia do ciclo anterior) — em vez de deixar isso passar silenciosamente, confirma com o usuário
    let effectiveCycles = cycles;
    if (last && last.date === date) {
      const overwrite = window.confirm(
        `Já existe um ciclo registrado em ${fmtDate(date)} (${fmt(last.weightKg)}kg, ${fmt(last.kcal, 0)}kcal).\n\n` +
          `Duas entradas na mesma data impedem calcular a taxa de variação corretamente.\n\n` +
          `OK = substituir esse ciclo pelos dados de agora.\nCancelar = escolher outra data antes de gerar.`
      );
      if (!overwrite) return;
      await deleteCycle(last.id);
      effectiveCycles = cycles.filter((c) => c.id !== last.id);
      setCycles(effectiveCycles);
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setSaved(false);
    try {
      const photos = await Promise.all(
        (Object.entries(files) as [Angle, File][])
          .filter(([, f]) => !!f)
          .map(async ([angle, f]) => {
            const { base64, mediaType } = await resizeImageToBase64(f);
            return { angle, base64, mediaType };
          })
      );

      const res = await fetch("/api/previsao-ia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photos,
          sex,
          heightCm: parseFloat(heightCm),
          age: parseFloat(age),
          activityLevel,
          currentWeightKg: parseFloat(weight),
          date,
          weeksToNextConsult: parseFloat(weeks),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao gerar previsão.");
      setResult(data);
      setDietSaved(false);

      // salva as informações básicas no perfil, pra não pedir de novo da próxima vez
      const prefs = await loadPreferences();
      await savePreferences({ ...prefs, sex, heightCm: parseFloat(heightCm), age: parseFloat(age), activityLevel });

      const frenteFile = files.frente!;
      const anglesUsed = Object.keys(files).filter((a) => files[a as Angle]);
      await addProgressPhoto({
        date,
        file: frenteFile,
        waistCm: null,
        neckCm: null,
        hipCm: null,
        sex,
        estimatedBfPercent: data.bfPercentVisual,
        notes: `%BF estimado por IA (Claude) a partir de foto(s): ${anglesUsed.join(", ")}.`,
        cycleId: null,
      });

      if (data.isFirstCycle) {
        await addCycle({
          id: crypto.randomUUID(),
          date,
          weightKg: parseFloat(weight),
          bodyFatPercent: data.bfPercentVisual,
          kcal: data.recommendedKcal,
          proteinG: data.recommendedProteinG,
          fatG: data.recommendedFatG,
          carbG: data.recommendedCarbG,
          isPrediction: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar previsão.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePrediction() {
    if (!result || !user) return;
    const target = new Date(date);
    target.setDate(target.getDate() + Math.round(parseFloat(weeks) * 7));
    await saveLastPrediction({
      createdAt: new Date().toISOString(),
      targetDate: target.toISOString().slice(0, 10),
      kcal: result.ranges.kcal,
      proteinG: result.ranges.protein,
      fatG: result.ranges.fat,
      carbG: result.ranges.carb,
      weightKg: result.ranges.weight,
    });
    setSaved(true);
  }

  async function handleGoToDietBuilder() {
    await handleSavePrediction();
    router.push("/dieta/novo");
  }

  function dietFromResult(): Diet | null {
    if (!result) return null;
    return {
      id: crypto.randomUUID(),
      name: `Plano ${fmtDate(date)}`,
      createdAt: new Date().toISOString(),
      targetKcal: result.recommendedKcal,
      targetProteinG: result.recommendedProteinG,
      targetFatG: result.recommendedFatG,
      targetCarbG: result.recommendedCarbG,
      meals: result.meals,
    };
  }

  async function handleSaveDiet() {
    const diet = dietFromResult();
    if (!diet || !user) return;
    await upsertDiet(diet);
    setDietSaved(true);
  }

  async function handleDownloadPdf() {
    const diet = dietFromResult();
    if (!diet) return;
    generateDietPdf(diet);
    await handleSaveDiet();
  }

  if (!cycles || !prefsLoaded) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div className="skeleton h-14 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight gradient-text">
          {isFirstCycle ? "Começar: informações e fotos" : "Novo ciclo: fotos e previsão"}
        </h1>
        <p className="text-sm text-muted mt-2">
          {isFirstCycle
            ? "Preencha suas informações básicas e envie fotos — o Claude estima seu %BF e calcula sua dieta inicial. Da próxima vez, essas informações já vêm preenchidas."
            : `O Claude estima seu %BF a partir das fotos e recomenda um ponto dentro das faixas calculadas pelo seu algoritmo — baseado no último ciclo (${fmtDate(last!.date)}: ${fmt(last!.weightKg)} kg).`}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-6">
        <div>
          <span className="block text-xs text-muted mb-2">1. Informações básicas</span>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sexo biológico">
              <select value={sex} onChange={(e) => setSex(e.target.value as Sex)} className="input">
                <option value="masculino">Masculino</option>
                <option value="feminino">Feminino</option>
              </select>
            </Field>
            <Field label="Altura (cm)">
              <input type="number" step="0.1" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className="input" placeholder="ex: 178" />
            </Field>
            <Field label="Idade">
              <input type="number" step="1" value={age} onChange={(e) => setAge(e.target.value)} className="input" placeholder="ex: 28" />
            </Field>
            <Field label="Peso atual (kg)">
              <input type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} className="input" placeholder="ex: 85.2" />
            </Field>
            <Field label="Data da pesagem">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <Field label="Quantos dias por semana você treina?">
              <select value={exerciseFreq} onChange={(e) => setExerciseFreq(e.target.value as ExerciseFreq)} className="input">
                {(Object.keys(EXERCISE_FREQ_LABEL) as ExerciseFreq[]).map((f) => (
                  <option key={f} value={f}>
                    {EXERCISE_FREQ_LABEL[f]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Como é seu dia fora do treino?">
              <select value={dailyRoutine} onChange={(e) => setDailyRoutine(e.target.value as DailyRoutine)} className="input">
                {(Object.keys(DAILY_ROUTINE_LABEL) as DailyRoutine[]).map((r) => (
                  <option key={r} value={r}>
                    {DAILY_ROUTINE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <p className="text-xs text-muted mt-2">
            Nível de atividade calculado: <span className="text-accent font-medium">{ACTIVITY_LABEL[activityLevel]}</span>
          </p>
        </div>

        <div>
          <span className="block text-xs text-muted mb-2">2. Fotos (frente obrigatória, o resto ajuda a precisão)</span>
          <div className="grid gap-4 sm:grid-cols-4">
            {ANGLES.map(({ key, label, required }) => (
              <div key={key}>
                <label className="block cursor-pointer">
                  <div className="h-28 w-full rounded-lg border border-dashed border-border bg-surface-raised/40 flex items-center justify-center overflow-hidden hover:border-accent/40 transition-colors">
                    {previews[key] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={previews[key]} alt={label} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-muted text-center px-2">
                        {label}
                        {required && " *"}
                      </span>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileChange(key, e.target.files?.[0] ?? null)}
                  />
                </label>
                <span className="block text-[10px] text-muted mt-1 text-center">
                  {label}
                  {required && " *"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {!isFirstCycle && (
          <div>
            <span className="block text-xs text-muted mb-2">3. Parâmetros da previsão</span>
            <Field label="Semanas até a próxima consulta">
              <input type="number" step="1" min="1" value={weeks} onChange={(e) => setWeeks(e.target.value)} className="input" />
            </Field>
            <p className="text-xs text-muted mt-2">
              Composição do ganho (músculo/misto/gordura) é decidida pela IA comparando com sua foto anterior — não
              precisa escolher.
            </p>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <button type="submit" disabled={!canSubmit || loading} className="btn-primary">
          {loading ? "Analisando fotos…" : isFirstCycle ? "Calcular minha dieta inicial" : "Gerar previsão com IA"}
        </button>
      </form>

      {result && (
        <section className="space-y-6">
          <div className="card p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconScale className="h-4 w-4" /> %BF estimado por IA
            </div>
            <div className="mt-2 text-2xl font-semibold">
              {fmt(result.bfPercentVisual, 1)}%
              <span className="ml-2 text-xs font-normal text-muted">confiança {result.bfConfidence}</span>
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.bfReasoning}</p>
          </div>

          <div className="card p-5 border-accent/30">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconTarget className="h-4 w-4" /> Estratégia decidida
            </div>
            <div className="mt-2 text-xl font-semibold text-accent">{result.strategyLabel}</div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.strategyReason}</p>
          </div>

          {result.evolutionNote && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconTarget className="h-4 w-4" /> Evolução muscular
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.evolutionNote}</p>
            </div>
          )}

          {result.gainCompositionLabel && (
            <div className="card p-5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <IconDrumstick className="h-4 w-4" /> Composição do ganho (decidida pela IA)
              </div>
              <div className="mt-2 text-lg font-semibold">{result.gainCompositionLabel}</div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{result.gainCompositionReasoning}</p>
            </div>
          )}

          <div className="card p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
              <IconScale className="h-4 w-4" /> Projeção de 1 mês seguindo essa dieta
            </div>
            <div className="mt-2 text-xl font-semibold">
              {fmt(result.oneMonthProjection.weightRange.min, 1)}–{fmt(result.oneMonthProjection.weightRange.max, 1)} kg
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{result.oneMonthProjection.note}</p>
          </div>

          <div className="card-glow p-6">
            <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                <IconTarget className="h-3.5 w-3.5" />
              </span>
              {result.isFirstCycle ? "Metas iniciais" : "Recomendação da IA (dentro das faixas do seu algoritmo)"}
            </h2>
            <div className="grid gap-5 sm:grid-cols-4">
              <MacroCard icon={<IconFlame className="h-4 w-4" />} label="Kcal" value={result.recommendedKcal} range={result.ranges.kcal} decimals={0} />
              <MacroCard icon={<IconDrumstick className="h-4 w-4" />} label="Proteína" value={result.recommendedProteinG} range={result.ranges.protein} suffix="g" />
              <MacroCard icon={<IconDroplet className="h-4 w-4" />} label="Gordura" value={result.recommendedFatG} range={result.ranges.fat} suffix="g" />
              <MacroCard icon={<IconWheat className="h-4 w-4" />} label="Carboidrato" value={result.recommendedCarbG} range={result.ranges.carb} suffix="g" />
            </div>
            <p className="text-sm text-muted leading-relaxed mt-5 pt-5 border-t border-border">{result.note}</p>
          </div>

          {result.meals.length > 0 && (
            <div className="card p-6">
              <h2 className="text-sm font-semibold mb-1 flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
                  <IconClipboard className="h-3.5 w-3.5" />
                </span>
                Dieta montada
              </h2>
              <p className="text-xs text-muted mb-4">
                Já distribuída nas refeições pra bater as metas acima. Ajuste manualmente em{" "}
                <a href="/dieta/novo" className="text-accent hover:underline">
                  Montar dieta
                </a>{" "}
                se quiser trocar algo.
              </p>

              {result.dietWarnings.length > 0 && (
                <div className="mb-4 text-xs text-warn space-y-1">
                  {result.dietWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-4">
                {result.meals.map((meal) => {
                  const totals = mealTotals(meal);
                  return (
                    <div key={meal.id} className="rounded-lg border border-border bg-surface-raised/40 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold">{meal.name}</span>
                        <span className="text-xs text-muted">
                          {fmt(totals.kcal, 0)} kcal · {fmt(totals.proteinG, 0)}p / {fmt(totals.fatG, 0)}g / {fmt(totals.carbG, 0)}c
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {meal.items.map((item) => {
                          const food = getFood(item.foodId);
                          const m = itemMacros(item);
                          return (
                            <li key={item.id} className="flex items-center justify-between text-xs text-muted">
                              <span>
                                {food?.name ?? item.foodId} — {fmt(item.quantityG, 0)}g
                              </span>
                              <span>{fmt(m.kcal, 0)} kcal</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-border">
                <span className="text-xs text-muted self-center">
                  Total: {fmt(dietTotals({ id: "", name: "", createdAt: "", targetKcal: 0, targetProteinG: 0, targetFatG: 0, targetCarbG: 0, meals: result.meals }).kcal, 0)} kcal
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center flex-wrap">
            <button type="button" onClick={handleSavePrediction} className="btn-secondary">
              {saved ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
              {saved ? "Previsão salva" : "Salvar previsão"}
            </button>
            <button type="button" onClick={handleDownloadPdf} className="btn-primary">
              <IconClipboard className="h-4 w-4" />
              Baixar PDF do plano
            </button>
            <button type="button" onClick={handleSaveDiet} className="btn-secondary">
              {dietSaved ? <IconCheck className="h-4 w-4" /> : null}
              {dietSaved ? "Dieta salva" : "Salvar dieta"}
            </button>
            <button type="button" onClick={handleGoToDietBuilder} className="text-xs text-accent hover:underline">
              ajustar manualmente →
            </button>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            {result.isFirstCycle
              ? "Faixa vem da sua composição corporal estimada; a IA só leu o %BF na foto."
              : "A faixa vem do seu algoritmo (mesma matemática de sempre); a IA só escolhe o ponto dentro dela usando as fotos como evidência."}{" "}
            A foto de frente foi salva em{" "}
            <a href="/fotos" className="text-accent hover:underline">
              Fotos de progresso
            </a>
            .
          </p>
        </section>
      )}
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

function MacroCard({
  icon,
  label,
  value,
  range,
  suffix = "kcal",
  decimals = 1,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  range: { min: number; max: number };
  suffix?: string;
  decimals?: number;
}) {
  const isRange = Math.abs(range.max - range.min) > 0.01;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-accent">{icon}</span>
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-lg">
        {fmt(value, decimals)}
        <span className="text-muted font-normal text-xs"> {suffix}</span>
      </div>
      {isRange && (
        <div className="text-[11px] text-muted mt-0.5">
          faixa {fmt(range.min, decimals)}–{fmt(range.max, decimals)}
        </div>
      )}
    </div>
  );
}
