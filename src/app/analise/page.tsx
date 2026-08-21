"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { IconFlame } from "@/components/icons";

import { ReadingPage } from "@/components/apple";

export default function AnalisePage() {
  const { ready, user } = useAuth();
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/analise", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao gerar análise.");
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError("Erro de rede ao chamar a análise.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ReadingPage>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Análise do Claude</h1>
        <p className="text-sm text-muted mt-2">
          Passa seu histórico de ciclos, última previsão, preferências e fotos de progresso para o Claude avaliar —
          o julgamento qualitativo que o algoritmo, por si só, não tem: adesão, tendência, consistência entre
          variáveis, red flags.
        </p>
      </div>

      <button type="button" onClick={handleGenerate} disabled={loading || !ready || !user} className="btn-primary">
        <IconFlame className="h-4 w-4" />
        {loading ? "Analisando…" : "Gerar análise"}
      </button>

      {error && (
        <div className="card border-warn/30 bg-warn/5 p-4 text-sm text-warn">{error}</div>
      )}

      {loading && (
        <div className="space-y-2">
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      )}

      {analysis && (
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="flex h-6 w-6 items-center justify-center rounded-[12px] bg-accent/15 text-accent">
              <IconFlame className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-semibold">Leitura do Claude</h2>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis}</p>
          <p className="mt-4 text-xs text-muted">
            Gerado por IA a partir dos seus dados — não é aconselhamento médico ou nutricional profissional.
          </p>
        </div>
      )}
    </ReadingPage>
  );
}
