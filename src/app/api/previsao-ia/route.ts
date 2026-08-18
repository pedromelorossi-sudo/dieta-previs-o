import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { predictNextCycle } from "@/lib/dietEngine";
import { estimateBodyComposition, PATH_LABEL, DietPath } from "@/lib/bodyComposition";
import { generateDietMeals } from "@/lib/dietGenerator";
import { Cycle, GainComposition } from "@/lib/types";
import { ActivityLevel, Restriction } from "@/lib/questionnaire";

const ANGLE_LABEL: Record<string, string> = {
  frente: "Frente",
  costas: "Costas",
  lado_esquerdo: "Lado esquerdo",
  lado_direito: "Lado direito",
};

const PHOTOS_BUCKET = "progress-photos";

interface PhotoInput {
  angle: string;
  base64: string;
  mediaType: string;
}

interface RequestBody {
  photos: PhotoInput[];
  sex: "masculino" | "feminino";
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  currentWeightKg: number;
  date: string;
  weeksToNextConsult: number;
  gainComposition: GainComposition;
  stabilityMode: boolean;
  applyProteinStep: boolean;
}

interface CycleRow {
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  is_prediction: boolean;
}

interface PreferencesRow {
  meals_per_day: number;
  cooking_time: string;
  restrictions: Restriction[];
  disliked_food_ids: string[];
  favorite_food_ids: string[];
  notes: string;
}

function rowToCycle(row: CycleRow, id: string): Cycle {
  return {
    id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbG: Number(row.carb_g),
    isPrediction: row.is_prediction,
  };
}

const BF_TOOL_NAME = "registrar_bf";
const PLAN_TOOL_NAME = "registrar_previsao";

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, Math.min(min, max)), Math.max(min, max));

function buildImageBlocks(photos: PhotoInput[]): Anthropic.ContentBlockParam[] {
  const blocks: Anthropic.ContentBlockParam[] = [];
  for (const photo of photos) {
    blocks.push({ type: "text", text: `Foto: ${ANGLE_LABEL[photo.angle] ?? photo.angle}` });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: photo.mediaType as "image/jpeg", data: photo.base64 },
    });
  }
  return blocks;
}

function mediaTypeFromPath(path: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

interface PreviousPhoto {
  date: string;
  base64: string;
  mediaType: string;
}

async function fetchPreviousPhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<PreviousPhoto | null> {
  const { data: rows } = await supabase
    .from("progress_photos")
    .select("date,photo_path")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1);
  const prev = rows?.[0];
  if (!prev) return null;

  const { data: blob, error } = await supabase.storage.from(PHOTOS_BUCKET).download(prev.photo_path);
  if (error || !blob) return null;

  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { date: prev.date, base64, mediaType: mediaTypeFromPath(prev.photo_path) };
}

