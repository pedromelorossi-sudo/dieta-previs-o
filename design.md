# Design — Degrau

Sistema de design travado deste app. Toda página lida por `hallmark redesign` lê
este arquivo antes de emitir código. Não regenerar por página — estender ou
corrigir aqui quando o sistema precisar crescer.

Produzido por Hallmark v1.1.0 em 2026-08-20, primeira execução no projeto.

## Contexto

Um único usuário: estudante de medicina, fisiculturista natural, olhando o próprio
progresso mês a mês. Não é um site de marketing e não tem visitante — todo mundo
que abre já está logado e já sabe o que o app faz. **A tela não precisa convencer;
precisa informar rápido e não mentir.** Isso descarta hero de conversão, prova
social, e qualquer enfeite que ocupe espaço sem carregar dado.

## Gênero

**modern-minimal.** Escola Stripe/Linear: Geist, displays grandes e confiantes,
respiro generoso, superfícies de cartão discretas, movimento mínimo. O gênero foi
escolhido pelo tipo de conteúdo (produto denso em dados, não conteúdo editorial) e
por já bater com a fonte que o projeto usa.

## Família de macroestrutura

Três famílias, uma por tipo de página. Páginas da mesma família compartilham a
forma; variam só nos arquétipos de componente.

- **Páginas de painel** (`/`, resultado da previsão) — **04 Stat-Led.** O herói é
  um número grande com tipografia tabular, e tudo abaixo qualifica esse número.
  Escolhida porque o conteúdo real da tela *é* um número: kcal do ciclo, peso,
  %BF. Regra da macroestrutura: a figura nunca aparece sozinha — vem sempre
  emparelhada com uma linha em palavras que a completa.
- **Páginas de sequência** (`/previsao-ia`) — **14 Narrative Workflow.** Etapas
  numeradas contando o processo em ordem. Não é imposição: o formulário de
  previsão já era numerado ("1. Informações básicas… 5. Parâmetros"), então a
  macroestrutura formaliza uma estrutura que o app já tinha.

  > **Correção de 2026-08-20.** A primeira versão deste arquivo colocava
  > `/ciclos/novo`, `/estimar`, `/dieta/novo` e `/perfil/questionario` nesta
  > família. Ao abrir os arquivos, nenhum deles tem sequência: são formulários de
  > **um momento só** — a pessoa preenche e envia. A própria macroestrutura avisa
  > *"avoid for tools that work in one moment; Narrative Workflow needs a real
  > sequence"*. Numerá-los seria inventar um processo que não existe. Eles ficam
  > sem macroestrutura própria e seguem apenas as regras compartilhadas abaixo.
- **Páginas de listagem** (`/fotos`, `/treino`, `/admin`) — **13 Index-First.**
  A página É a lista. Sem herói, sem narrativa.

## Tema — "instrumento", construído do zero

> **Substituição de 2026-08-20.** A primeira versão desta seção se chamava
> *"preservado, não substituído"* e mantinha o âmbar `#eab308` sobre `#0b0c0d`
> com Geist. Isso era correto para o verbo `hallmark redesign`, cuja regra é
> preservar a marca — e foi por isso que a primeira passada entregou uma versão
> mais arrumada do mesmo site, não um site repaginado. Pedro pediu design do
> zero; a rota *custom* do Hallmark (`custom-theme.md` § B) foi executada e a
> paleta abaixo é nova por inteiro. O âmbar não existe mais no projeto.

A tese do tema: **este app é um mostrador, não uma página.** O usuário abre para
ler um número que ele mesmo produziu com o próprio corpo. Daí o fundo chapado, a
régua de um fio, o raio curto de 6px e a cor concentrada em um lugar só.

Paleta em OKLCH (a construção, não só os valores — para poder estender depois):

- Papel quase-preto frio, três degraus e nunca mais que isso:
  `--background` `oklch(14% 0.012 254)` · `--surface` `oklch(17.5% 0.014 254)` ·
  `--surface-raised` `oklch(21% 0.015 254)`
- Réguas em dois pesos: `--border` `oklch(29% 0.012 254)` delimita painel,
  `--rule-2` `oklch(24% 0.011 254)` divide por dentro
