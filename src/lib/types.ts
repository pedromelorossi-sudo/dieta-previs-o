export type GainComposition = "gordura" | "misto" | "musculo";

export interface CycleMuscleAssessment {
  muscle: string;
  relativeDevelopment: "atras_dos_outros" | "proporcional" | "destaque";
  confidence: "baixa" | "media" | "alta";
}

export interface Cycle {
  id: string;
  date: string; // ISO yyyy-mm-dd
  weightKg: number;
  bodyFatPercent: number | null;
  /** %BF vindo de exame (DEXA, bioimpedância…). Quando existe, foi ELE que
   * entrou no cálculo do ciclo — `bodyFatPercent` guarda o valor usado, este
   * guarda a procedência. */
  bfMedidoPercent?: number | null;
  bfMedidoMetodo?: string | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** true when this cycle's kcal/protein/fat/carb were a PREDICTION, not a real prescription */
  isPrediction?: boolean;
  /** what the person actually ate on average, when different from `kcal` (adherence wasn't 1:1) */
  actualKcal?: number | null;
  /** de onde veio este ciclo — define se faz sentido perguntar adesão no ciclo seguinte. Ver a nota
   * em schema.sql: `isPrediction` não serve, porque o fluxo de IA e a calculadora rápida marcam os
   * dois como true. `undefined` = linha anterior à coluna, tratada como prescrição. */
  origin?: "ia" | "consultoria" | "estimativa" | null;
  /** leitura visual por grupo muscular desse ciclo (da análise de foto) — usada pra montar a evolução
   * por grupo ao longo do tempo (ver muscleEvolution.ts) */
  muscleAssessment?: CycleMuscleAssessment[] | null;
  /** Estratégia prescrita NESTE ciclo. É o que alimenta a histerese no ciclo
   * seguinte — sem guardar, a fase é readivinhada pelo %BF sozinho e a
   * sequência não fecha (ver migração 0005). */
  path?: "bulking" | "cutting" | "normocalorico" | null;
}
