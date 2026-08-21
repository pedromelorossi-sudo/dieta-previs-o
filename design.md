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

## Tema — Apple Liquid Glass

> **Terceira versão, 2026-08-20.** A primeira preservava a marca âmbar (verbo
> `redesign`, que preserva por contrato). A segunda construiu um tema
> "instrumento" do zero — papel quase-preto frio, acento ciano, Space Grotesk +
> Inter + JetBrains Mono. Pedro olhou e disse que continuava quase idêntico ao
> antigo, e tinha razão: **eu tinha trocado a pintura, não a planta.** Esta
> terceira usa a skill `apple-design` (naplesblue, MIT), que ataca justamente a
> planta — a regra nº 1 dela é *superfície unificada > cartões fragmentados*.
> Nem o âmbar nem o ciano existem mais no projeto.

### As cinco regras, em ordem de decisão

1. **Superfície unificada > cartões fragmentados.** Itens irmãos vão num único
   painel branco com fios de divisão, não numa pilha de cartões com borda e
   fundo próprios. Fragmentação é o inimigo nº 1.
2. **Vidro é tempero, não o prato.** `backdrop-filter` só onde camadas de fato
   se sobrepõem. **No Degrau isso é exatamente um lugar: a nav fixa.** Conteúdo
   comum é branco chapado com sombra macia.
3. **Contenção é o luxo.** Se espaço em branco e hierarquia resolvem, não
   acrescente borda, preenchimento, ícone ou número.
4. **Hierarquia vem de peso + tamanho + cinza, não de cor.** O corpo é
   preto-branco-cinza; a cor é só acento.
5. **A qualidade mora no detalhe.** Tracking negativo em título grande,
   `tabular-nums`, fio de 1px, elevação suave, vidro a 180% de saturação.

### Paleta

- Chão `#f5f5f7` (**frio** — creme/bege é o visual de IA mais batido) ·
  superfície `#ffffff` · embutido `#f0f0f3` · hover de linha `#fbfbfd`
- Fios: `--border` `rgba(0,0,0,0.08)` · `--rule-2` `rgba(0,0,0,0.05)` ·
  `--faint` `#d2d2d7` · trilho de medidor `--track` `#e8e8ed`
- Texto em quatro degraus, todos cinza: `#1d1d1f` · `#424245` · `#6e6e73` ·
  `#86868b`, e `#aeaeb2` para placeholder
- Acento **único**: azul Apple `#0071e3` (`#0066cc` no hover). `--warn`
  `#ff6b00`. `--danger` `#d70015` — o vermelho Apple `#ff3b30` não alcança
  4,5:1 sobre branco, então foi escurecido.

**Light-only.** O app deixou de ser dark-only nesta versão (`color-scheme:
light`). Não há tema escuro, e o design não deve fingir que há.

**Disciplina do acento:** azul só na ação primária, no link e no foco.
Nada mais. Cor para preencher espaço é proibida pela regra 4.

### Forma

Patamares de raio, **sem inventar valor intermediário**: pílula `999px`
(botão, etiqueta) · marca `6px` · miniatura e campo `12px` · cartão `18px` ·
painel `22px`.

Sombra **sempre em duas camadas** — contato curto + espalhamento macio. Uma
sombra dura só é a armadilha clássica que a skill nomeia.

Alvo de toque ≥ 44px em todo controle, mesmo quando o visual é menor.

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

- **Primário:** pílula preenchida em azul Apple, texto branco. É a forma de
  botão da Apple desde o iOS 7 e o olho reconhece antes de ler. Um por tela. O
  verbo diz exatamente o que acontece ("Gerar previsão", não "Continuar").
- **Secundário:** pílula branca com fio interno (`box-shadow: inset`), texto em
  azul.
- Feedback de clique é `scale(0.97)`, não afundamento.
- **Destrutivo:** texto em `--danger`, sem preenchimento.
- Nunca quebrar em duas linhas em nenhuma largura.

## O que as páginas DEVEM compartilhar

- A pilha do sistema e a paleta acima.
- O azul e seu limite: ação primária, link, foco. Nada mais.
- **Os patamares de raio.** Não há `rounded-lg`/`xl`/`md` no projeto — tudo foi
  normalizado para os patamares nomeados.
- **Medidor é pílula em `--track`.** A ponta reta com fio era o tema anterior.
- **Painel unificado (`.panel` + `.panel-row`) sempre que os itens forem
  irmãos.** Cartão (`.card`) só para bloco isolado, sem irmãos.
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

## Armadilha do `.panel-row`

`a.panel-row` e `button.panel-row` **não** podem declarar `display`. Seletor de
elemento + classe tem especificidade maior que a utilitária `.flex` do Tailwind,
e uma linha-link com layout flex quebra em duas silenciosamente — aconteceu, e
só apareceu no screenshot. A regra só define largura, alinhamento e transição.

## Estado da migração instrumento → Apple

O que mudou nesta passada, além dos tokens:

| de (instrumento) | para (Apple) |
|---|---|
| `color-scheme: dark` + classe `dark` | `color-scheme: light` |
| Space Grotesk + Inter + JetBrains Mono via `next/font` | pilha do sistema, sem download |
| 31 × `rounded-md` (6px) | `rounded-[12px]`, o patamar de miniatura |
| 28 rótulos em caixa alta com tracking largo | caixa normal; hierarquia por peso e tamanho |
| 11 × `font-mono` em número de dado | `tabular-nums` na fonte do sistema |
| Medidor de ponta reta com fio | pílula em `--track` |
| Avatar/chip quadrado de 3px | círculo |
| Traço de acento sob a aba ativa | contraste de texto (cinza → preto + peso) |
| Grade de estatística com borda em volta | painel branco único com fios |
| Tabela solta na página | tabela dentro de painel, com respiro nas pontas |

A troca do traço da aba ativa por contraste de texto **matou o número mágico**
(`-bottom-[15px]`) que dependia da altura exata do header e já tinha quebrado
uma vez. A armadilha registrada na versão anterior deste arquivo deixou de
existir.