- Tinta: `--foreground` `oklch(94% 0.008 254)` · `--foreground-2` `oklch(88%…)` ·
  `--muted` `oklch(62% 0.013 254)` · `--neutral` `oklch(46% 0.012 254)`
- Acento em **ciano frio**: `--accent` `oklch(76% 0.145 205)` ·
  `--accent-strong` `oklch(69% 0.155 205)` · `--focus` `oklch(80% 0.15 205)`.
  Como a claridade passa de 50%, a tinta **sobre** o acento é escura:
  `--accent-contrast` `oklch(18% 0.03 220)`
- Estados: `--warn` `oklch(76% 0.14 75)` · `--danger` `oklch(66% 0.17 22)` — os
  únicos matizes fora da família fria, de propósito: alerta e erro precisam ser
  lidos como *"não sou o acento"*

**Por que ciano e não azul.** A primeira tentativa usou `oklch(66% 0.18 254)` —
o mesmo matiz frio do papel, com 15× a croma. Renderizado, aquilo é
essencialmente `blue-500` clareado: o acento mais default da web, exatamente o
que uma paleta feita à mão não deveria produzir. O ciano de 205° acende contra o
papel frio em vez de se dissolver nele, e carrega o vocabulário certo — traço de
osciloscópio, não botão de SaaS.

**Dark-only** por decisão do projeto (`color-scheme: dark`). Não há tema claro, e
o design não deve fingir que há.

**Disciplina do acento:** ciano em no máximo ~5% do viewport. Ele marca a ação
primária e o dado que está sendo destacado agora — nada mais. Acento em tudo é o
mesmo que acento em nada.

## Tipografia

Três famílias, o teto da disciplina 2+1: display + corpo + a mono, que existe por
função (alinhar coluna de número) e não por estilo.

- **Display:** Space Grotesk 600, `letter-spacing: -0.02em` — grotesk de traço
  técnico, aplicada em `h1`–`h4` pelo elemento, não por classe
- **Corpo:** Inter 400, `0.9375rem` / `1.55` — a sans que some e deixa ler
- **Números e códigos:** JetBrains Mono, `font-variant-numeric: tabular-nums`
- **`.meta`** é a assinatura do tema: mono, caixa alta, `0.6875rem`,
  `letter-spacing: 0.08em`, cor `--muted`. É o rótulo que diz *"isto é uma
  leitura"* antes de o número aparecer. Todo painel e todo campo usa.
- **Todo número que o usuário compara entre linhas usa tabular-nums.** Peso, kcal,
  macro, data, séries. Coluna de número que dança entre as linhas é um erro de
  leitura, não de estética.
- Sem itálico em título, nunca. Ênfase vem de peso ou acento.

## Espaçamento

Escala de 4pt do Tailwind, via classes utilitárias. Sem valores crus.

## Movimento

O projeto não tem biblioteca de motion instalada e **não deve ganhar uma.**

- Transições só em `transform` e `opacity`, nunca em propriedade de layout.
- Sem `transition-all` — a propriedade é sempre nomeada.
- Sem `hover:scale`. Elevação em superfície e borda dá o mesmo sinal sem mover
  o layout.
- **Sem reveal em scroll.** Ver a seção de anti-padrões abaixo.
- `prefers-reduced-motion: reduce` colapsa tudo em crossfade de ≤150ms.
- `:focus-visible` sempre visível, com anel de contraste ≥3:1, e **nunca animado**
  — o anel aparece instantaneamente.

## Microinterações

- Sucesso silencioso. O botão vira "Salvo" e para por aí — sem toast.
- Ação destrutiva usa confirmação explícita, porque aqui não há desfazer.
- Tooltip: 800ms no hover, 0ms no foco.

## Voz dos botões

- **Primário:** preenchido chapado em ciano, texto `--accent-contrast`, raio 6px.
  **Sem gradiente e sem glow** — o feedback de clique é 1px de afundamento, o
  gesto físico de um botão de painel. Um por tela. O verbo diz exatamente o que
  acontece ("Gerar previsão", não "Continuar").
- **Secundário:** contornado, borda `--border`, fundo transparente.
- **Destrutivo:** texto em `--danger`, sem preenchimento.
- Nunca quebrar em duas linhas em nenhuma largura.

## O que as páginas DEVEM compartilhar

