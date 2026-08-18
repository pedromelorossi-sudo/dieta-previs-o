import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { predictNextCycle, E_SCENARIOS } from "@/lib/dietEngine";
import { estimateBodyComposition, classifyPathFromBf, PATH_LABEL } from "@/lib/bodyComposition";
import { generateDietMeals } from "@/lib/dietGenerator";
import { Cycle, GainComposition } from "@/lib/types";
import {
  ActivityLevel,
  Restriction,
  ExerciseFreq,
  SessionDuration,
  OccupationActivity,
  CommuteActivity,
  HouseholdActivity,
  LeisureActivity,
  StairsUse,
} from "@/lib/questionnaire";

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

type WeightTrend = "subindo" | "descendo" | "estavel" | "nao_sei";
type Adherence = "seguiu" | "comeu_mais" | "comeu_menos" | "nao_acompanhou";

interface RequestBody {
  photos: PhotoInput[];
  sex: "masculino" | "feminino";
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  exerciseFreq?: ExerciseFreq;
  sessionDuration?: SessionDuration;
  dailyStepsAvg?: number;
  occupationActivity?: OccupationActivity;
  commuteActivity?: CommuteActivity;
  householdActivity?: HouseholdActivity;
  leisureActivity?: LeisureActivity;
  stairsUse?: StairsUse;
  currentWeightKg: number;
  date: string;
  weeksToNextConsult: number;
  currentIntakeKcal?: number;
  weightTrend?: WeightTrend;
  lastCycleAdherence?: Adherence;
  lastCycleActualKcal?: number;
}

interface CycleRow {
  id: string;
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carb_g: number;
  is_prediction: boolean;
  actual_kcal: number | null;
}

interface PreferencesRow {
  meals_per_day: number;
  cooking_time: string;
  restrictions: Restriction[];
  disliked_food_ids: string[];
  favorite_food_ids: string[];
  notes: string;
}

function rowToCycle(row: CycleRow): Cycle {
  return {
    id: row.id,
    date: row.date,
    weightKg: Number(row.weight_kg),
    bodyFatPercent: row.body_fat_percent != null ? Number(row.body_fat_percent) : null,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbG: Number(row.carb_g),
    isPrediction: row.is_prediction,
    actualKcal: row.actual_kcal != null ? Number(row.actual_kcal) : null,
  };
}

const BF_TOOL_NAME = "registrar_bf";
const VISION_TOOL_NAME = "registrar_analise_visual";

