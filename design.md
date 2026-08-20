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
- **Páginas de formulário** (`/previsao-ia`, `/perfil/questionario`,
  `/ciclos/novo`, `/estimar`) — **14 Narrative Workflow.** Etapas numeradas
  contando o processo em ordem. Não é imposição: o formulário de previsão já é
  numerado ("1. Fotos… 5. Parâmetros"), então a macroestrutura formaliza uma
  estrutura que o app já tinha.
- **Páginas de listagem** (`/fotos`, `/treino`, `/admin`) — **13 Index-First.**
  A página É a lista. Sem herói, sem narrativa.

## Tema — preservado, não substituído

A paleta e a fonte do projeto são **anteriores** ao Hallmark e ficam como estão.
Trocá-las seria refazer a marca, não o design. O que muda é a aplicação delas.

- `--background` `#0b0c0d` · `--surface` `#141618` · `--surface-raised` `#191c1f`
- `--border` `#2a2d31` · `--foreground` `#eef0f2` · `--muted` `#93989f`
- `--accent` `#eab308` (âmbar) · `--accent-strong` `#ca8a04` · `--accent-contrast` `#221a00`
- `--warn` `#fb923c` · `--danger` `#f87171`

**Dark-only** por decisão do projeto (`color-scheme: dark`). Não há tema claro, e
o design não deve fingir que há.

**Disciplina do acento:** âmbar em no máximo ~5% do viewport. Ele marca a ação
primária e o dado que está sendo destacado agora — nada mais. Acento em tudo é o
mesmo que acento em nada.

## Tipografia

- **Display:** Geist Sans 600, `letter-spacing: -0.025em`
- **Corpo:** Geist Sans 400 — mesma família (disciplina de fonte única do gênero)
- **Números e códigos:** Geist Mono, `font-variant-numeric: tabular-nums`
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

- **Primário:** preenchido em âmbar, texto `--accent-contrast`, raio 8px. Um por
  tela. O verbo diz exatamente o que acontece ("Gerar previsão", não "Continuar").
- **Secundário:** contornado, borda `--border`, fundo transparente.
- **Destrutivo:** texto em `--danger`, sem preenchimento.
- Nunca quebrar em duas linhas em nenhuma largura.

## O que as páginas DEVEM compartilhar

- A fonte Geist e a paleta acima.
- O acento âmbar e seu limite de ~5%.
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
| Aurora-blob background (radial-gradient) | 2 | `globals.css` no `body` |
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
