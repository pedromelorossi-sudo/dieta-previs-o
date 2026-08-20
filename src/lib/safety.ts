import { DietPath, Sex } from "./bodyComposition";

/** Guarda-corpos da prescrição — a última etapa antes do kcal/macro virar dieta de verdade.
 *
 * Motivo de existir: até aqui o app encadeia estimativas (TDEE empírico → estratégia → superávit), e
 * cada uma tem erro próprio. Sem piso, os erros se multiplicam sem nada segurando: um TDEE subestimado
 * em 13% multiplicado por um déficit de 20% chega a -30% da manutenção real sem disparar aviso nenhum.
 * Nada aqui tenta ser mais esperto que o algoritmo — só impede que a composição de erros produza uma
 * prescrição que nenhum profissional assinaria, e AVISA sempre que precisa intervir (silenciar o
 * problema seria pior que o problema).
 */

export interface SafetyLimitsInput {
  proposedKcal: number;
  proposedProteinG: number;
  proposedFatG: number;
  weightKg: number;
  sex: Sex;
  strategy: DietPath;
  /** TDEE estimado do ciclo — base do teto de agressividade do déficit */
  tdee: number;
  /** BMR estimado — piso absoluto: não se prescreve abaixo do gasto de repouso sem supervisão */
  bmr: number;
  /** kcal prescrito no ciclo anterior, pra limitar o salto entre ciclos consecutivos */
  previousKcal?: number | null;
}

export interface SafetyLimitsResult {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbG: number;
  /** true se qualquer limite precisou ser aplicado — a UI deve mostrar os avisos com destaque */
  adjusted: boolean;
  warnings: string[];
}

/** Teto absoluto de déficit — a última barreira, depois da estratégia. Ancorado em Garthe et al. 2011
 * (Int J Sport Nutr Exerc Metab, DOI 10.1123/ijsnem.21.2.97): no braço que reduziu a ingestão em
 * 19±2% (0,7%/semana de peso) os atletas GANHARAM 2,1% de massa magra e subiram no 1RM; no braço que
 * reduziu 30±4% (1,4%/semana) a massa magra não se moveu (-0,2%) e a perda de gordura foi parecida.
 * O teto fica em 25%. A evidência sozinha sustentaria algo mais apertado (~22%, logo acima do braço
 * que funcionou); 25% é a escolha do projeto, deixando a margem final para o ajuste por recuperação e
 * para a trava de variação por ciclo, que já seguram o caso agressivo antes deste ponto.
 * Carbone et al. 2019 (Adv Nutr, DOI 10.1093/advances/nmy087) reforça que déficits maiores não podem
 * ser compensados com mais proteína — a proteção da massa magra diminui conforme o déficit cresce. */
const MAX_DEFICIT_FRACTION = 0.25;

/** Teto absoluto de superávit. Garthe et al. 2013 (Eur J Sport Sci, DOI 10.1080/17461391.2011.643923):
 * +600kcal/dia em atletas de elite treinando força 4x/semana produziu o MESMO ganho de massa magra que
 * comer ad libitum, com massa gorda subindo 15±4% contra 3±3%. Superávit grande não compra músculo —
 * compra gordura. Iraki et al. 2019 recomenda 10-20% acima da manutenção; 20% é o teto dessa faixa. */
const MAX_SURPLUS_FRACTION = 0.2;

/** Pisos absolutos de energia. Não são alvos, são o ponto em que o app se recusa a ir mais fundo sem
 * acompanhamento profissional — abaixo disso a densidade de micronutrientes de uma dieta comum já não
 * fecha, e o risco de baixa disponibilidade energética passa a ser o fator dominante (Mountjoy et al.
 * 2023, consenso do COI sobre REDs, Br J Sports Med, DOI 10.1136/bjsports-2023-106994). */
const ABSOLUTE_KCAL_FLOOR: Record<Sex, number> = {
  masculino: 1500,
  feminino: 1200,
};

/** Piso de proteína. Morton et al. 2018 (Br J Sports Med, DOI 10.1136/bjsports-2017-097608),
 * meta-análise de 49 estudos: os ganhos de massa magra com treino de força platôam em ~1,6 g/kg/dia —
 * esse é o piso para qualquer fase. Em déficit a necessidade sobe (Helms et al. 2014 recomenda
 * 2,3-3,1 g/kg de massa magra), então o piso em cutting é mais alto. */
const PROTEIN_FLOOR_PER_KG: Record<DietPath, number> = {
  cutting: 1.8,
  normocalorico: 1.6,
  bulking: 1.6,
};

/** Piso de gordura. Iraki et al. 2019 recomenda 0,5-1,5 g/kg para fisiculturistas naturais; abaixo de
 * ~0,5 g/kg a ingestão de ácidos graxos essenciais e vitaminas lipossolúveis fica comprometida. */
const FAT_FLOOR_PER_KG = 0.5;

/** Variação máxima entre ciclos consecutivos. Não tem base experimental — é uma decisão de engenharia:
 * a leitura de %BF da foto tem ruído de ±1-2,5 pontos percentuais, e sem essa trava esse ruído se
 * converte em saltos de 20%+ na prescrição de um mês pro outro. Um ajuste real de metabolismo não
 * acontece nessa velocidade; um salto grande é quase sempre ruído de medição. */
const MAX_CYCLE_CHANGE_FRACTION = 0.15;