function evolutionImageBlock(prev: PreviousPhoto | null): Anthropic.ContentBlockParam[] {
  if (!prev) return [];
  return [
    { type: "text", text: `Foto anterior mais recente, de ${prev.date} (para comparar evolução):` },
    { type: "image", source: { type: "base64", media_type: prev.mediaType as "image/jpeg", data: prev.base64 } },
  ];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY não configurada no servidor. Veja o README para configurar." },
      { status: 500 }
    );
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { photos, sex, heightCm, age, activityLevel, currentWeightKg, date, weeksToNextConsult, gainComposition, stabilityMode, applyProteinStep } = body;

  if (!photos || photos.length === 0 || !photos.some((p) => p.angle === "frente")) {
    return NextResponse.json({ error: "Envie pelo menos a foto de frente." }, { status: 400 });
  }
  if (!currentWeightKg || currentWeightKg <= 0 || !heightCm || heightCm <= 0 || !age || age <= 0) {
    return NextResponse.json({ error: "Peso, altura e idade são obrigatórios." }, { status: 400 });
  }

  const [{ data: cycleRows, error: cyclesError }, { data: prefsRow }, previousPhoto] = await Promise.all([
    supabase
      .from("cycles")
      .select("date,weight_kg,body_fat_percent,kcal,protein_g,fat_g,carb_g,is_prediction")
      .eq("user_id", user.id)
      .order("date", { ascending: true }),
    supabase
      .from("preferences")
      .select("meals_per_day,cooking_time,restrictions,disliked_food_ids,favorite_food_ids,notes")
      .eq("user_id", user.id)
      .maybeSingle(),
    fetchPreviousPhoto(supabase, user.id),
  ]);
  if (cyclesError) {
    return NextResponse.json({ error: cyclesError.message }, { status: 500 });
  }

  const prefs = prefsRow as PreferencesRow | null;
  const dietParamsBase = {
    mealsCount: prefs?.meals_per_day ?? 4,
    mustHaveFoodIds: prefs?.favorite_food_ids ?? [],
    restrictions: prefs?.restrictions ?? [],
    excludedFoodIds: prefs?.disliked_food_ids ?? [],
    cookingTime: prefs?.cooking_time ?? "medio",
    notes: prefs?.notes ?? "",
  };

  const client = new Anthropic();
  const evolutionBlocks = evolutionImageBlock(previousPhoto);
  const evolutionInstruction = previousPhoto
    ? "Uma foto anterior foi incluída para comparação — descreva em evolutionNote a evolução muscular percebida desde então (definição, volume, simetria), 1-3 frases, tom direto."
    : "Não há foto anterior para comparar — deixe evolutionNote como string vazia.";

  // ---- primeiro ciclo: sem histórico, usa composição corporal (Mifflin/Katch) em vez do algoritmo de progressão ----
  if (!cycleRows || cycleRows.length === 0) {
    let bfResponse;
    try {
      bfResponse = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 900,
        output_config: { effort: "medium" },
        system:
          "Você estima %BF (percentual de gordura corporal) visualmente a partir de fotos de físico (frente, costas, laterais), cruzando os ângulos disponíveis. Responda só pela ferramenta fornecida, em português.",
        tools: [
          {
            name: BF_TOOL_NAME,
            description: "Registra a estimativa visual de %BF.",
            input_schema: {
              type: "object",
              properties: {
                bfPercentVisual: { type: "number", description: "Estimativa de %BF a partir das fotos, entre 3 e 60." },
                bfConfidence: { type: "string", enum: ["baixa", "media", "alta"] },
                bfReasoning: { type: "string", description: "1-2 frases explicando a leitura visual." },
                evolutionNote: { type: "string" },
              },
              required: ["bfPercentVisual", "bfConfidence", "bfReasoning", "evolutionNote"],
            },
          },
        ],
        tool_choice: { type: "tool", name: BF_TOOL_NAME },
        messages: [
          {
            role: "user",
            content: [
              ...buildImageBlocks(photos),
              ...evolutionBlocks,
              {
                type: "text",
                text: `Contexto: sexo ${sex}, altura ${heightCm}cm, peso ${currentWeightKg}kg, idade ${age}. ${evolutionInstruction}`,
              },
            ],
          },
        ],
      });
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const errBody = err.error as { error?: { message?: string } } | undefined;
        return NextResponse.json({ error: `Erro na API da Anthropic: ${errBody?.error?.message ?? err.message}` }, { status: err.status ?? 502 });
      }
      return NextResponse.json({ error: "Erro ao estimar %BF." }, { status: 502 });
    }

    const bfBlock = bfResponse.content.find((b) => b.type === "tool_use" && b.name === BF_TOOL_NAME);
    if (!bfBlock || bfBlock.type !== "tool_use") {
      return NextResponse.json({ error: "O modelo não retornou uma estimativa de %BF válida." }, { status: 422 });
    }
    const bfRaw = bfBlock.input as { bfPercentVisual: number; bfConfidence: "baixa" | "media" | "alta"; bfReasoning: string; evolutionNote: string };

    const comp = estimateBodyComposition({
      weightKg: currentWeightKg,
      heightCm,
      bodyFatPercent: clamp(bfRaw.bfPercentVisual, 3, 60),
      age,
      sex,
      activityLevel,
    });

    let meals, dietWarnings;
    try {
      ({ meals, warnings: dietWarnings } = await generateDietMeals(client, {
        targetKcal: comp.targetKcal,
        targetProteinG: comp.targetProteinG,
        targetFatG: comp.targetFatG,
        targetCarbG: comp.targetCarbG,
        ...dietParamsBase,
      }));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao montar a dieta." }, { status: 502 });
    }

    const point = (v: number) => ({ min: v, max: v });

    // sem histórico observado ainda — projeta a partir do superávit/déficit teórico vs. TDEE,
    // usando 7700kcal/kg como proxy de gordura (cutting) e uma mistura mais barata em superávit (bulking)
    const oneMonthE = comp.path === "cutting" ? 7700 : comp.path === "bulking" ? 5250 : 7700;
    const oneMonthRateKgWeek = (comp.tdee * comp.surplusPercent * 7) / oneMonthE;
    const oneMonthMid = currentWeightKg + oneMonthRateKgWeek * 4;
    const oneMonthDelta = Math.abs(oneMonthRateKgWeek * 4) * 0.25;
    const oneMonthProjection = {
      weightRange: { min: oneMonthMid - oneMonthDelta, max: oneMonthMid + oneMonthDelta },
      note:
        comp.path === "normocalorico"
          ? "Meta é manutenção — peso deve ficar estável em 4 semanas, sem histórico ainda pra confirmar."
          : `Estimativa teórica (sem histórico ainda): mantendo esse padrão, projeção de peso em 4 semanas é ${(oneMonthMid - oneMonthDelta).toFixed(1)}–${(oneMonthMid + oneMonthDelta).toFixed(1)}kg. Vai ficar mais precisa a partir do 2º ciclo, com dados reais.`,
    };

    return NextResponse.json({
      isFirstCycle: true,
      oneMonthProjection,
      bfPercentVisual: clamp(bfRaw.bfPercentVisual, 3, 60),
      bfConfidence: bfRaw.bfConfidence,
      bfReasoning: bfRaw.bfReasoning,
      evolutionNote: bfRaw.evolutionNote || null,
      strategy: comp.path,
      strategyLabel: PATH_LABEL[comp.path],
      strategyReason: comp.pathReason,
      recommendedKcal: comp.targetKcal,
      recommendedProteinG: comp.targetProteinG,
      recommendedFatG: comp.targetFatG,
      recommendedCarbG: comp.targetCarbG,
      note: comp.pathReason,
      ranges: {
        kcal: point(comp.targetKcal),
        protein: point(comp.targetProteinG),
        fat: point(comp.targetFatG),
        carb: point(comp.targetCarbG),
        weight: point(currentWeightKg),
      },
      rateKgWeek: 0,
      meals,
      dietWarnings,
    });
  }

  // ---- ciclos seguintes: usa o algoritmo determinístico de progressão + Claude escolhe o ponto na faixa ----
  const history = cycleRows.map((row, i) => rowToCycle(row as CycleRow, String(i)));

  const result = predictNextCycle({
    history,
    currentWeightKg,
    currentDate: date,
    weeksToNextConsult,
    gainComposition,
    stabilityMode,
    applyProteinStep,
  });
  if (!result) {
    return NextResponse.json({ error: "Não foi possível calcular a previsão a partir do histórico." }, { status: 400 });
  }

  const historyText = history
    .map(
      (c) =>
        `- ${c.date}: ${c.weightKg}kg, %BF ${c.bodyFatPercent ?? "?"}, ${c.kcal}kcal, P ${c.proteinG}g, G ${c.fatG}g, C ${c.carbG}g${c.isPrediction ? " (previsão)" : ""}`
    )
    .join("\n");

  const contextText = `Histórico de ciclos:
${historyText}

Contexto do usuário: sexo ${sex}, altura ${heightCm}cm, peso atual informado ${currentWeightKg}kg em ${date}.

Regras extraídas do histórico pelo algoritmo determinístico (NÃO recalcule, use como estão):
- kcal/kg projetado: ${result.rules.kcalPerKgExtrapolated.toFixed(2)}
- proteína/kg: ${result.proteinPerKgUsed.toFixed(2)}
- gordura/kg: ${result.fatPerKgUsed.toFixed(2)}
- taxa de variação observada: ${result.rateKgWeek.toFixed(3)} kg/semana
- peso projetado em ${weeksToNextConsult} semana(s): ${result.projectedWeightRange.min.toFixed(1)}–${result.projectedWeightRange.max.toFixed(1)}kg

Faixas já calculadas pelo algoritmo (seus valores recomendados DEVEM ficar dentro destas faixas):
- kcal: ${result.kcalRange.min.toFixed(0)}–${result.kcalRange.max.toFixed(0)}
- proteína: ${result.proteinRange.min.toFixed(1)}–${result.proteinRange.max.toFixed(1)}g
- gordura: ${result.fatRange.min.toFixed(1)}–${result.fatRange.max.toFixed(1)}g
- carboidrato: ${result.carbRange.min.toFixed(1)}–${result.carbRange.max.toFixed(1)}g

Modo estabilidade: ${stabilityMode ? "sim" : "não"}. Degrau de proteína aplicado: ${applyProteinStep ? "sim" : "não"}.

${evolutionInstruction}`;

  const SYSTEM_PROMPT = `Você é um assistente que lê fotos de físico (frente, costas, laterais) para estimar %BF visualmente e, em seguida, monta a prescrição do próximo ciclo de dieta — mas usando exclusivamente os parâmetros e faixas numéricas já calculados pelo algoritmo determinístico do usuário, fornecidos no contexto. Você NÃO deve inventar sua própria metodologia de cálculo de macros nem sair das faixas fornecidas — seu papel é (1) estimar %BF a partir da evidência visual das fotos, cruzando os ângulos disponíveis, (2) escolher, dentro de cada faixa já calculada, o ponto que melhor se encaixa com o que a foto mostra, e (3) se houver foto anterior, comentar a evolução muscular percebida. Responda só pela ferramenta fornecida. Seja direto e específico, sem jargão excessivo, em português.`;

  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1500,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: PLAN_TOOL_NAME,
          description: "Registra a estimativa visual de %BF e a prescrição recomendada para o próximo ciclo.",
          input_schema: {
            type: "object",
            properties: {
              bfPercentVisual: { type: "number", description: "Estimativa de %BF a partir das fotos, entre 3 e 60." },
              bfConfidence: { type: "string", enum: ["baixa", "media", "alta"] },
              bfReasoning: { type: "string", description: "1-2 frases explicando a leitura visual." },
              evolutionNote: { type: "string" },
              recommendedKcal: { type: "number" },
              recommendedProteinG: { type: "number" },
              recommendedFatG: { type: "number" },
              recommendedCarbG: { type: "number" },
              note: { type: "string", description: "Nota curta em português, tom de coach, até 120 palavras." },
            },
            required: [
              "bfPercentVisual",
              "bfConfidence",
              "bfReasoning",
              "evolutionNote",
              "recommendedKcal",
              "recommendedProteinG",
              "recommendedFatG",
              "recommendedCarbG",
              "note",
            ],
          },
        },
      ],
      tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
      messages: [{ role: "user", content: [...buildImageBlocks(photos), ...evolutionBlocks, { type: "text", text: contextText }] }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const errBody = err.error as { error?: { message?: string } } | undefined;
      const message = errBody?.error?.message ?? err.message;
      return NextResponse.json({ error: `Erro na API da Anthropic: ${message}` }, { status: err.status ?? 502 });
    }
    return NextResponse.json({ error: "Erro inesperado ao chamar a análise por imagem." }, { status: 502 });
  }

  const toolBlock = response.content.find((b) => b.type === "tool_use" && b.name === PLAN_TOOL_NAME);
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return NextResponse.json({ error: "O modelo não retornou uma prescrição válida." }, { status: 422 });
  }

  const raw = toolBlock.input as {
    bfPercentVisual: number;
    bfConfidence: "baixa" | "media" | "alta";
    bfReasoning: string;
    evolutionNote: string;
    recommendedKcal: number;
    recommendedProteinG: number;
    recommendedFatG: number;
    recommendedCarbG: number;
    note: string;
  };

  const recommendedKcal = clamp(raw.recommendedKcal, result.kcalRange.min, result.kcalRange.max);
  const recommendedProteinG = clamp(raw.recommendedProteinG, result.proteinRange.min, result.proteinRange.max);
  const recommendedFatG = clamp(raw.recommendedFatG, result.fatRange.min, result.fatRange.max);
  const recommendedCarbG = clamp(raw.recommendedCarbG, result.carbRange.min, result.carbRange.max);

  let meals, dietWarnings;
  try {
    ({ meals, warnings: dietWarnings } = await generateDietMeals(client, {
      targetKcal: recommendedKcal,
      targetProteinG: recommendedProteinG,
      targetFatG: recommendedFatG,
      targetCarbG: recommendedCarbG,
      ...dietParamsBase,
    }));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao montar a dieta." }, { status: 502 });
  }

  // projeção fixa de 4 semanas, à parte do horizonte escolhido pra próxima consulta — usa a taxa
  // observada de verdade (rateKgWeek), não uma suposição teórica, já que há histórico real aqui
  const oneMonthMid = currentWeightKg + result.rateKgWeek * 4;
  const oneMonthDelta = Math.abs(result.rateKgWeek * 4) * 0.15;
  const oneMonthProjection = {
    weightRange: { min: oneMonthMid - oneMonthDelta, max: oneMonthMid + oneMonthDelta },
    note: `Mantendo o padrão observado (${result.rateKgWeek >= 0 ? "+" : ""}${result.rateKgWeek.toFixed(2)} kg/semana), projeção de peso em 4 semanas: ${(oneMonthMid - oneMonthDelta).toFixed(1)}–${(oneMonthMid + oneMonthDelta).toFixed(1)}kg.`,
  };

  // estratégia derivada do superávit médio já calculado pelo algoritmo (não é o Claude que decide isto)
  const avgSurplus = (result.surplusPercentRange.min + result.surplusPercentRange.max) / 2;
  const strategy: DietPath = avgSurplus > 0.03 ? "bulking" : avgSurplus < -0.03 ? "cutting" : "normocalorico";
  const strategyReason = `Superávit médio de ${(avgSurplus * 100).toFixed(1)}% sobre a manutenção estimada (TDEE ${result.tdeeRange.min.toFixed(0)}–${result.tdeeRange.max.toFixed(0)}kcal), extraído da progressão do seu histórico — ${
    strategy === "cutting"
      ? "por isso o ciclo está em déficit, priorizando perda de gordura."
      : strategy === "bulking"
        ? "por isso o ciclo está em superávit, priorizando ganho de massa."
        : "por isso o ciclo está perto da manutenção, sem grande variação de peso esperada."
  }`;

  return NextResponse.json({
    isFirstCycle: false,
    oneMonthProjection,
    strategy,
    strategyLabel: PATH_LABEL[strategy],
    strategyReason,
    bfPercentVisual: clamp(raw.bfPercentVisual, 3, 60),
    bfConfidence: raw.bfConfidence,
    bfReasoning: raw.bfReasoning,
    evolutionNote: raw.evolutionNote || null,
    recommendedKcal,
    recommendedProteinG,
    recommendedFatG,
    recommendedCarbG,
    note: raw.note,
    ranges: {
      kcal: result.kcalRange,
      protein: result.proteinRange,
      fat: result.fatRange,
      carb: result.carbRange,
      weight: result.projectedWeightRange,
    },
    rateKgWeek: result.rateKgWeek,
    meals,
    dietWarnings,
  });
}
