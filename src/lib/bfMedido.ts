/* %BF medido por exame — e a aferição da leitura visual contra ele.
 *
 * O app estima %BF a partir de foto, porque é o que quase todo mundo tem. Mas
 * quem fez DEXA, bioimpedância ou adipometria tem um número melhor, e usar a
 * estimativa nesse caso seria jogar informação fora.
 *
 * A parte que dá valor real, porém, é a segunda: mesmo com o valor medido em
 * mãos, o Claude CONTINUA estimando pela foto, e as duas leituras são
 * confrontadas. Cada exame vira um ponto de aferição da leitura visual — do
 * mesmo jeito que o app já confronta TDEE previsto contra TDEE realizado. Sem
 * isso, a estimativa por foto nunca saberia se está calibrada.
 */

export type MetodoMedicaoBf = "dexa" | "bioimpedancia" | "adipometria" | "ultrassom" | "outro";

export const METODO_MEDICAO_LABEL: Record<MetodoMedicaoBf, string> = {
  dexa: "DEXA",
  bioimpedancia: "Bioimpedância",
  adipometria: "Adipometria (dobras)",
  ultrassom: "Ultrassom",
  outro: "Outro",
};

/* Erro típico de cada método contra o padrão-ouro, em pontos percentuais de
 * gordura corporal. Não é ranking de marketing: é o que a literatura de
 * validação reporta, e serve para o app não tratar uma bioimpedância de balança
 * doméstica como se fosse um DEXA.
 *
 * DEXA é a referência prática em campo (o padrão-ouro real seria pesagem
 * hidrostática / modelo de 4 compartimentos), com erro típico de ~1-2 p.p.
 * Adipometria bem feita fica em ~3 p.p. e depende muito do avaliador.
 * Bioimpedância varia com hidratação, horário e aparelho — em condições
 * domésticas o erro passa de 4 p.p. com facilidade.
 *
 * Números como ordem de grandeza declarada, não precisão medida: a literatura
 * de validação reporta faixas amplas e dependentes de população e protocolo.
 * Ver a discussão em Ackland et al. 2012 (Sports Med, DOI
 * 10.2165/11597140-000000000-00000) sobre a variabilidade entre métodos. */
export const ERRO_TIPICO_PP: Record<MetodoMedicaoBf, number> = {
  dexa: 1.5,
  ultrassom: 2.5,
  adipometria: 3,
  bioimpedancia: 4,
  outro: 4,
};

/** Converte o erro típico do método medido pra o mesmo vocabulário baixa/média/alta que a IA de visão
 * usa em `bfConfidence` — usado quando `bfPercentVisual` passa a valer o MEDIDO (ver route.ts), pra
 * `classifyPathFromBf` não tratar um número de DEXA com a confiança (fixa) que a IA atribuiu à FOTO,
 * que é uma leitura completamente diferente e não é o que está sendo usado nesse caso. Limiares
 * alinhados à literatura citada acima: DEXA (~1-2 p.p.) é referência prática e vale "alta"; ultrassom e
 * adipometria bem feita (~2,5-3 p.p.) ficam no meio; bioimpedância doméstica (~4 p.p.) vale "baixa". */
export function confiancaFromMetodoMedicao(metodo: MetodoMedicaoBf): "baixa" | "media" | "alta" {
  const erro = ERRO_TIPICO_PP[metodo];
  if (erro <= 2) return "alta";
  if (erro <= 3) return "media";
  return "baixa";
}

export interface AfericaoVisual {
  /** o que o Claude estimou a partir das fotos */
  estimado: number;
  /** o que o exame mediu */
  medido: number;
  metodo: MetodoMedicaoBf;
  /** estimado − medido, em pontos percentuais. Positivo = o Claude superestimou. */
  erroPp: number;
  /** o erro cabe dentro da imprecisão do próprio método de medição? */
  dentroDaMargem: boolean;
  /** frase pronta explicando o que o confronto significa */
  veredito: string;
}

export function aferirLeituraVisual(
  estimado: number,
  medido: number,
  metodo: MetodoMedicaoBf
): AfericaoVisual {
  const erroPp = Math.round((estimado - medido) * 10) / 10;
  const margem = ERRO_TIPICO_PP[metodo];
  const absErro = Math.abs(erroPp);
  const dentroDaMargem = absErro <= margem;

  const direcao = erroPp > 0 ? "superestimou" : "subestimou";
  const nomeMetodo = METODO_MEDICAO_LABEL[metodo];
  /* "ponto percentual" / "pontos percentuais" — os DOIS termos flexionam. A
     primeira versão só flexionava o segundo e produzia "pontos percentualis".
     Erro que nenhum tipo pega: só aparece lendo a frase pronta. */
  const pontos = absErro === 1 ? "1 ponto percentual" : `${absErro} pontos percentuais`;

  let veredito: string;
  if (absErro < 0.1) {
    veredito = `A leitura por foto bateu com o resultado de ${nomeMetodo}. É um ponto de acerto, não uma garantia — um exame só não valida um método.`;
  } else if (dentroDaMargem) {
    veredito =
      `A leitura por foto ${direcao} em ${pontos}, dentro da margem típica de ${nomeMetodo} (~${margem} p.p.). ` +
      `Na prática as duas leituras não se contradizem.`;
  } else {
    veredito =
      `A leitura por foto ${direcao} em ${pontos} — acima da margem típica de ${nomeMetodo} (~${margem} p.p.). ` +
      `O cálculo deste ciclo usa o valor medido. Se o desvio se repetir no mesmo sentido em vários exames, a estimativa visual tem viés e não só ruído.`;
  }

  return { estimado, medido, metodo, erroPp, dentroDaMargem, veredito };
}

