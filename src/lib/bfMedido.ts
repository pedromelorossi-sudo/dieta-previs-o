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
