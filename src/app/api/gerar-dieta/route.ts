import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { generateDietMeals } from "@/lib/dietGenerator";
import { dietTotals } from "@/lib/dietBuilder";
import { Restriction } from "@/lib/questionnaire";

interface RequestBody {
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbG: number;
  mealsCount: number;
  mustHaveFoodIds: string[];
  restrictions: Restriction[];
  excludedFoodIds: string[];
  cookingTime: string;
  notes: string;
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

  if (!body.targetKcal || body.targetKcal <= 0) {
    return NextResponse.json({ error: "Defina as metas de kcal/macros antes de gerar." }, { status: 400 });
  }
  /* Só `targetKcal` era validado — proteína/gordura/carboidrato e número de refeições chegavam direto
     de `request.json()` sem checagem de tipo/faixa no servidor. O cliente já faz `parseFloat(...) ||
     0` antes de enviar (barra NaN), mas não barra negativo nem um valor absurdo — e nada impede uma
     chamada direta à API, sem passar pelo formulário. Faixas generosas, só pra cortar erro de
     digitação/valor fisiologicamente impossível. */
  const faixasMacro: { campo: keyof RequestBody; label: string; min: number; max: number }[] = [
    { campo: "targetProteinG", label: "Proteína alvo", min: 0, max: 500 },
    { campo: "targetFatG", label: "Gordura alvo", min: 0, max: 400 },
    { campo: "targetCarbG", label: "Carboidrato alvo", min: 0, max: 1200 },
    { campo: "mealsCount", label: "Número de refeições", min: 1, max: 10 },
  ];
  for (const { campo, label, min, max } of faixasMacro) {
    const valor = body[campo];
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < min || valor > max) {
      return NextResponse.json(
        { error: `${label}: valor inválido (${valor}). Faixa esperada: ${min} a ${max}.` },
        { status: 400 }
      );
    }
  }

  const client = new Anthropic();
  let meals, warnings;
  try {
    ({ meals, warnings } = await generateDietMeals(client, body));
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      const errBody = err.error as { error?: { message?: string } } | undefined;
      const message = errBody?.error?.message ?? err.message;
      return NextResponse.json({ error: `Erro na API da Anthropic: ${message}` }, { status: err.status ?? 502 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao gerar o plano." }, { status: 502 });
  }

  const totals = dietTotals({
    id: "preview",
    name: "",
    createdAt: "",
    targetKcal: body.targetKcal,
    targetProteinG: body.targetProteinG,
    targetFatG: body.targetFatG,
    targetCarbG: body.targetCarbG,
    meals,
  });

  return NextResponse.json({ meals, totals, warnings });
}