export function applySafetyLimits(input: SafetyLimitsInput): SafetyLimitsResult {
  const { proposedKcal, weightKg, sex, strategy, tdee, bmr, previousKcal } = input;
  const warnings: string[] = [];
  let kcal = proposedKcal;

  // --- 1. teto de agressividade relativo à manutenção estimada ---
  if (tdee > 0) {
    const deficitFloor = tdee * (1 - MAX_DEFICIT_FRACTION);
    const surplusCeiling = tdee * (1 + MAX_SURPLUS_FRACTION);
    if (kcal < deficitFloor) {
      warnings.push(
        `Déficit calculado passava de ${(MAX_DEFICIT_FRACTION * 100).toFixed(0)}% da manutenção estimada (${kcal.toFixed(0)} vs ${tdee.toFixed(0)}kcal) — limitado a ${deficitFloor.toFixed(0)}kcal. No ensaio de Garthe et al. 2011, cortar 19% da ingestão fez a massa magra SUBIR 2,1% durante a perda de peso; cortar 30% zerou esse ganho sem perder mais gordura.`
      );
      kcal = deficitFloor;
    } else if (kcal > surplusCeiling) {
      warnings.push(
        `Superávit calculado passava de ${(MAX_SURPLUS_FRACTION * 100).toFixed(0)}% da manutenção estimada — limitado a ${surplusCeiling.toFixed(0)}kcal. Em Garthe et al. 2013, comer ~600kcal/dia a mais rendeu o mesmo ganho de massa magra e cinco vezes mais gordura.`
      );
      kcal = surplusCeiling;
    }
  }

  // --- 2. piso absoluto: nunca abaixo do BMR estimado nem do piso por sexo ---
  const floor = Math.max(ABSOLUTE_KCAL_FLOOR[sex], bmr > 0 ? bmr : 0);
  if (kcal < floor) {
    warnings.push(
      `Prescrição ficaria em ${kcal.toFixed(0)}kcal, abaixo do piso de segurança (${floor.toFixed(0)}kcal — o maior entre o gasto de repouso estimado e o mínimo por sexo). Elevada até o piso: cortar abaixo disso é território de acompanhamento profissional, não de algoritmo.`
    );
    kcal = floor;
  }

  // --- 3. trava de variação entre ciclos consecutivos ---
  if (previousKcal != null && previousKcal > 0) {
    const maxUp = previousKcal * (1 + MAX_CYCLE_CHANGE_FRACTION);
    const maxDown = previousKcal * (1 - MAX_CYCLE_CHANGE_FRACTION);
    if (kcal > maxUp || kcal < maxDown) {
      const limited = Math.min(maxUp, Math.max(maxDown, kcal));
      warnings.push(
        `Mudança de ${(((kcal - previousKcal) / previousKcal) * 100).toFixed(0)}% em relação ao ciclo anterior (${previousKcal.toFixed(0)}kcal) — limitada a ±${(MAX_CYCLE_CHANGE_FRACTION * 100).toFixed(0)}% (${limited.toFixed(0)}kcal). Salto grande de um ciclo pro outro costuma ser ruído da leitura de foto ou da balança, não mudança real de metabolismo; se a direção estiver certa, o próximo ciclo continua o ajuste.`
      );
      kcal = limited;
    }
  }

  // --- 4. pisos de macronutriente ---
  const proteinFloor = weightKg * PROTEIN_FLOOR_PER_KG[strategy];
  let proteinG = input.proposedProteinG;
  if (proteinG < proteinFloor) {
    warnings.push(
      `Proteína abaixo do piso de ${PROTEIN_FLOOR_PER_KG[strategy].toFixed(1)} g/kg (${proteinG.toFixed(0)}g) — elevada para ${proteinFloor.toFixed(0)}g (Morton et al. 2018; Helms et al. 2014 para o piso mais alto em déficit).`
    );
    proteinG = proteinFloor;
  }

  const fatFloor = weightKg * FAT_FLOOR_PER_KG;
  let fatG = input.proposedFatG;
  if (fatG < fatFloor) {
    warnings.push(
      `Gordura abaixo do piso de ${FAT_FLOOR_PER_KG.toFixed(1)} g/kg (${fatG.toFixed(0)}g) — elevada para ${fatFloor.toFixed(0)}g (Iraki et al. 2019).`
    );
    fatG = fatFloor;
  }

  // --- 5. carboidrato é resíduo, mas o resíduo não pode ser negativo em silêncio ---
  // Antes esse caso era zerado com Math.max(0, ...) e a soma dos macros deixava de bater com o kcal
  // prescrito sem ninguém perceber. Agora o kcal sobe pra acomodar os pisos, e o usuário é avisado.
  const kcalFromProteinFat = proteinG * 4 + fatG * 9;
  const MIN_CARB_G = 50; // piso operacional: abaixo disso a dieta não fecha em alimentos comuns
  const minimumKcal = kcalFromProteinFat + MIN_CARB_G * 4;
  if (kcal < minimumKcal) {
    warnings.push(
      `Os pisos de proteína e gordura sozinhos já consomem ${kcalFromProteinFat.toFixed(0)}kcal — o total foi elevado de ${kcal.toFixed(0)} para ${minimumKcal.toFixed(0)}kcal pra sobrar um mínimo de carboidrato. Nesse ponto a estratégia precisa ser revista, não só o número.`
    );
    kcal = minimumKcal;
  }

  const carbG = (kcal - kcalFromProteinFat) / 4;

  return {
    kcal,
    proteinG,
    fatG,
    carbG,
    adjusted: warnings.length > 0,
    warnings,
  };
}
