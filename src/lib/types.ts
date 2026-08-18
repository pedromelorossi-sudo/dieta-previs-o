export type GainComposition = "gordura" | "misto" | "musculo";

export interface Cycle {
  id: string;
  date: string; // ISO yyyy-mm-dd
  weightKg: number;
  bodyFatPercent: number | null;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** true when this cycle's kcal/protein/fat/carb were a PREDICTION, not a real prescription */
  isPrediction?: boolean;
  /** what the person actually ate on average, when different from `kcal` (adherence wasn't 1:1) */
  actualKcal?: number | null;
}