// Protocolo baseado em literatura de composição corporal (não em charts comerciais/não revisados).
// Fontes: Majmudar et al. 2022, NPJ Digital Medicine (DOI 10.1038/s41746-022-00628-3) — validação de
// %BF por foto via visão computacional (CNN) contra DXA em 134 adultos, erro médio 2,16%, mais preciso
// que bioimpedância; sinal vem do contorno corporal, não de marcadores isolados. Ofenheimer et al. 2020,
// Eur J Clin Nutr (DOI 10.1038/s41430-020-0596-5) — referência DXA de distribuição de gordura por sexo
// (padrão andróide em homens vs. ginóide em mulheres). Kouri et al. 1995, Clin J Sport Med
// (DOI 10.1097/00042752-199510000-00003) — teto de FFMI natural (~25) em atletas sem esteroides.
const VISUAL_BF_PROTOCOL = `PROTOCOLO DE LEITURA VISUAL DE %BF (baseado em literatura científica de composição corporal, não em charts comerciais):

1) BASE NO CONTORNO GERAL, NÃO EM UM MARCADOR ISOLADO. O estudo de validação mais robusto de %BF por foto (Majmudar et al. 2022, NPJ Digital Medicine) comparou fotos 2D contra DXA em 134 adultos e chegou a erro médio de 2,16% — mais preciso que bioimpedância — usando o contorno/silhueta corporal como sinal principal, não marcadores isolados como "aparece veia" ou "aparece abdômen". Leia a silhueta completa nos ângulos disponíveis (afunilamento cintura-ombro, circunferência de cintura relativa a tórax/quadril, espessura de tecido visível sobre costelas/flancos/lombar) antes de fixar um número.

2) PADRÃO DE DISTRIBUIÇÃO DE GORDURA POR SEXO (referência DXA, Ofenheimer et al. 2020): homens acumulam gordura primeiro em padrão andróide — abdômen, flancos, lombar, só depois peito/braço — então a região mais diagnóstica no homem é abdômen/cintura/flanco, não braço ou perna. Mulheres acumulam em padrão ginóide — quadril, coxa, tríceps — então a região mais diagnóstica na mulher é quadril/coxa/tríceps; abdômen de mulher tende a "esconder" %BF mais alto do que o mesmo abdômen apresentaria num homem.

3) ÂNCORAS VISUAIS POR FAIXA (ajuste pelo que as fotos realmente mostram — são âncoras de calibração, não categorias rígidas):
HOMENS — essencial ~3-5%:
- 3-5%: só em pico de palco por poucos dias; veias muito proeminentes em quase todo o corpo, estrias/striations até em glúteo e lombar, rosto visivelmente magro.
- 6-9%: abdômen e serrátil muito definidos em qualquer luz, vascularidade visível em braço/abdômen mesmo em repouso, separação nítida entre grupos musculares.
- 10-14%: abdômen definido mas sem striations profundas, vascularidade só quando contrai, cintura ainda "quadrada" (sem gordura acumulada em flanco).
- 15-19%: contorno abdominal visível mas sem separação nítida, sem vascularidade em repouso, leve suavização em flanco/lombar.
- 20-24%: abdômen liso ou com marcação só sob contração forte, acúmulo já visível em flanco/lombar/parte inferior do peito.
- 25-29%: acúmulo claro em abdômen/flanco/lombar mesmo em repouso, sem separação muscular visível no tronco.
- 30%+: acúmulo distribuído, contorno de cintura mais largo que o tórax em várias vistas.
MULHERES — essencial ~10-13%: mesma lógica de progressão, mas leia a partir de quadril/coxa/tríceps, não do abdômen; some ~4-6 pontos percentuais à leitura que você faria "no olho masculino" do mesmo abdômen, porque a distribuição andróide/ginóide não é comparável 1:1.

4) TETO DE PLAUSIBILIDADE MUSCULAR (Kouri et al. 1995): atletas naturais (sem esteroides) nesse estudo tiveram FFMI (índice de massa magra ajustado por altura) com teto bem definido em ~25 — mesmo o campeão Mr. America da era pré-esteroide (1939-1959) teve FFMI médio 25,4. Se o volume muscular na foto parecer muito acima do que a altura/estrutura do usuário sustentaria naturalmente, considere que pode ser inchaço/retenção/bomba pós-treino/ângulo de câmera em vez de massa magra real — isso enviesa %BF e composição do ganho para "mais seco" do que realmente é.

5) PISO FISIOLÓGICO: não estime abaixo de ~4% (homem) ou ~10% (mulher) a menos que a foto mostre condição de palco inequívoca (striations generalizadas, veias em glúteo/lombar). A maioria dos usuários recreativos, mesmo "sarados", está entre 8-18% (homem) ou 18-26% (mulher).

6) DIVERGÊNCIA ENTRE ÂNGULOS: se um ângulo sugere uma faixa e outro sugere outra (comum quando pose/luz mascaram gordura de um lado), priorize o ângulo lateral (mais confiável pra profundidade abdominal e curvatura lombar) e explique a divergência em bfReasoning.`;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, Math.min(min, max)), Math.max(min, max));

