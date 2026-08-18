import { Sex, DietPath, classifyPathFromBf, PATH_LABEL } from "./bodyComposition";

// Taxas de variação de peso por fase — alvos validados na literatura de nutrição esportiva pra atletas
// de força natural, não uma extrapolação livre a partir do kcal:
// - Cutting: 0,5-1%/semana do peso corporal maximiza retenção de massa magra (Helms et al. 2014, J Int
//   Soc Sports Nutr, DOI 10.1186/1550-2783-11-20). Garthe et al. 2011 (Int J Sport Nutr Exerc Metab,
//   DOI 10.1123/ijsnem.21.2.97) comparou 0,7%/semana vs. 1,4%/semana em atletas: no ritmo mais lento a
//   massa magra e a força SUBIRAM durante o déficit; no mais rápido, estagnaram — uso 0,7% como alvo.
// - Bulking: 0,25-0,5%/semana minimiza ganho de gordura desnecessário (Iraki et al. 2019, Sports,
//   DOI 10.3390/sports7070154, recomendação pra bodybuilders natural no off-season) — uso 0,35% como
//   meio-termo (mais conservador que o teto, considerando que o app não distingue novato/avançado).
const WEEKLY_RATE_PERCENT: Record<DietPath, number> = {
  cutting: -0.007,
  bulking: 0.0035,
  normocalorico: 0,
};

// fração da variação de peso que é massa gorda (o resto é massa magra) — aproximação, não medida, já
// que não há como saber a composição real de meses futuros sem fotos/dados reais desses ciclos. Cutting
// bem executado (proteína alta + treino de força mantido, conforme Helms et al. 2014) preserva a maior
// parte da massa magra; bulking controlado ainda carrega alguma gordura mesmo "limpo".
const FAT_SHARE_OF_CHANGE: Record<DietPath, number> = {
  cutting: 0.8,
  bulking: 0.35,
  normocalorico: 0.5,
};

const WEEKS_PER_MONTH = 4.345;

export interface MonthPlan {
  monthIndex: number;
  label: string;
  phase: DietPath;
  phaseLabel: string;
  phaseReason: string;
  recommendedKcal: number;
  startWeightKg: number;
  endWeightKg: number;
  startBfPercent: number;
  endBfPercent: number;
}

export interface PeriodizationInput {
  currentWeightKg: number;
  currentBfPercent: number;
  sex: Sex;
  /** TDEE mais recente conhecido — mantido fixo ao longo da projeção (na prática sobe com massa magra
   * ganha e cai com massa perdida, mas isso só é recalibrado de verdade a cada ciclo real, com fotos) */
  tdee: number;
  monthsAhead: number;
  /** mesmo ajuste de déficit usado nos ciclos reais (ver scoreRecoverySignals) — se não informado, assume
   * recuperação normal (déficit padrão) já que não há como prever fadiga de meses futuros */
  recoveryScore?: number;
}

/** Projeta os próximos meses mês a mês, decidindo a fase (cutting/normocalórico/bulking) a cada mês a
 * partir do %BF projetado — não é uma fase fixa escolhida uma vez, o algoritmo alterna sozinho quando o
 * %BF projetado cruza os limiares (classifyPathFromBf), do jeito que aconteceria de verdade num
 * recomposição natural ao longo do tempo. É uma projeção de trabalho com premissas explícitas (taxas e
 * repartição gordura/magra da literatura acima), não uma previsão garantida — cada ciclo real com fotos
 * recalibra o %BF de verdade e pode mudar a rota. */
export function planMonths(input: PeriodizationInput): MonthPlan[] {
  const { currentWeightKg, currentBfPercent, sex, tdee, monthsAhead, recoveryScore = 0 } = input;
  const plan: MonthPlan[] = [];

  let weightKg = currentWeightKg;
  let bfPercent = currentBfPercent;

  for (let i = 1; i <= monthsAhead; i++) {
    const { path, pathReason, surplusPercent } = classifyPathFromBf(bfPercent, sex, recoveryScore);
    const recommendedKcal = tdee * (1 + surplusPercent);

    const weeklyDeltaKg = weightKg * WEEKLY_RATE_PERCENT[path];
    const monthDeltaKg = weeklyDeltaKg * WEEKS_PER_MONTH;

    const fatMassKg = weightKg * (bfPercent / 100);
    const fatDeltaKg = monthDeltaKg * FAT_SHARE_OF_CHANGE[path];

    const endWeightKg = weightKg + monthDeltaKg;
    const endFatMassKg = Math.max(0, fatMassKg + fatDeltaKg);
    const endBfPercent = endWeightKg > 0 ? (endFatMassKg / endWeightKg) * 100 : bfPercent;

    plan.push({
      monthIndex: i,
      label: `Mês ${i}`,
      phase: path,
      phaseLabel: PATH_LABEL[path],
      phaseReason: pathReason,
      recommendedKcal,
      startWeightKg: weightKg,
      endWeightKg,
      startBfPercent: bfPercent,
      endBfPercent,
    });

    weightKg = endWeightKg;
    bfPercent = endBfPercent;
  }

  return plan;
}
