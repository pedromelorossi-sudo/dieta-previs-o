import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `Você é um assistente que complementa um algoritmo determinístico de previsão de dieta com o julgamento qualitativo que o próprio algoritmo reconhece não ter — adesão, tendência visual, consistência entre as variáveis, red flags.

Você recebe: histórico de ciclos (peso, %BF, kcal, macros), a última previsão salva, preferências do usuário e, se houver, estimativas de %BF por fotos de progresso.

Escreva uma análise curta em português, em prosa (parágrafos, pode usar "- " para poucos pontos-chave, sem markdown pesado tipo headers ou negrito em excesso). Cubra:
1. A tendência de peso e %BF ao longo dos ciclos faz sentido junto com o superávit calórico registrado? Alguma inconsistência vale mencionar?
2. As regras extraídas (kcal/kg subindo, proteína em degrau, gordura fixa) parecem robustas ou é cedo para confiar nelas?
3. Alguma bandeira amarela — %BF subindo rápido demais, taxa de ganho de peso muito além do plausível para ganho magro, dados faltando?
4. Um comentário construtivo sobre o próximo ciclo, na perspectiva de alguém acompanhando de fora — não repita os números, interprete-os.

Você não é nutricionista nem médico e não substitui acompanhamento profissional — deixe isso implícito no tom (cauteloso, não prescritivo), sem precisar repetir um aviso legal formal a cada resposta. Seja direto, sem preâmbulo tipo "Vou analisar seus dados". Não exceda ~250 palavras.`;

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

interface PredictionRow {
  target_date: string;
  kcal_min: number;
  kcal_max: number;
  protein_min: number;
  protein_max: number;
  weight_min: number;
  weight_max: number;
}

interface PreferencesRow {
  diet_goal: string;
  activity_level: string;
  restrictions: string[];
}

interface PhotoRow {
  date: string;
  estimated_bf_percent: number | null;
  notes: string;
}

function buildSummary(
  cycles: CycleRow[],
  prediction: PredictionRow | null,
  prefs: PreferencesRow | null,
  photos: PhotoRow[]
): string {
  const parts: string[] = [];

  parts.push("Histórico de ciclos (data, peso, %BF, kcal, proteína, gordura, carbo):");
  for (const c of cycles) {
    parts.push(
      `- ${c.date}: ${c.weight_kg}kg, %BF ${c.body_fat_percent ?? "?"}, ${c.kcal}kcal, P ${c.protein_g}g, G ${c.fat_g}g, C ${c.carb_g}g${c.is_prediction ? " (previsão, ainda não confirmado)" : ""}`
    );
  }

  if (prediction) {
    parts.push(
      `\nÚltima previsão salva (alvo ${prediction.target_date}): peso ${prediction.weight_min}-${prediction.weight_max}kg, kcal ${prediction.kcal_min}-${prediction.kcal_max}, proteína ${prediction.protein_min}-${prediction.protein_max}g.`
    );
  }

  if (prefs) {
    parts.push(
      `\nPerfil: objetivo ${prefs.diet_goal}, atividade ${prefs.activity_level}, restrições: ${prefs.restrictions?.length ? prefs.restrictions.join(", ") : "nenhuma"}.`
    );
  }

  if (photos.length > 0) {
    parts.push("\n%BF estimado por fotos de progresso (método Navy):");
    for (const p of photos) {
      if (p.estimated_bf_percent != null) {
        parts.push(`- ${p.date}: ${p.estimated_bf_percent.toFixed(1)}%${p.notes ? ` — ${p.notes}` : ""}`);
      }
    }
  }

  return parts.join("\n");
}

export async function POST() {
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

  const [{ data: cycles }, { data: prediction }, { data: prefs }, { data: photos }] = await Promise.all([
    supabase.from("cycles").select("*").order("date", { ascending: true }),
    supabase.from("predictions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("preferences").select("*").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("progress_photos")
      .select("date, estimated_bf_percent, notes")
      .order("date", { ascending: true })
      .limit(10),
  ]);

  if (!cycles || cycles.length === 0) {
    return NextResponse.json({ error: "Sem histórico de ciclos para analisar ainda." }, { status: 400 });
  }

  const summary = buildSummary(cycles, prediction, prefs, photos ?? []);

  const client = new Anthropic();
  let response;
  try {
    response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: summary }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const body = err.error as { error?: { message?: string } } | undefined;
      const message = body?.error?.message ?? err.message;
      return NextResponse.json({ error: `Erro na API da Anthropic: ${message}` }, { status: err.status ?? 502 });
    }
    return NextResponse.json({ error: "Erro inesperado ao chamar a análise." }, { status: 502 });
  }

  if (response.stop_reason === "refusal") {
    return NextResponse.json({ error: "O modelo não conseguiu gerar uma análise para estes dados." }, { status: 422 });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  const analysis = textBlock && textBlock.type === "text" ? textBlock.text : "";

  return NextResponse.json({ analysis });
}