export interface HistoricoAfericao {
  data: string;
  estimado: number;
  medido: number;
  metodo: MetodoMedicaoBf;
  erroPp: number;
}

export interface TendenciaAfericao {
  n: number;
  /** média dos erros COM sinal — mede viés: se todos erram pro mesmo lado, não é ruído */
  viesPp: number;
  /** média do erro absoluto — mede dispersão */
  erroMedioAbsPp: number;
  diagnostico: string;
}

/** Lê o histórico de aferições e diz se a estimativa visual tem viés sistemático
 * ou só ruído. A distinção importa: ruído não dá pra corrigir, viés dá. */
export function analisarTendencia(historico: HistoricoAfericao[]): TendenciaAfericao | null {
  if (historico.length === 0) return null;

  const n = historico.length;
  const viesPp = Math.round((historico.reduce((s, h) => s + h.erroPp, 0) / n) * 10) / 10;
  const erroMedioAbsPp = Math.round((historico.reduce((s, h) => s + Math.abs(h.erroPp), 0) / n) * 10) / 10;

  let diagnostico: string;
  if (n === 1) {
    diagnostico =
      "Um exame só não distingue viés de acaso. A partir do segundo dá para saber se a estimativa erra sempre pro mesmo lado.";
  } else if (Math.abs(viesPp) < 1) {
    diagnostico = `Sem viés aparente em ${n} exames: os erros se cancelam (média ${viesPp > 0 ? "+" : ""}${viesPp} p.p.). O que sobra é dispersão de ${erroMedioAbsPp} p.p., que é ruído da leitura por foto.`;
  } else {
    /* Viés consistente é o achado acionável: dá para corrigir. Erra sempre pra
     * cima significa que a estimativa visual é sistematicamente pessimista, e o
     * número dela pode ser deslocado. */
    const sentido = viesPp > 0 ? "para cima" : "para baixo";
    diagnostico =
      `Viés de ${viesPp > 0 ? "+" : ""}${viesPp} p.p. em ${n} exames: a leitura por foto erra consistentemente ${sentido}. ` +
      `Isso é corrigível — diferente de dispersão, um desvio que se repete no mesmo sentido pode ser descontado. ` +
      `Erro médio absoluto: ${erroMedioAbsPp} p.p.`;
  }

  return { n, viesPp, erroMedioAbsPp, diagnostico };
}

/** O %BF é o único número que a IA de visão decide e que atravessa TODO o resto do cálculo
 * (estratégia, macros, projeção de 6 meses). Se ele não vier como número finito, a requisição falha
 * explicitamente em vez de produzir uma prescrição plausível a partir de nada. */
export function assertFiniteBf(value: unknown): number | null {
  /* AUSENTE É AUSENTE — não é zero.
   *
   * `Number(null)` é 0, não NaN. Sem esta guarda, `assertFiniteBf(null)` passava
   * pelo `isFinite`, batia no piso do clamp e devolvia **3**. Quem não fez exame
   * saía com "3% de gordura medido", e como o consumo é
   * `bfMedido ?? bfPercentVisualRaw`, o `??` nunca caía para a leitura da foto:
   * dieta, estratégia e projeção inteiras seriam calculadas sobre 3%BF.
   *
   * Só não explodiu ainda porque esse caminho roda a partir do SEGUNDO ciclo e
   * nenhum usuário tinha chegado lá. O clamp existe para conter leitura
   * implausível do modelo, não para inventar valor onde não há dado. */
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? Math.min(60, Math.max(3, n)) : null;
}

/** Faixa fisiologicamente possível de %BF em humano vivo. */
export const BF_MIN_PLAUSIVEL = 3;
export const BF_MAX_PLAUSIVEL = 60;

/* Valor MEDIDO por exame: rejeita em vez de aparar.
 *
 * `assertFiniteBf` apara para dentro de [3, 60] — correto para conter uma
 * leitura implausível DO MODELO, que é ruído de estimativa. Aplicado ao número
 * que a PESSOA digita, o mesmo clamp vira fábrica de dado falso: "0" e "1"
 * viram 3, e "-40" também. Medido no motor real, homem de 1,90m e 85kg:
 *
 *   %BF 16 (foto)      → normocalórico, 2952 kcal
 *   %BF 3  ("medido")  → BULKING,       3644 kcal
 *
 * 692 kcal/dia de diferença e inversão de fase, a partir de uma vírgula no
 * lugar errado — com HTTP 200 e nenhum aviso. E o banco já tem uma linha
 * assim: `bf_medido_percent = 3`.
 *
 * Erro de digitação tem de falhar alto, não virar prescrição plausível. */
export function validarBfMedido(value: unknown): { ok: true; valor: number | null } | { ok: false; erro: string } {
  if (value == null || value === "") return { ok: true, valor: null };
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    return { ok: false, erro: "O %BF do exame precisa ser um número." };
  }
  if (n < BF_MIN_PLAUSIVEL || n > BF_MAX_PLAUSIVEL) {
    return {
      ok: false,
      erro: `%BF de ${n}% está fora da faixa possível (${BF_MIN_PLAUSIVEL}% a ${BF_MAX_PLAUSIVEL}%). Confira o valor do exame — um ponto no lugar errado muda a dieta inteira.`,
    };
  }
  return { ok: true, valor: n };
}

/** O método é obrigatório junto com o valor: sem ele não há margem de erro para
 * comparar, e a aferição da leitura visual — a razão de o campo existir —
 * simplesmente não roda, em silêncio. */
export function validarMetodoMedicao(metodo: unknown): metodo is MetodoMedicaoBf {
  return typeof metodo === "string" && metodo in ERRO_TIPICO_PP;
}