- O trio Space Grotesk / Inter / JetBrains Mono e a paleta acima.
- O acento ciano e seu limite de ~5%.
- **Raio de 6px em tudo que tem borda.** Painel, botão, campo e sub-painel
  compartilham o mesmo canto; etiqueta usa 3px e chip de identidade 3px. Não há
  `rounded-lg`/`xl` no projeto — foram todos normalizados.
- **Medidor de ponta reta, nunca pílula.** Barra de progresso em pílula parece
  indicador de app; ponta reta parece leitura de escala.
- `tabular-nums` em toda coluna numérica.
- A regra de que **todo número exibido tem procedência**: veio de medição, de
  cálculo ou de projeção, e a tela diz qual. Este app existe para não mentir sobre
  incerteza — o design não pode desfazer isso apresentando estimativa com a mesma
  autoridade visual de uma medição.

## Anti-padrões observados no código atual

Encontrados na auditoria de 2026-08-20 e a corrigir conforme cada página for
refeita:

| tell | ocorrências | onde |
|---|---|---|
| Aurora-blob background (radial-gradient) | 2 | `globals.css` no `body` — **removido** |
| Reveal em scroll em tudo (`animate-fade-in-up`) | 35 | espalhado |
| Grade de 3 colunas de feature (`sm:grid-cols-3`) | 7 | espalhado |
| Emoji como ícone (⚠ ✓ →) | 13 | espalhado |
| Glassmorphism (`backdrop-blur`) | 1 | header do `layout.tsx` |
| `transition-all` | 1 | — |
| `hover:scale-105` | 1 | — |

**O mais grave é o segundo.** Trinta e cinco elementos com a mesma animação de
entrada não são uma escolha de design — são a ausência de uma. Quando tudo se
anuncia, nada tem prioridade, e o usuário paga o custo de espera sem receber
hierarquia em troca. A regra nova: **nenhum reveal em scroll.** A página está
composta quando carrega.

## Permissões por página

- Páginas de painel e formulário: **sem enriquecimento.** A função carrega a tela.
- Gráficos e sparklines são dado, não ornamento — permitidos e encorajados.
- Nenhuma fotografia decorativa. As únicas imagens do app são as fotos de
  progresso do próprio usuário, que são conteúdo.

## Exports

`tokens.css` na raiz carrega os tokens em formato portátil. O `globals.css`
continua sendo a fonte que o Next carrega — `tokens.css` é cópia para exportação,
não substitui nada.

## Estado dos anti-padrões (2026-08-20, após a reconstrução)

Todos os tells da tabela acima foram eliminados, e a reconstrução fechou mais
três que a auditoria original não tinha nomeado:

| tell | onde estava | o que ficou |
|---|---|---|
| Gradiente em preenchimento | botão primário, marca no header, marca do login/cadastro | preenchimento chapado |
| `backdrop-filter: blur` no `.card` | `globals.css` | fundo opaco — vidro fosco pressupõe algo atrás, e atrás só tem fundo |
| `translateY(-3px)` + sombra colorida no hover do `.card` | `globals.css` | o hover só acende a borda; o painel é chapa parafusada, não cartão flutuando |
| Varredura diagonal no `.skeleton` | `globals.css` | pulso de opacidade |
| Halo de 30px no `.animate-glow-pulse` | `globals.css` | pulso de borda |
| `text-[#06231a]` (hex cru de um tema verde antigo) | `login`, `cadastro` | `var(--accent-contrast)` |

**Regra herdada da limpeza:** nenhuma cor e nenhuma `font-family` no projeto pode
ser valor cru. Tudo passa por token nomeado. Se um valor novo for preciso, ele
sobe para o bloco `:root` com nome antes de ser usado.

## Armadilha conhecida

`NavLink` posiciona o traço da aba ativa com um deslocamento medido em pixels
(`-bottom-[15px]`), porque ele precisa cair exatamente sobre a régua inferior do
header. **Esse número depende da densidade do header** (`py-3` e a marca de
24px). Já quebrou uma vez: ao apertar o header de `py-4` para `py-3`, o valor
antigo de `-21px` passou a flutuar longe da régua. Se mexer na altura do header,
meça de novo no browser em vez de deduzir — a conta envolve a centragem do texto
contra a marca, não só o padding.
