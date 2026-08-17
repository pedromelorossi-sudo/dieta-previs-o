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