const GAIN_COMPOSITION_LABEL: Record<GainComposition, string> = Object.fromEntries(
  E_SCENARIOS.map((s) => [s.key, s.label])
) as Record<GainComposition, string>;

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

  const {
    photos,
    sex,
    heightCm,
    age,
    activityLevel,
    exerciseFreq,
    sessionDuration,
    dailyStepsAvg,
    occupationActivity,
    commuteActivity,
    householdActivity,
    leisureActivity,
    stairsUse,
    currentWeightKg,
    date,
    weeksToNextConsult,
    currentIntakeKcal,
    weightTrend,
    lastCycleAdherence,
    lastCycleActualKcal,
  } = body;

  if (!photos || photos.length === 0 || !photos.some((p) => p.angle === "frente")) {
    return NextResponse.json({ error: "Envie pelo menos a foto de frente." }, { status: 400 });
  }
  if (!currentWeightKg || currentWeightKg <= 0 || !heightCm || heightCm <= 0 || !age || age <= 0) {
    return NextResponse.json({ error: "Peso, altura e idade são obrigatórios." }, { status: 400 });
  }

  const [{ data: cycleRows, error: cyclesError }, { data: prefsRow }, previousPhoto] = await Promise.all([
    supabase
      .from("cycles")
      .select("id,date,weight_kg,body_fat_percent,kcal,protein_g,fat_g,carb_g,is_prediction,actual_kcal")
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
        system: `Você estima %BF (percentual de gordura corporal) visualmente a partir de fotos de físico (frente, costas, laterais), cruzando os ângulos disponíveis. Responda só pela ferramenta fornecida, em português.

${VISUAL_BF_PROTOCOL}`,
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
      exerciseFreq,
      sessionDuration,
      dailyStepsAvg,
      occupationActivity,
      commuteActivity,
      householdActivity,
      leisureActivity,
      stairsUse,
    });

    // meio-termo entre a fórmula (Mifflin/Katch, erro documentado de ±10-15%, maior ainda em quem
    // tem NEAT baixo) e a prática real relatada — quando o usuário informa quanto vem comendo e como
    // o peso responde a isso, isso vale tanto quanto a fórmula, não só um comentário à parte
    let empiricalTdee: number | null = null;
    if (currentIntakeKcal && currentIntakeKcal > 0) {
      if (weightTrend === "estavel") {
        empiricalTdee = currentIntakeKcal; // método da estabilidade: manutenção = a própria ingestão
      } else if (weightTrend === "subindo") {
        empiricalTdee = currentIntakeKcal * 0.9; // comendo acima da manutenção
      } else if (weightTrend === "descendo") {
        empiricalTdee = currentIntakeKcal * 1.1; // comendo abaixo da manutenção
      }
    }
    // peso 30% fórmula / 70% prática real — a fórmula é só uma média populacional (erro documentado
    // de ±10-15%), a prática relatada pelo próprio usuário é dado direto, então pesa mais
    const blendedTdee = empiricalTdee != null ? comp.tdee * 0.3 + empiricalTdee * 0.7 : comp.tdee;
    const blendedTargetKcal = blendedTdee * (1 + comp.surplusPercent);
    const blendedTargetCarbG = Math.max(0, (blendedTargetKcal - comp.targetProteinG * 4 - comp.targetFatG * 9) / 4);

    let meals, dietWarnings;
    try {
      ({ meals, warnings: dietWarnings } = await generateDietMeals(client, {
        targetKcal: blendedTargetKcal,
        targetProteinG: comp.targetProteinG,
        targetFatG: comp.targetFatG,
        targetCarbG: blendedTargetCarbG,
        ...dietParamsBase,
      }));
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao montar a dieta." }, { status: 502 });
    }

    const point = (v: number) => ({ min: v, max: v });

    // sem histórico de CICLOS ainda — projeta a partir do superávit/déficit teórico vs. TDEE (já
    // ajustado pelo meio-termo acima), usando 7700kcal/kg como proxy de gordura (cutting) e uma
    // mistura mais barata em superávit (bulking)
    const oneMonthE = comp.path === "cutting" ? 7700 : comp.path === "bulking" ? 5250 : 7700;
    const oneMonthRateKgWeek = (blendedTdee * comp.surplusPercent * 7) / oneMonthE;
    const oneMonthMid = currentWeightKg + oneMonthRateKgWeek * 4;
    const oneMonthDelta = Math.abs(oneMonthRateKgWeek * 4) * 0.25;
    const oneMonthProjection = {
      weightRange: { min: oneMonthMid - oneMonthDelta, max: oneMonthMid + oneMonthDelta },
      note:
        comp.path === "normocalorico"
          ? "Meta é manutenção — peso deve ficar estável em 4 semanas, sem histórico ainda pra confirmar."
          : `Estimativa teórica (sem histórico ainda): mantendo esse padrão, projeção de peso em 4 semanas é ${(oneMonthMid - oneMonthDelta).toFixed(1)}–${(oneMonthMid + oneMonthDelta).toFixed(1)}kg. Vai ficar mais precisa a partir do 2º ciclo, com dados reais.`,
    };

    const tdeeNote =
      empiricalTdee != null
        ? `TDEE calculado com peso 30% fórmula (${comp.tdee.toFixed(0)}kcal) / 70% prática relatada (~${empiricalTdee.toFixed(0)}kcal, a partir de ${currentIntakeKcal}kcal com peso ${weightTrend}) — resultado: ${blendedTdee.toFixed(0)}kcal.`
        : `TDEE calculado só pela fórmula (${comp.tdee.toFixed(0)}kcal) — informe quanto você vem comendo e como o peso responde pra deixar essa conta mais realista.`;

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
      gainComposition: null,
      gainCompositionLabel: null,
      gainCompositionReasoning: null,
      recommendedKcal: blendedTargetKcal,
      recommendedProteinG: comp.targetProteinG,
      recommendedFatG: comp.targetFatG,
      recommendedCarbG: blendedTargetCarbG,
      note: `${comp.pathReason} ${tdeeNote}`,
      ranges: {
        kcal: point(blendedTargetKcal),
        protein: point(comp.targetProteinG),
        fat: point(comp.targetFatG),
        carb: point(blendedTargetCarbG),
        weight: point(currentWeightKg),
      },
      rateKgWeek: 0,
      meals,
      dietWarnings,
    });
  }

  // ---- ciclos seguintes ----
  const history = cycleRows.map((row) => rowToCycle(row as CycleRow));

  // se o usuário não seguiu de perto a prescrição do último ciclo, a ingestão real relatada substitui
  // a prescrita pro cálculo de TDEE — senão o retrocálculo assume uma adesão que pode não ter existido
  const lastCycle = history[history.length - 1];
  if (lastCycle && lastCycleAdherence && lastCycleAdherence !== "seguiu" && lastCycleAdherence !== "nao_acompanhou" && lastCycleActualKcal) {
    lastCycle.actualKcal = lastCycleActualKcal;
    await supabase.from("cycles").update({ actual_kcal: lastCycleActualKcal }).eq("id", lastCycle.id);
  }

  const historyText = history
    .map(
      (c) =>
        `- ${c.date}: ${c.weightKg}kg, %BF ${c.bodyFatPercent ?? "?"}, ${c.kcal}kcal prescrito${
          c.actualKcal != null ? ` (relatado como realmente comido: ${c.actualKcal}kcal)` : ""
        }, P ${c.proteinG}g, G ${c.fatG}g, C ${c.carbG}g${c.isPrediction ? " (previsão)" : ""}`
    )
    .join("\n");

  const visionContextText = `Histórico de ciclos:
${historyText}

Contexto do usuário: sexo ${sex}, altura ${heightCm}cm, peso atual informado ${currentWeightKg}kg em ${date}.

${evolutionInstruction}

Além do %BF, decida a composição do ganho/perda desde o último ciclo — isto é, o quanto da mudança de peso parece ser músculo vs. gordura, cruzando a foto atual com a anterior (se houver) e a variação de peso registrada:
- "musculo": ganho quase todo massa magra (físico mais definido/cheio sem acúmulo de gordura visível)
- "misto": mistura de músculo e gordura (padrão mais comum em bulk)
- "gordura": ganho majoritariamente gordura (perda de definição, sem separação muscular nova)
Isso decide o E (energia por kg) usado no cálculo de TDEE do algoritmo — não é cosmético, afeta o número final.`;

  const SYSTEM_PROMPT = `Você é um assistente que lê fotos de físico (frente, costas, laterais) para (1) estimar %BF visualmente, cruzando os ângulos disponíveis, (2) comentar a evolução muscular percebida desde a foto anterior, se houver, e (3) decidir a composição do ganho/perda recente (músculo/misto/gordura) a partir da comparação visual com a foto anterior. Você NÃO calcula kcal, proteína, gordura ou carboidrato — isso é feito por um algoritmo determinístico a partir do que você decidir aqui. Responda só pela ferramenta fornecida, em português, direto e específico.

${VISUAL_BF_PROTOCOL}

Para decidir gainComposition, aplique o mesmo teto de plausibilidade muscular do item 4 do protocolo: um ganho "musculo" puro e rápido é raro mesmo em treino natural bem executado — se a foto atual parece muito mais seca E muito mais volumosa que a anterior ao mesmo tempo, desconfie de inchaço/retenção/luz antes de cravar "musculo".`;

  let visionResponse;
  try {
    visionResponse = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 1000,
      output_config: { effort: "medium" },
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: VISION_TOOL_NAME,
          description: "Registra a leitura visual das fotos: %BF, evolução e composição do ganho/perda.",
          input_schema: {
            type: "object",
            properties: {
              bfPercentVisual: { type: "number", description: "Estimativa de %BF a partir das fotos, entre 3 e 60." },
              bfConfidence: { type: "string", enum: ["baixa", "media", "alta"] },
              bfReasoning: { type: "string", description: "1-2 frases explicando a leitura visual." },
              evolutionNote: { type: "string" },
              gainComposition: { type: "string", enum: ["musculo", "misto", "gordura"] },
              gainCompositionReasoning: { type: "string", description: "1-2 frases explicando a escolha, com base na comparação visual." },
            },
            required: ["bfPercentVisual", "bfConfidence", "bfReasoning", "evolutionNote", "gainComposition", "gainCompositionReasoning"],
          },
        },
      ],
      tool_choice: { type: "tool", name: VISION_TOOL_NAME },
      messages: [{ role: "user", content: [...buildImageBlocks(photos), ...evolutionBlocks, { type: "text", text: visionContextText }] }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const errBody = err.error as { error?: { message?: string } } | undefined;
      const message = errBody?.error?.message ?? err.message;
      return NextResponse.json({ error: `Erro na API da Anthropic: ${message}` }, { status: err.status ?? 502 });
    }
    return NextResponse.json({ error: "Erro inesperado ao chamar a análise por imagem." }, { status: 502 });
  }

  const visionBlock = visionResponse.content.find((b) => b.type === "tool_use" && b.name === VISION_TOOL_NAME);
  if (!visionBlock || visionBlock.type !== "tool_use") {
    return NextResponse.json({ error: "O modelo não retornou uma análise visual válida." }, { status: 422 });
  }

  const vision = visionBlock.input as {
    bfPercentVisual: number;
    bfConfidence: "baixa" | "media" | "alta";
    bfReasoning: string;
    evolutionNote: string;
    gainComposition: GainComposition;
    gainCompositionReasoning: string;
  };

  const bfPercentVisual = clamp(vision.bfPercentVisual, 3, 60);
  const gainComposition: GainComposition = ["musculo", "misto", "gordura"].includes(vision.gainComposition)
    ? vision.gainComposition
    : "misto";

  // daqui pra baixo é tudo determinístico — o Claude só decidiu %BF e composição do ganho acima.
  // stabilityMode e applyProteinStep não são mais escolhas manuais — o algoritmo roda no modo padrão
  // (taxa observada + E da composição decidida), sem ajustes subjetivos do usuário por cima.
  const result = predictNextCycle({
    history,
    currentWeightKg,
    currentDate: date,
    weeksToNextConsult,
    gainComposition,
    stabilityMode: false,
    applyProteinStep: false,
  });
  if (!result) {
    return NextResponse.json({ error: "Não foi possível calcular a previsão a partir do histórico." }, { status: 400 });
  }

  // estratégia decidida pelo %BF atual (mesmo critério do primeiro ciclo). O kcal vem do TDEE real do
  // algoritmo (calculado a partir da resposta observada do próprio usuário, usando o E da composição
  // decidida acima) + o superávit/déficit da estratégia — não da extrapolação pura da tendência histórica,
  // que só continuaria a direção que o histórico já vinha seguindo e não "desligaria" sozinha.
  const { path: strategy, pathReason: strategyReason, surplusPercent: strategySurplusPercent } = classifyPathFromBf(bfPercentVisual, sex);

  const kcalStrategyRange = {
    min: result.tdeeRange.min * (1 + strategySurplusPercent),
    max: result.tdeeRange.max * (1 + strategySurplusPercent),
  };
  const recommendedKcal = (kcalStrategyRange.min + kcalStrategyRange.max) / 2;
  const recommendedProteinG = (result.proteinRange.min + result.proteinRange.max) / 2;
  const recommendedFatG = (result.fatRange.min + result.fatRange.max) / 2;

  // carboidrato é resíduo de kcal - proteína - gordura, a partir do novo kcal (não do kcalRange antigo
  // baseado em extrapolação), senão fica inconsistente com o kcal recomendado de fato
  const carbStrategyRange = {
    min: Math.max(0, (kcalStrategyRange.min - result.proteinRange.max * 4 - result.fatRange.max * 9) / 4),
    max: Math.max(0, (kcalStrategyRange.max - result.proteinRange.min * 4 - result.fatRange.min * 9) / 4),
  };
  const recommendedCarbG = (carbStrategyRange.min + carbStrategyRange.max) / 2;

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

  // projeção fixa de 4 semanas a partir do kcal REALMENTE recomendado (já ajustado pela estratégia),
  // não da taxa histórica bruta — senão a projeção contradiz a estratégia decidida (ex: mostrar ganho
  // de peso com a etiqueta "cutting" só porque o histórico vinha subindo antes do ajuste)
  const tdeeMid = (result.tdeeRange.min + result.tdeeRange.max) / 2;
  const projectedSurplusPercent = tdeeMid > 0 ? recommendedKcal / tdeeMid - 1 : 0;
  const oneMonthE = strategy === "cutting" ? 7700 : strategy === "bulking" ? 5250 : 7700;
  const projectedRateKgWeek = (tdeeMid * projectedSurplusPercent * 7) / oneMonthE;
  const oneMonthMid = currentWeightKg + projectedRateKgWeek * 4;
  const oneMonthDelta = Math.abs(projectedRateKgWeek * 4) * 0.2;
  const oneMonthProjection = {
    weightRange: { min: oneMonthMid - oneMonthDelta, max: oneMonthMid + oneMonthDelta },
    note: `Com o kcal recomendado (${recommendedKcal.toFixed(0)}kcal, ${PATH_LABEL[strategy]}) frente à manutenção estimada (~${tdeeMid.toFixed(0)}kcal), projeção de peso em 4 semanas: ${(oneMonthMid - oneMonthDelta).toFixed(1)}–${(oneMonthMid + oneMonthDelta).toFixed(1)}kg.`,
  };

  return NextResponse.json({
    isFirstCycle: false,
    oneMonthProjection,
    strategy,
    strategyLabel: PATH_LABEL[strategy],
    strategyReason,
    gainComposition,
    gainCompositionLabel: GAIN_COMPOSITION_LABEL[gainComposition],
    gainCompositionReasoning: vision.gainCompositionReasoning,
    bfPercentVisual,
    bfConfidence: vision.bfConfidence,
    bfReasoning: vision.bfReasoning,
    evolutionNote: vision.evolutionNote || null,
    recommendedKcal,
    recommendedProteinG,
    recommendedFatG,
    recommendedCarbG,
    note: `${strategyReason} ${vision.gainCompositionReasoning}`,
    ranges: {
      kcal: kcalStrategyRange,
      protein: result.proteinRange,
      fat: result.fatRange,
      carb: carbStrategyRange,
      weight: result.projectedWeightRange,
    },
    rateKgWeek: result.rateKgWeek,
    meals,
    dietWarnings,
  });
}
