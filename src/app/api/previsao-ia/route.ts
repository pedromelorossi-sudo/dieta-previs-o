import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { predictNextCycle, E_SCENARIOS, daysBetween } from "@/lib/dietEngine";
import {
  estimateBodyComposition,
  classifyPathFromBf,
  scoreRecoverySignals,
  macroTargetsForStrategy,
  PATH_LABEL,
  DietPath,
} from "@/lib/bodyComposition";
import { applySafetyLimits } from "@/lib/safety";
import { generateDietMeals } from "@/lib/dietGenerator";
import { planejarFases } from "@/lib/planoDeFases";
import { MuscleGroup, MUSCLE_GROUP_LABEL, exerciseById } from "@/lib/exerciseLibrary";
import { LoggedSet, weeklyVolumeByMuscle, readVolumeStatus, VolumeStatus } from "@/lib/trainingVolume";
import { TrainingLog, LoggedSetEntry } from "@/lib/trainingBuilder";
import { computeMuscleTargets, buildSplit, planTrainingPeriodization, scoreTrainingAdherence } from "@/lib/trainingSplitBuilder";
import { suggestLoadProgression } from "@/lib/trainingPeriodization";
import { assessDietCleanliness, assessTrainingCleanliness, checkBfConsistency, computeTdeeCalibration, CalibrationAuditRow } from "@/lib/calibration";
import { prescribeCardio } from "@/lib/cardioPrescription";
import { Cycle, GainComposition } from "@/lib/types";
import {
  ActivityLevel,
  Restriction,
  ExerciseFreq,
  SessionDuration,
  OtherSportActivity,
  TalkTestIntensity,
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
type StrengthTrend = "subiu" | "manteve" | "caiu";
type KeptExercisesAndLoads = "seguiu_de_perto" | "trocou_mas_manteve_volume" | "reduziu_bastante";

interface RequestBody {
  photos: PhotoInput[];
  sex: "masculino" | "feminino";
  heightCm: number;
  age: number;
  activityLevel: ActivityLevel;
  exerciseFreq?: ExerciseFreq;
  sessionDuration?: SessionDuration;
  dailyStepsAvg?: number;
  sittingHoursPerDay?: number;
  standingWorkHoursPerDay?: number;
  activeCommuteMinutesPerDay?: number;
  choresHoursPerWeek?: number;
  stairFlightsPerDay?: number;
  otherSportActivity?: OtherSportActivity;
  otherSportSessionsPerWeek?: number;
  otherSportMinutesPerSession?: number;
  otherSportTalkTest?: TalkTestIntensity;
  currentWeightKg: number;
  date: string;
  weeksToNextConsult: number;
  currentIntakeKcal?: number;
  weightTrend?: WeightTrend;
  lastCycleAdherence?: Adherence;
  lastCycleActualKcal?: number;
  /** sinais de recuperação do ciclo que terminou — usados pra suavizar/zerar o déficit do próximo ciclo
   * se o anterior foi agressivo demais (ver scoreRecoverySignals em bodyComposition.ts) */
  lastCycleStrengthTrend?: StrengthTrend;
  lastCycleMissedSessionsFatigue?: number;
  lastCycleSleepHoursAvg?: number;
  lastCycleSleepDisturbance?: boolean;
  lastCycleDaytimeFatigue?: boolean;
  /** adesão ao treino do ciclo anterior — sessões previstas vêm calculadas (dias/semana × semanas
   * decorridas), não perguntadas; usado pra travar o teto de volume do próximo mesociclo em MAV em vez
   * de MRV quando a execução real ficou abaixo do planejado (ver scoreTrainingAdherence) */
  lastCycleCompletedSessions?: number;
  lastCycleKeptExercisesAndLoads?: KeptExercisesAndLoads;
  /** adesão detalhada, pra decidir se um ciclo é "limpo" o suficiente pra calibrar a fórmula de TDEE
   * (ver src/lib/calibration.ts) — nenhum campo é autoavaliação, todos são fatos contáveis */
  lastCycleDaysFollowedPerWeek?: number;
  lastCycleTrackingMethod?: "pesei_a_maioria" | "estimei_de_olho";
  lastCycleWeighInConsistent?: boolean;
  lastCycleAlcoholDosesPerWeek?: number;
  lastCycleEffortNearFailure?: "sim" | "nao";
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
  priority_muscles: MuscleGroup[] | null;
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

// AVISO IMPORTANTE: ao contrário do protocolo de %BF acima (que se apoia em Majmudar et al. 2022, um
// estudo de validação real), NÃO existe literatura revisada por pares validando "ler desenvolvimento
// muscular por grupo a partir de foto 2D" — isso é critério de julgamento de fisiculturismo (padrão
// IFBB/NPC), não ciência publicada. Trate esta leitura com o mesmo tom de "estimativa com incerteza, não
// medição clínica" — nunca apresente como mais certa do que é, e use confidence "baixa" sempre que o
// ângulo disponível não mostrar bem o grupo.
const VISUAL_MUSCLE_PROTOCOL = `PROTOCOLO DE LEITURA VISUAL POR GRUPO MUSCULAR (julgamento visual, sem validação científica direta — trate como estimativa, não medição):

1) SÓ AVALIE O QUE O ÂNGULO REALMENTE MOSTRA. Frente mostra bem peito/ombro/bíceps/abdômen/quadríceps; costas mostra bem costas/trapézio/posterior de ombro/glúteo/posterior de coxa; laterais mostram bem deltoide lateral/tríceps/oblíquos/panturrilha. Se um grupo não aparece claramente em nenhum ângulo enviado (ex: só frente, sem panturrilha visível), não invente uma leitura — omita esse grupo do array ou marque confidence "baixa" com developmentNote dizendo que o ângulo não mostra o suficiente.

2) DESENVOLVIMENTO RELATIVO, NÃO ABSOLUTO. O que importa aqui é o equilíbrio ENTRE os grupos da mesma pessoa (esse grupo está proporcional aos outros, atrás, ou é um destaque?), não comparar com um padrão externo de fisiculturista. Sinais objetivos de grupo "atrás" dos outros: menos separação/volume aparente comparado a grupos vizinhos de tamanho similar, assimetria visível entre lado esquerdo/direito, contorno menos preenchido mesmo contraído.

3) NÃO CONFUNDA %BF BAIXO COM DESENVOLVIMENTO ALTO. Um grupo pode aparecer "definido" só por estar com pouca gordura em cima (efeito do %BF geral da pessoa), não porque tem mais massa. Julgue volume/plenitude do músculo, não só a presença de separação/vascularização — essa distinção já é usada no protocolo de %BF acima pra não confundir leanness com muscularidade.

4) SIMETRIA: compare o mesmo grupo dos dois lados quando o ângulo permite (frente e costas mostram isso bem; lateral não, já que só um lado aparece). Assimetria pequena é normal (dominância de lado); registre em symmetryNote só quando for visualmente perceptível, não force uma diferença que não dá pra ver direito na foto.

5) CONFIANÇA: "alta" só quando o grupo aparece claramente em pelo menos um ângulo, sem sobra de roupa/sombra/pose cobrindo; "media" quando dá pra estimar mas com ressalvas (ângulo parcial, iluminação ruim); "baixa" quando é mais palpite que leitura — nesses casos ainda registre developmentNote explicando a limitação, não pule o campo.`;

// O `clamp` genérico que existia aqui foi removido junto com seus dois usos: `Math.max(NaN, 3)` é NaN,
// então ele deixava NaN passar inteiro, e uma leitura de %BF inválida virava `classifyPathFromBf(NaN)`
// -> "normocalórico" com superávit 0 — uma prescrição de aparência normal a partir de lixo, com HTTP 200.

/** O %BF é o único número que a IA de visão decide e que atravessa TODO o resto do cálculo
 * (estratégia, macros, projeção de 6 meses). Se ele não vier como número finito, a requisição falha
 * explicitamente em vez de produzir uma prescrição plausível a partir de nada. */
function assertFiniteBf(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(60, Math.max(3, n)) : null;
}

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
    sittingHoursPerDay,
    standingWorkHoursPerDay,
    activeCommuteMinutesPerDay,
    choresHoursPerWeek,
    stairFlightsPerDay,
    otherSportActivity,
    otherSportSessionsPerWeek,
    otherSportMinutesPerSession,
    otherSportTalkTest,
    currentWeightKg,
    date,
    weeksToNextConsult,
    currentIntakeKcal,
    weightTrend,
    lastCycleAdherence,
    lastCycleActualKcal,
    lastCycleStrengthTrend,
    lastCycleMissedSessionsFatigue,
    lastCycleSleepHoursAvg,
    lastCycleSleepDisturbance,
    lastCycleDaytimeFatigue,
    lastCycleCompletedSessions,
    lastCycleKeptExercisesAndLoads,
    lastCycleDaysFollowedPerWeek,
    lastCycleTrackingMethod,
    lastCycleWeighInConsistent,
    lastCycleAlcoholDosesPerWeek,
    lastCycleEffortNearFailure,
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
      .select("meals_per_day,cooking_time,restrictions,disliked_food_ids,favorite_food_ids,notes,priority_muscles")
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
        // prompt totalmente estático (o protocolo é uma constante) — cacheado entre requisições
        system: [
          {
            type: "text",
            text: `Você estima %BF (percentual de gordura corporal) visualmente a partir de fotos de físico (frente, costas, laterais), cruzando os ângulos disponíveis. Responda só pela ferramenta fornecida, em português.

${VISUAL_BF_PROTOCOL}`,
            cache_control: { type: "ephemeral" },
          },
        ],
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

    const bfPercentFirstCycle = assertFiniteBf(bfRaw.bfPercentVisual);
    if (bfPercentFirstCycle == null) {
      return NextResponse.json(
        { error: "A leitura de %BF voltou inválida do modelo. Tente de novo — se persistir, use fotos mais nítidas ou outro ângulo." },
        { status: 422 }
      );
    }

    const comp = estimateBodyComposition({
      weightKg: currentWeightKg,
      heightCm,
      bodyFatPercent: bfPercentFirstCycle,
      age,
      sex,
      activityLevel,
      exerciseFreq,
      sessionDuration,
      dailyStepsAvg,
      sittingHoursPerDay,
      standingWorkHoursPerDay,
      activeCommuteMinutesPerDay,
      choresHoursPerWeek,
      stairFlightsPerDay,
      otherSportActivity,
      otherSportSessionsPerWeek,
      otherSportMinutesPerSession,
      otherSportTalkTest,
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
    const FIRST_CYCLE_DAYS_PER_WEEK_BY_FREQ: Record<string, number> = { "0": 0, "1-2": 2, "3-4": 3, "5+": 5 };
    const firstCycleDaysPerWeek = exerciseFreq ? FIRST_CYCLE_DAYS_PER_WEEK_BY_FREQ[exerciseFreq] : 0;

    // O primeiro ciclo não devolvia programa de treino NENHUM — a pessoa recebia dieta, cardio e
    // projeção de 6 meses, e zero séries. Não havia razão pra isso: a divisão não depende de histórico,
    // só dos dias/semana disponíveis (leitura visual por grupo e adesão apenas REFINAM a meta).
    const firstCycleMuscleTargets =
      firstCycleDaysPerWeek > 0 ? computeMuscleTargets([], prefs?.priority_muscles ?? [], 0, firstCycleDaysPerWeek, 0) : null;
    const firstCycleProgram = firstCycleMuscleTargets ? buildSplit(firstCycleDaysPerWeek, firstCycleMuscleTargets) : null;
    const firstCyclePeriodization = firstCycleMuscleTargets
      ? planTrainingPeriodization(firstCycleMuscleTargets, firstCycleDaysPerWeek, 5)
      : null;

    const cardioPrescription = prescribeCardio({
      strategy: comp.path,
      strengthDaysPerWeek: firstCycleDaysPerWeek,
      weightKg: currentWeightKg,
    });

    // O gasto do cardio prescrito NÃO é somado ao TDEE, de propósito. A tentação é somar — o app manda
    // ~150min/semana de aeróbico e não contabilizava um minuto disso. Mas somar significa prescrever
    // comida contra um esforço que ainda não aconteceu, exatamente o erro que a própria calibration.ts
    // cita Lichtman et al. 1992 para evitar (o autorrelato superestima exercício em 51±75%). Se a pessoa
    // não fizer o cardio, o app teria inflado o TDEE e apagado o déficit sem ninguém perceber.
    //
    // O gasto estimado vai na resposta (`cardioKcalPerDay`) pra ficar visível, e a partir do 2º ciclo o
    // TDEE empírico absorve sozinho o cardio que foi REALMENTE feito — medido pela resposta do peso, não
    // presumido pela prescrição.
    const blendedTdee = empiricalTdee != null ? comp.tdee * 0.3 + empiricalTdee * 0.7 : comp.tdee;

    const firstCycleSafety = applySafetyLimits({
      proposedKcal: blendedTdee * (1 + comp.surplusPercent),
      proposedProteinG: comp.targetProteinG,
      proposedFatG: comp.targetFatG,
      weightKg: currentWeightKg,
      sex,
      strategy: comp.path,
      tdee: blendedTdee,
      bmr: comp.bmr,
    });
    const blendedTargetKcal = firstCycleSafety.kcal;
    const blendedTargetCarbG = firstCycleSafety.carbG;

    let meals, dietWarnings;
    try {
      ({ meals, warnings: dietWarnings } = await generateDietMeals(client, {
        targetKcal: blendedTargetKcal,
        targetProteinG: firstCycleSafety.proteinG,
        targetFatG: firstCycleSafety.fatG,
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

    // O planejamento de fases roda JÁ no primeiro ciclo — é o principal produto da primeira análise:
    // a pessoa manda as fotos e recebe o roteiro de onde vai chegar e o que dispara cada mudança, não
    // só a dieta do mês. 24 meses porque um ciclo completo (ganho + retorno) leva ~8 meses, então esse
    // horizonte mostra o padrão se repetindo em vez de um pedaço solto dele.
    const planoDeFases = planejarFases({
      currentWeightKg,
      currentBfPercent: bfPercentFirstCycle,
      heightCm,
      sex,
      tdee: blendedTdee,
      monthsAhead: 24,
    });



    return NextResponse.json({
      isFirstCycle: true,
      oneMonthProjection,
      monthlyPlan: planoDeFases.meses,
      planoDeFases,
      cardioPrescription,
      activityLevelDisplay: comp.activityLevelDisplay,
      bfPercentVisual: bfPercentFirstCycle,
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
      recommendedProteinG: firstCycleSafety.proteinG,
      recommendedFatG: firstCycleSafety.fatG,
      recommendedCarbG: blendedTargetCarbG,
      note: `${comp.pathReason} ${tdeeNote}`,
      ranges: {
        kcal: point(blendedTargetKcal),
        protein: point(firstCycleSafety.proteinG),
        fat: point(firstCycleSafety.fatG),
        carb: point(blendedTargetCarbG),
        weight: point(currentWeightKg),
      },
      rateKgWeek: 0,
      safetyWarnings: firstCycleSafety.warnings,
      cardioKcalPerDay: cardioPrescription.estimatedKcalPerDay,
      muscleTargets: firstCycleMuscleTargets ?? [],
      suggestedTrainingProgram: firstCycleProgram,
      trainingPeriodizationPlan: firstCyclePeriodization,
      meals,
      dietWarnings,
    });
  }

  // ---- ciclos seguintes ----
  const history = cycleRows.map((row) => rowToCycle(row as CycleRow));

  // se o usuário não seguiu de perto a prescrição do último ciclo, a ingestão real relatada substitui
  // a prescrita pro cálculo de TDEE — senão o retrocálculo assume uma adesão que pode não ter existido
  const lastCycle = history[history.length - 1];
  // A ingestão real relatada vale SEMPRE que for informada, inclusive quando a resposta é "segui de
  // perto". Antes o app só a usava quando o usuário admitia não ter seguido — ou seja, confiava no
  // rótulo "segui" para presumir adesão 1:1 e retrocalcular o TDEE em cima da prescrição. Isso é
  // exatamente o autorrelato que a própria calibration.ts cita Lichtman et al. 1992 para desqualificar
  // (a ingestão relatada é subestimada em 47±16%): quem come 10% a mais e responde "segui" produzia um
  // TDEE ~9% menor, repassado direto pra prescrição seguinte. Um número informado vale mais que um
  // rótulo, sempre.
  if (lastCycle && lastCycleActualKcal && lastCycleActualKcal > 0 && lastCycleAdherence !== "nao_acompanhou") {
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

  const SYSTEM_PROMPT = `Você é um assistente que lê fotos de físico (frente, costas, laterais) para (1) estimar %BF visualmente, cruzando os ângulos disponíveis, (2) comentar a evolução muscular percebida desde a foto anterior, se houver, (3) decidir a composição do ganho/perda recente (músculo/misto/gordura) a partir da comparação visual com a foto anterior, e (4) avaliar o desenvolvimento e simetria por grupo muscular nos ângulos disponíveis. Você NÃO calcula kcal, proteína, gordura ou carboidrato — isso é feito por um algoritmo determinístico a partir do que você decidir aqui. Responda só pela ferramenta fornecida, em português, direto e específico.

${VISUAL_BF_PROTOCOL}

Para decidir gainComposition, aplique o mesmo teto de plausibilidade muscular do item 4 do protocolo: um ganho "musculo" puro e rápido é raro mesmo em treino natural bem executado — se a foto atual parece muito mais seca E muito mais volumosa que a anterior ao mesmo tempo, desconfie de inchaço/retenção/luz antes de cravar "musculo".

${VISUAL_MUSCLE_PROTOCOL}`;

  let visionResponse;
  try {
    visionResponse = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2500,
      output_config: { effort: "medium" },
      // SYSTEM_PROMPT só interpola constantes (VISUAL_BF_PROTOCOL, VISUAL_MUSCLE_PROTOCOL), então é
      // byte a byte idêntico entre requisições — prefixo estável, cacheável
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
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
              muscleGroupAssessment: {
                type: "array",
                description:
                  "Um item por grupo muscular visível nos ângulos enviados — não force os 12 grupos se a foto não mostra bem algum deles, mas com frente+costas+laterais a maioria dos grupos grandes (peito, costas, ombro, quadríceps, abdômen, braços) costuma dar pra avaliar com confidence pelo menos 'media'. Não deixe esse array vazio quando há fotos suficientes — use confidence 'baixa' em vez de omitir o grupo se a leitura for incerta, mas incerta ainda é uma leitura.",
                items: {
                  type: "object",
                  properties: {
                    muscle: { type: "string", enum: Object.keys(MUSCLE_GROUP_LABEL) },
                    relativeDevelopment: {
                      type: "string",
                      enum: ["atras_dos_outros", "proporcional", "destaque"],
                      description: "Comparado aos outros grupos da MESMA pessoa, não a um padrão externo.",
                    },
                    developmentNote: { type: "string", description: "1 frase justificando a leitura, ou a limitação do ângulo se confidence for baixa." },
                    symmetryNote: { type: "string", description: "Assimetria entre os dois lados, quando o ângulo permite ver; string vazia se não avaliável." },
                    confidence: { type: "string", enum: ["baixa", "media", "alta"] },
                  },
                  required: ["muscle", "relativeDevelopment", "developmentNote", "symmetryNote", "confidence"],
                },
              },
            },
            required: [
              "bfPercentVisual",
              "bfConfidence",
              "bfReasoning",
              "evolutionNote",
              "gainComposition",
              "gainCompositionReasoning",
              "muscleGroupAssessment",
            ],
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
    muscleGroupAssessment?: {
      muscle: MuscleGroup;
      relativeDevelopment: "atras_dos_outros" | "proporcional" | "destaque";
      developmentNote: string;
      symmetryNote: string;
      confidence: "baixa" | "media" | "alta";
    }[];
  };

  // cruza a leitura visual por grupo com o volume de treino realmente logado (melhor esforço — sem
  // tabela de treino migrada ainda, ou sem log recente, isso fica vazio e não quebra a previsão de dieta,
  // que é o fluxo principal). Grupo com volume adequado mas leitura visual "atrás dos outros" é sinal de
  // resposta individual mais lenta nesse grupo (considerar subir o MAV específico dele), a menos que o
  // grupo tenha nota de lesão recente — aí é fase de reentrada, não estagnação real.
  let muscleCrossCheck: {
    muscle: MuscleGroup;
    muscleLabel: string;
    relativeDevelopment: string;
    weeklySets: number | null;
    volumeStatus: VolumeStatus | null;
    flag: "resposta_lenta" | "reentrada_lesao" | "sem_dado_volume";
    note: string;
  }[] = [];

  // Logs de treino das últimas ~8 semanas — usados em DOIS lugares: o cruzamento da leitura visual com
  // o volume real (abaixo) e a sugestão de progressão de carga (mais adiante). Antes essa consulta
  // ficava dentro do bloco condicional do cruzamento, então sem leitura visual por grupo o app nem
  // olhava o histórico de treino.
  const trainingLogsSince = new Date();
  trainingLogsSince.setDate(trainingLogsSince.getDate() - 56);
  const { data: trainingLogRows } = await supabase
    .from("training_logs")
    .select("id,date,session_label,sets_logged,injury_note")
    .eq("user_id", user.id)
    .gte("date", trainingLogsSince.toISOString().slice(0, 10));

  const trainingLogs: TrainingLog[] = (trainingLogRows ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    sessionLabel: (r.session_label as string) ?? "",
    setsLogged: (r.sets_logged as LoggedSetEntry[]) ?? [],
    injuryNote: (r.injury_note as string) ?? null,
  }));

  if (vision.muscleGroupAssessment && vision.muscleGroupAssessment.length > 0) {
    try {
      if (trainingLogRows && trainingLogRows.length > 0) {
        const allSets = trainingLogRows.flatMap((r) => (r.sets_logged as LoggedSet[]) ?? []);
        const volume = weeklyVolumeByMuscle(allSets, (id) => exerciseById(id)?.primaryMuscle);
        const readings = readVolumeStatus(volume);
        const readingByMuscle = new Map(readings.map((r) => [r.muscle, r]));

        // heurística simples de texto — injury_note é campo livre, não estruturado por grupo; procura o
        // nome do grupo (em português) mencionado em alguma nota das últimas 4 semanas
        const recentInjuryNotes = trainingLogRows
          .filter((r) => {
            const days = (Date.now() - new Date(r.date).getTime()) / (1000 * 60 * 60 * 24);
            return days <= 28 && r.injury_note;
          })
          .map((r) => (r.injury_note as string).toLowerCase());

        muscleCrossCheck = vision.muscleGroupAssessment
          .filter((a) => a.confidence !== "baixa" && a.relativeDevelopment === "atras_dos_outros")
          .map((a) => {
            const reading = readingByMuscle.get(a.muscle);
            const muscleLabel = MUSCLE_GROUP_LABEL[a.muscle];
            const recentInjury = recentInjuryNotes.some((n) => n.includes(muscleLabel.toLowerCase()));

            if (recentInjury) {
              return {
                muscle: a.muscle,
                muscleLabel,
                relativeDevelopment: a.relativeDevelopment,
                weeklySets: reading?.effectiveSets ?? null,
                volumeStatus: reading?.status ?? null,
                flag: "reentrada_lesao" as const,
                note: `${muscleLabel} teve nota de lesão/dor recente — a leitura visual mais atrás dos outros grupos provavelmente é fase de reentrada, não sinal de precisar mais volume.`,
              };
            }
            if (!reading) {
              return {
                muscle: a.muscle,
                muscleLabel,
                relativeDevelopment: a.relativeDevelopment,
                weeklySets: null,
                volumeStatus: null,
                flag: "sem_dado_volume" as const,
                note: `${muscleLabel} apareceu atrás dos outros na leitura visual, mas não há log de treino desse grupo nas últimas 8 semanas pra cruzar — sem dado suficiente pra saber se é volume baixo ou resposta individual mais lenta.`,
              };
            }
            if (reading.status !== "abaixo_mev") {
              return {
                muscle: a.muscle,
                muscleLabel,
                relativeDevelopment: a.relativeDevelopment,
                weeklySets: reading.effectiveSets,
                volumeStatus: reading.status,
                flag: "resposta_lenta" as const,
                note: `${muscleLabel} está com volume adequado (${reading.effectiveSets} séries/semana) mas apareceu atrás dos outros grupos na leitura visual — sinal de resposta individual mais lenta nesse grupo, considerar subir o MAV específico dele em vez de manter o volume padrão.`,
              };
            }
            return {
              muscle: a.muscle,
              muscleLabel,
              relativeDevelopment: a.relativeDevelopment,
              weeklySets: reading.effectiveSets,
              volumeStatus: reading.status,
              flag: "sem_dado_volume" as const,
              note: `${muscleLabel} apareceu atrás dos outros e o volume logado (${reading.effectiveSets} séries/semana) já está abaixo do mínimo — o volume baixo já explica o atraso, não é preciso um ajuste especial além de subir o volume desse grupo.`,
            };
          });
      }
    } catch {
      // tabela de treino ainda não migrada, ou qualquer outro erro nessa etapa opcional — não deixa a
      // previsão de dieta (fluxo principal) quebrar por causa de uma leitura cruzada acessória
    }
  }

  // divisão de treino + periodização de volume automáticas — geradas a partir da leitura visual por
  // grupo (muscleGroupAssessment) quando disponível, sempre considerando prioridades declaradas nas
  // preferências (ex: "consultoria pediu foco em costas e braço"), que valem mais que a leitura da foto.
  // Não depende da foto ter dado uma leitura de grupo — sem ela, cai no MAV padrão + prioridades.
  const DAYS_PER_WEEK_BY_FREQ: Record<string, number> = { "0": 0, "1-2": 2, "3-4": 3, "5+": 5 };
  const daysPerWeek = exerciseFreq ? DAYS_PER_WEEK_BY_FREQ[exerciseFreq] : 0;
  let suggestedTrainingProgram: ReturnType<typeof buildSplit> | null = null;
  let trainingPeriodizationPlan: ReturnType<typeof planTrainingPeriodization> | null = null;
  let muscleTargetsOut: ReturnType<typeof computeMuscleTargets> | null = null;
  // sessões previstas = dias/semana atuais × semanas decorridas desde o último ciclo — calculado, não
  // perguntado; o usuário só informa quantas completou de verdade
  const weeksSinceLastCycle = lastCycle ? daysBetween(lastCycle.date, date) / 7 : 0;
  const plannedSessions = Math.round(daysPerWeek * weeksSinceLastCycle);
  const gainCompositionEarly: GainComposition = ["musculo", "misto", "gordura"].includes(vision.gainComposition)
    ? vision.gainComposition
    : "misto";

  const baseRecoveryScore = scoreRecoverySignals({
    strengthTrend: lastCycleStrengthTrend,
    missedSessionsFatigue: lastCycleMissedSessionsFatigue,
    sleepHoursAvgLastCycle: lastCycleSleepHoursAvg,
    sleepDisturbanceLastCycle: lastCycleSleepDisturbance,
    daytimeFatigueLastCycle: lastCycleDaytimeFatigue,
  });

  // Perder peso perdendo MASSA MAGRA é um sinal de alarme, e antes ele fazia o oposto do esperado: a
  // composição "músculo" num ciclo de perda derrubava o TDEE empírico (E=1800 em vez de 7700, ver
  // E_SCENARIOS), e um TDEE menor gera uma prescrição MENOR — o app cortava mais comida justamente de
  // quem estava perdendo músculo. O retrocálculo em si está fisiologicamente certo (1kg de tecido magro
  // custa ~1800kcal); o que faltava era a RESPOSTA. Agora esse cenário entra como sinal de recuperação
  // ruim, do mesmo jeito que carga caindo na barra, e suaviza o déficit em vez de aprofundá-lo
  // (ver scoreRecoverySignals e Garthe et al. 2011: no ritmo agressivo a massa magra estagnou).
  const losingLeanMass = lastCycle != null && currentWeightKg - lastCycle.weightKg < -0.3 && gainCompositionEarly === "musculo";
  const recoveryScore = baseRecoveryScore + (losingLeanMass ? 2 : 0);

  const trainingAdherenceScore = scoreTrainingAdherence({
    completedSessions: lastCycleCompletedSessions,
    plannedSessions,
    keptExercisesAndLoads: lastCycleKeptExercisesAndLoads,
  });
  if (daysPerWeek > 0) {
    // carga sugerida a partir do que foi realmente logado — antes todo bloco saía com loadKg: null e a
    // única progressão do app era de volume
    const loadByExercise = new Map<string, number>();
    for (const [exerciseId, suggestion] of suggestLoadProgression(trainingLogs)) {
      loadByExercise.set(exerciseId, suggestion.suggestedLoadKg);
    }

    muscleTargetsOut = computeMuscleTargets(
      vision.muscleGroupAssessment ?? [],
      prefs?.priority_muscles ?? [],
      trainingAdherenceScore,
      daysPerWeek,
      recoveryScore
    );
    suggestedTrainingProgram = buildSplit(daysPerWeek, muscleTargetsOut, loadByExercise);
    // 5 semanas = um mesociclo completo. Antes eram 10, e as semanas 6-10 saíam byte a byte idênticas
    // às 1-5, inflando a resposta em ~20KB por requisição sem nenhuma informação nova.
    trainingPeriodizationPlan = planTrainingPeriodization(muscleTargetsOut, daysPerWeek, 5, loadByExercise);
  }

  const bfPercentVisualRaw = assertFiniteBf(vision.bfPercentVisual);
  if (bfPercentVisualRaw == null) {
    return NextResponse.json(
      { error: "A leitura de %BF voltou inválida do modelo. Tente de novo — se persistir, use fotos mais nítidas ou outro ângulo." },
      { status: 422 }
    );
  }
  const bfPercentVisual = bfPercentVisualRaw;
  const gainComposition: GainComposition = gainCompositionEarly;

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

  // sinais objetivos de que o déficit do ciclo anterior foi agressivo demais (carga caindo na academia,
  // treinos pulados por cansaço, sono ruim) — não é o usuário se autoavaliando, são fatos observáveis
  // (Garthe et al. 2011; Mountjoy et al. 2023 REDs; Kenttä & Hassmén 1998 — ver scoreRecoverySignals)

  // Calibração contínua: fórmula vs. realidade, só aprendendo com ciclos "limpos" (adesão real, não
  // autorrelato duvidoso) — ver src/lib/calibration.ts. Nunca deixa uma divergência virar "a fórmula
  // está errada" sem primeiro descartar que a causa é adesão (Lichtman et al. 1992: gente que jurava
  // "resistência a dieta" tinha gasto normal, o problema era subestimar o que comeu).
  const { clean: dietClean, reasons: dietDirtyReasons } = assessDietCleanliness({
    adherence: lastCycleAdherence,
    daysFollowedPerWeek: lastCycleDaysFollowedPerWeek,
    trackingMethod: lastCycleTrackingMethod,
    weighInConsistent: lastCycleWeighInConsistent,
    alcoholDosesPerWeek: lastCycleAlcoholDosesPerWeek,
    recoveryScore,
  });
  const { clean: trainingClean, reasons: trainingDirtyReasons } = assessTrainingCleanliness({
    completedSessions: lastCycleCompletedSessions,
    plannedSessions,
    keptExercisesAndLoads: lastCycleKeptExercisesAndLoads,
    effortNearFailure: lastCycleEffortNearFailure,
  });
  // Este ciclo vai (ou não) ensinar a calibração. Antes a variável era calculada e descartada; agora
  // volta na resposta, porque saber que um ciclo "não conta" é justamente o que faz o usuário entender
  // por que a calibração não avança.
  const cycleCleanForCalibration = dietClean && trainingClean;

  // TDEE "de fórmula" calculado em paralelo só pra auditoria/calibração — a prescrição real desse ciclo
  // continua vindo do TDEE empírico (result.tdeeRange), que já é a fonte mais confiável quando há
  // histórico (ver TDEE Empírico e Histórico de Ciclos). Isso nunca substitui a prescrição, só alimenta
  // o aprendizado de quanto a fórmula erra pra essa pessoa especificamente.
  const shadowFormulaComp = estimateBodyComposition({
    weightKg: currentWeightKg,
    heightCm,
    bodyFatPercent: bfPercentVisual,
    age,
    sex,
    activityLevel,
    exerciseFreq,
    sessionDuration,
    dailyStepsAvg,
    sittingHoursPerDay,
    standingWorkHoursPerDay,
    activeCommuteMinutesPerDay,
    choresHoursPerWeek,
    stairFlightsPerDay,
    otherSportActivity,
    otherSportSessionsPerWeek,
    otherSportMinutesPerSession,
    otherSportTalkTest,
  });
  const empiricalTdeeMid = (result.tdeeRange.min + result.tdeeRange.max) / 2;

  let tdeeCalibration: ReturnType<typeof computeTdeeCalibration> = {
    factor: 1,
    confidence: "nenhuma",
    cleanCyclesUsed: 0,
    totalCyclesSeen: 0,
    note: "Nenhum ciclo auditado ainda — a calibração começa a partir do segundo ciclo limpo.",
  };
  let bfConsistency: { consistent: boolean; note: string } | null = null;

  // Este bloco NÃO usa try/catch pra detectar tabela ausente: o cliente Supabase não lança exceção em
  // erro de Postgres, devolve `{ error }`. O código antigo desestruturava só `data` e ignorava o retorno
  // do insert, então "tabela prediction_audit não existe" era indistinguível de "tabela vazia" — o
  // usuário lia "Nenhum ciclo limpo ainda pra calibrar" pra sempre, sem saber que a migração não rodou.
  let calibrationUnavailableReason: string | null = null;

  const { data: auditRows, error: auditSelectError } = await supabase
    .from("prediction_audit")
    .select("date,formula_tdee,empirical_tdee,diet_clean,training_clean")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  if (auditSelectError) {
    calibrationUnavailableReason = `Não foi possível ler o histórico de auditoria (${auditSelectError.message}). A calibração contínua fica desligada até isso ser resolvido — normalmente é a migração da tabela prediction_audit que ainda não rodou no Supabase.`;
  } else {
    const calibrationInput: CalibrationAuditRow[] = (auditRows ?? []).map((r) => ({
      date: r.date,
      formulaTdee: r.formula_tdee != null ? Number(r.formula_tdee) : null,
      empiricalTdee: r.empirical_tdee != null ? Number(r.empirical_tdee) : null,
      dietClean: r.diet_clean,
      trainingClean: r.training_clean,
    }));
    tdeeCalibration = computeTdeeCalibration(calibrationInput);
  }

  if (lastCycle?.bodyFatPercent != null) {
    bfConsistency = checkBfConsistency(
      gainComposition,
      currentWeightKg - lastCycle.weightKg,
      bfPercentVisual - lastCycle.bodyFatPercent,
      lastCycle.weightKg,
      lastCycle.bodyFatPercent
    );
  }

  const { error: auditInsertError } = await supabase.from("prediction_audit").insert({
    user_id: user.id,
    date,
    formula_tdee: shadowFormulaComp.tdee,
    empirical_tdee: empiricalTdeeMid,
    bf_percent_visual: bfPercentVisual,
    bf_confidence: vision.bfConfidence,
    gain_composition: gainComposition,
    weight_delta_kg: lastCycle ? currentWeightKg - lastCycle.weightKg : null,
    diet_clean: dietClean,
    training_clean: trainingClean,
    bf_consistent: bfConsistency?.consistent ?? null,
    notes: [...dietDirtyReasons, ...trainingDirtyReasons],
  });

  if (auditInsertError && !calibrationUnavailableReason) {
    calibrationUnavailableReason = `Este ciclo não foi gravado na auditoria (${auditInsertError.message}), então não vai contar pra calibração dos próximos.`;
  }

  // estratégia decidida pelo %BF atual (mesmo critério do primeiro ciclo). O kcal vem do TDEE real do
  // algoritmo (calculado a partir da resposta observada do próprio usuário, usando o E da composição
  // decidida acima) + o superávit/déficit da estratégia — não da extrapolação pura da tendência histórica,
  // que só continuaria a direção que o histórico já vinha seguindo e não "desligaria" sozinha. O déficit
  // em si é suavizado/zerado automaticamente se recoveryScore indicar que o ciclo anterior foi pesado demais.
  // A fase do ciclo anterior alimenta a histerese de classifyPathFromBf — sem ela, alguém parado em
  // cima do limiar de %BF alterna de fase todo ciclo só pelo ruído da leitura de foto.
  const previousPath: DietPath | undefined =
    lastCycle?.bodyFatPercent != null ? classifyPathFromBf(lastCycle.bodyFatPercent, sex).path : undefined;
  const { path: strategy, pathReason: strategyReason, surplusPercent: strategySurplusPercent } = classifyPathFromBf(
    bfPercentVisual,
    sex,
    recoveryScore,
    previousPath
  );

  const cardioPrescription = prescribeCardio({ strategy, strengthDaysPerWeek: daysPerWeek, recoveryScore, weightKg: currentWeightKg });

  // O fator de calibração deixa de ser decorativo. Ele mede o quanto a FÓRMULA erra pra essa pessoa,
  // aprendido só de ciclos limpos (ver calibration.ts). O TDEE empírico segue como fonte principal — é
  // mais preciso quando há histórico —, mas com poucos pares utilizáveis o empírico fica ruidoso, e aí a
  // fórmula já corrigida pelo fator pessoal é um segundo estimador com erro conhecido. Nesse caso os
  // dois são combinados, com peso proporcional à confiança da calibração. Com histórico farto, o
  // empírico manda sozinho, como antes.
  const calibratedFormulaTdee = shadowFormulaComp.tdee * tdeeCalibration.factor;
  const CALIBRATION_BLEND_WEIGHT: Record<typeof tdeeCalibration.confidence, number> = {
    nenhuma: 0,
    baixa: 0.15,
    media: 0.25,
    alta: 0.35,
  };
  const sparseHistory = history.length < 4;
  const calibrationWeight = sparseHistory ? CALIBRATION_BLEND_WEIGHT[tdeeCalibration.confidence] : 0;
  const blendTdee = (v: number) => v * (1 - calibrationWeight) + calibratedFormulaTdee * calibrationWeight;
  const tdeeRangeUsed = { min: blendTdee(result.tdeeRange.min), max: blendTdee(result.tdeeRange.max) };
  const calibrationApplied =
    calibrationWeight > 0
      ? `Histórico ainda curto (${history.length} ciclos): o TDEE deste ciclo é ${((1 - calibrationWeight) * 100).toFixed(0)}% retrocálculo do seu histórico + ${(calibrationWeight * 100).toFixed(0)}% fórmula já corrigida pelo seu fator pessoal (${tdeeCalibration.factor.toFixed(3)}).`
      : null;

  // Proteína e gordura vêm da ESTRATÉGIA, não mais extrapoladas do histórico. A extrapolação criava uma
  // catraca: a proteína era calculada sobre o peso PROJETADO e depois relida contra o peso MEDIDO de
  // hoje, então em corte sustentado o g/kg encolhia sozinho a cada ciclo, sem ninguém ter decidido isso.
  const { proteinPerKg, fatPerKg } = macroTargetsForStrategy(strategy);
  const tdeeUsedMid = (tdeeRangeUsed.min + tdeeRangeUsed.max) / 2;

  const safety = applySafetyLimits({
    proposedKcal: tdeeUsedMid * (1 + strategySurplusPercent),
    proposedProteinG: currentWeightKg * proteinPerKg,
    proposedFatG: currentWeightKg * fatPerKg,
    weightKg: currentWeightKg,
    sex,
    strategy,
    tdee: tdeeUsedMid,
    bmr: shadowFormulaComp.bmr,
    previousKcal: lastCycle?.kcal ?? null,
  });

  const recommendedKcal = safety.kcal;
  const recommendedProteinG = safety.proteinG;
  const recommendedFatG = safety.fatG;
  const recommendedCarbG = safety.carbG;

  // As faixas viraram ponto: com os macros vindo da estratégia e o kcal passando pelos guarda-corpos,
  // a incerteza real está no TDEE (já exposta em tdeeCalibration/rateKgWeek), não numa faixa de macro
  // que dava a impressão de precisão que não existia.
  const kcalStrategyRange = { min: recommendedKcal, max: recommendedKcal };
  const carbStrategyRange = { min: recommendedCarbG, max: recommendedCarbG };
  const proteinRangeOut = { min: recommendedProteinG, max: recommendedProteinG };
  const fatRangeOut = { min: recommendedFatG, max: recommendedFatG };

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
  const tdeeMid = tdeeUsedMid;
  const projectedSurplusPercent = tdeeMid > 0 ? recommendedKcal / tdeeMid - 1 : 0;
  const oneMonthE = strategy === "cutting" ? 7700 : strategy === "bulking" ? 5250 : 7700;
  const projectedRateKgWeek = (tdeeMid * projectedSurplusPercent * 7) / oneMonthE;
  const oneMonthMid = currentWeightKg + projectedRateKgWeek * 4;
  const oneMonthDelta = Math.abs(projectedRateKgWeek * 4) * 0.2;
  const oneMonthProjection = {
    weightRange: { min: oneMonthMid - oneMonthDelta, max: oneMonthMid + oneMonthDelta },
    note: `Com o kcal recomendado (${recommendedKcal.toFixed(0)}kcal, ${PATH_LABEL[strategy]}) frente à manutenção estimada (~${tdeeMid.toFixed(0)}kcal), projeção de peso em 4 semanas: ${(oneMonthMid - oneMonthDelta).toFixed(1)}–${(oneMonthMid + oneMonthDelta).toFixed(1)}kg.`,
  };

  const planoDeFases = planejarFases({
    currentWeightKg,
    currentBfPercent: bfPercentVisual,
    heightCm,
    sex,
    tdee: tdeeMid,
    monthsAhead: 24,
    recoveryScore,
    initialPath: strategy,
  });

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
      protein: proteinRangeOut,
      fat: fatRangeOut,
      carb: carbStrategyRange,
      weight: result.projectedWeightRange,
    },
    rateKgWeek: result.rateKgWeek,
    recoveryScore,
    monthlyPlan: planoDeFases.meses,
    planoDeFases,
    muscleGroupAssessment: vision.muscleGroupAssessment ?? [],
    muscleCrossCheck,
    muscleTargets: muscleTargetsOut ?? [],
    suggestedTrainingProgram,
    trainingPeriodizationPlan,
    trainingAdherenceScore,
    plannedSessions,
    cardioPrescription,
    tdeeCalibration,
    calibrationApplied,
    calibrationUnavailableReason,
    cycleCleanForCalibration,
    cycleDirtyReasons: [...dietDirtyReasons, ...trainingDirtyReasons],
    safetyWarnings: losingLeanMass
      ? [
          "A leitura deste ciclo indica perda de peso às custas de massa magra, não de gordura. O déficit foi suavizado automaticamente — perder no ritmo agressivo faz a massa magra estagnar ou cair (Garthe et al. 2011). Se isso se repetir no próximo ciclo, o caminho é subir as calorias, não cortar mais.",
          ...safety.warnings,
        ]
      : safety.warnings,
    cardioKcalPerDay: cardioPrescription.estimatedKcalPerDay,
    bfConsistency,
    meals,
    dietWarnings,
  });
}
