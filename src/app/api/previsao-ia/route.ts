import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { predictNextCycle } from "@/lib/dietEngine";
import { estimateBodyComposition } from "@/lib/bodyComposition";
import { Cycle, GainComposition } from "@/lib/types";
import { ActivityLevel } from "@/lib/questionnaire";

const ANGLE_LABEL: Record<string, string> = {
  frente: "Frente",
  costas: "Costas",
  lado_esquerdo: "Lado esquerdo",
  lado_direito: "Lado direito",
};

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

interface BfEstimate {
  bfPercentVisual: number;
  bfConfidence: "baixa" | "media" | "alta";
  bfReasoning: string;
}

async function estimateBfFromPhotos(client: Anthropic, photos: PhotoInput[], contextText: string): Promise<BfEstimate> {
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 800,
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
          },
          required: ["bfPercentVisual", "bfConfidence", "bfReasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: BF_TOOL_NAME },
    messages: [{ role: "user", content: [...buildImageBlocks(photos), { type: "text", text: contextText }] }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use" && b.name === BF_TOOL_NAME);
  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("O modelo não retornou uma estimativa de %BF válida.");
  }
  const raw = toolBlock.input as BfEstimate;
  return {
    bfPercentVisual: clamp(raw.bfPercentVisual, 3, 60),
    bfConfidence: raw.bfConfidence,
    bfReasoning: raw.bfReasoning,
  };
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

  const { data: cycleRows, error: cyclesError } = await supabase
    .from("cycles")
    .select("date,weight_kg,body_fat_percent,kcal,protein_g,fat_g,carb_g,is_prediction")
    .eq("user_id", user.id)
    .order("date", { ascending: true });
  if (cyclesError) {
    return NextResponse.json({ error: cyclesError.message }, { status: 500 });
  }

  const client = new Anthropic();

  // ---- primeiro ciclo: sem histórico, usa composição corporal (Mifflin/Katch) em vez do algoritmo de progressão ----
  if (!cycleRows || cycleRows.length === 0) {
    let bf: BfEstimate;
    try {
      bf = await estimateBfFromPhotos(
        client,
        photos,
        `Contexto: sexo ${sex}, altura ${heightCm}cm, peso ${currentWeightKg}kg, idade ${age}. Primeira estimativa deste usuário, sem fotos anteriores para comparar.`
      );
    } catch (err) {
      if (err instanceof Anthropic.APIError) {
        const errBody = err.error as { error?: { message?: string } } | undefined;
        return NextResponse.json({ error: `Erro na API da Anthropic: ${errBody?.error?.message ?? err.message}` }, { status: err.status ?? 502 });
      }
      return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao estimar %BF." }, { status: 502 });
    }

    const comp = estimateBodyComposition({
      weightKg: currentWeightKg,
      heightCm,
      bodyFatPercent: bf.bfPercentVisual,
      age,
      sex,
      activityLevel,
    });

    const point = (v: number) => ({ min: v, max: v });

    return NextResponse.json({
      isFirstCycle: true,
      bfPercentVisual: bf.bfPercentVisual,
      bfConfidence: bf.bfConfidence,
      bfReasoning: bf.bfReasoning,
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

Modo estabilidade: ${stabilityMode ? "sim" : "não"}. Degrau de proteína aplicado: ${applyProteinStep ? "sim" : "não"}.`;

  const SYSTEM_PROMPT = `Você é um assistente que lê fotos de físico (frente, costas, laterais) para estimar %BF visualmente e, em seguida, monta a prescrição do próximo ciclo de dieta — mas usando exclusivamente os parâmetros e faixas numéricas já calculados pelo algoritmo determinístico do usuário, fornecidos no contexto. Você NÃO deve inventar sua própria metodologia de cálculo de macros nem sair das faixas fornecidas — seu papel é (1) estimar %BF a partir da evidência visual das fotos, cruzando os ângulos disponíveis, e (2) escolher, dentro de cada faixa já calculada, o ponto que melhor se encaixa com o que a foto mostra (ex: se a foto sugere acúmulo de gordura mais rápido que o esperado, incline para o extremo inferior da faixa de kcal; se sugere composição favorável, incline para o extremo superior). Responda só pela ferramenta fornecida. Seja direto e específico, sem jargão excessivo, em português.`;

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
      messages: [{ role: "user", content: [...buildImageBlocks(photos), { type: "text", text: contextText }] }],
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
    recommendedKcal: number;
    recommendedProteinG: number;
    recommendedFatG: number;
    recommendedCarbG: number;
    note: string;
  };

  return NextResponse.json({
    isFirstCycle: false,
    bfPercentVisual: clamp(raw.bfPercentVisual, 3, 60),
    bfConfidence: raw.bfConfidence,
    bfReasoning: raw.bfReasoning,
    recommendedKcal: clamp(raw.recommendedKcal, result.kcalRange.min, result.kcalRange.max),
    recommendedProteinG: clamp(raw.recommendedProteinG, result.proteinRange.min, result.proteinRange.max),
    recommendedFatG: clamp(raw.recommendedFatG, result.fatRange.min, result.fatRange.max),
    recommendedCarbG: clamp(raw.recommendedCarbG, result.carbRange.min, result.carbRange.max),
    note: raw.note,
    ranges: {
      kcal: result.kcalRange,
      protein: result.proteinRange,
      fat: result.fatRange,
      carb: result.carbRange,
      weight: result.projectedWeightRange,
    },
    rateKgWeek: result.rateKgWeek,
  });
}
