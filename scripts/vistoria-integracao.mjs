#!/usr/bin/env node
/* VISTORIA DE INTEGRAÇÃO — procura o defeito que mais apareceu neste projeto:
 * mecanismo escrito, comentado em detalhe, e nunca ligado.
 *
 * Em 24-25/08/2026 esse mesmo padrão produziu QUATRO bugs em produção:
 *   - `loadDiets` sem chamador  → "a dieta não fica salva"
 *   - `loadTrainingPrograms` sem chamador → "o treino vem sem séries"
 *   - `classifyPathFromBf` recebendo 2 de 5 parâmetros → estratégia errada
 *   - ferramenta de visão do 1º ciclo sem `muscleGroupAssessment` → treino
 *     de usuário novo sem ponto fraco
 *
 * Nada disso é pego por `tsc`, por lint ou por teste: função exportada que
 * ninguém chama é código válido, e parâmetro opcional não passado é legal.
 *
 * Uso: node scripts/vistoria-integracao.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = new URL("..", import.meta.url).pathname;
const SRC = join(RAIZ, "src");

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.(ts|tsx)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

const todos = arquivos(SRC);
const conteudo = new Map(todos.map((f) => [f, readFileSync(f, "utf8")]));
const rel = (f) => f.replace(RAIZ, "");

/* ── 1. FUNÇÃO EXPORTADA SEM NENHUM CHAMADOR ─────────────────────────────── */
const exportadas = [];
for (const [arquivo, texto] of conteudo) {
  for (const m of texto.matchAll(/^export (?:async )?function (\w+)/gm)) {
    exportadas.push({ nome: m[1], arquivo });
  }
}

const orfas = [];
for (const { nome, arquivo } of exportadas) {
  let usos = 0;
  for (const [outro, texto] of conteudo) {
    if (outro === arquivo) continue;
    // chamada, referência como valor, ou re-export
    if (new RegExp(`\\b${nome}\\b`).test(texto)) usos++;
  }
  if (usos === 0) orfas.push({ nome, arquivo });
}

/* ── 2. PARÂMETROS OPCIONAIS QUE NINGUÉM PASSA ───────────────────────────── */
/* Heurística: função exportada com N parâmetros; conta os argumentos na maior
 * chamada encontrada. Se a maior chamada usa bem menos que o total, o resto do
 * mecanismo está inerte — foi exatamente o caso de `classifyPathFromBf`. */
const subalimentadas = [];
for (const { nome, arquivo } of exportadas) {
  const texto = conteudo.get(arquivo);
  const decl = texto.match(new RegExp(`export (?:async )?function ${nome}\\s*\\(([\\s\\S]*?)\\)\\s*:`, "m"));
  if (!decl) continue;
  const corpo = decl[1];
  if (!corpo.trim()) continue;
  // conta parâmetros no topo (vírgulas fora de parênteses/chaves/genéricos)
  let nivel = 0, params = 1;
  for (const c of corpo) {
    if ("({[<".includes(c)) nivel++;
    else if (")}]>".includes(c)) nivel--;
    else if (c === "," && nivel === 0) params++;
  }
  if (params < 3) continue;

  let maiorChamada = 0, ondeMaior = null;
  for (const [outro, t2] of conteudo) {
    for (const m of t2.matchAll(new RegExp(`\\b${nome}\\s*\\(`, "g"))) {
      // varre até o parêntese de fechamento correspondente
      let i = m.index + m[0].length, n = 1, args = 1, vazio = true;
      while (i < t2.length && n > 0) {
        const c = t2[i];
        if ("({[".includes(c)) n++;
        else if (")}]".includes(c)) n--;
        else if (c === "," && n === 1) args++;
        if (n > 0 && !/\s/.test(c)) vazio = false;
        i++;
      }
      const total = vazio ? 0 : args;
      if (total > maiorChamada) { maiorChamada = total; ondeMaior = outro; }
    }
  }
  if (maiorChamada > 0 && maiorChamada < params - 1) {
    subalimentadas.push({ nome, arquivo, params, maiorChamada, ondeMaior });
  }
}

/* ── RELATÓRIO ───────────────────────────────────────────────────────────── */
console.log("═".repeat(74));
console.log("VISTORIA DE INTEGRAÇÃO — mecanismos escritos e não ligados");
console.log("═".repeat(74));

console.log(`\n▸ FUNÇÕES EXPORTADAS SEM NENHUM CHAMADOR  (${orfas.length})`);
if (orfas.length === 0) console.log("   nenhuma — tudo que é exportado é usado em algum lugar");
for (const o of orfas) console.log(`   ✗ ${o.nome.padEnd(34)} ${rel(o.arquivo)}`);

console.log(`\n▸ FUNÇÕES CHAMADAS COM MENOS PARÂMETROS DO QUE ACEITAM  (${subalimentadas.length})`);
console.log("   (o resto do mecanismo fica inerte — foi o caso do classifyPathFromBf)");
if (subalimentadas.length === 0) console.log("   nenhuma");
for (const s of subalimentadas) {
  console.log(`   ! ${s.nome.padEnd(34)} aceita ${s.params}, maior chamada usa ${s.maiorChamada}`);
  console.log(`     ${" ".repeat(34)} declarada em ${rel(s.arquivo)}`);
}

console.log("\n" + "═".repeat(74));
const problemas = orfas.length + subalimentadas.length;
console.log(problemas === 0 ? "Nada a reportar." : `${problemas} ponto(s) para revisar acima.`);
