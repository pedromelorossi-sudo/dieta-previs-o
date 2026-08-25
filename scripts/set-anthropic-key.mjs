#!/usr/bin/env node
/* Troca a ANTHROPIC_API_KEY do .env.local sem que ela apareça na tela, no
 * histórico do shell ou em qualquer log.
 *
 * Existe porque a chave anterior foi gravada com texto colado no fim
 * (". Install ORM" depois do último caractere), e o Next lê a linha inteira
 * como valor — a chave ia para a API com lixo no fim. Editar à mão funciona,
 * mas é onde o erro acontece.
 *
 * O que ele faz, nesta ordem:
 *   1. pede a chave com o eco desligado (não aparece enquanto você digita)
 *   2. remove espaços, aspas e qualquer coisa depois do fim da chave
 *   3. confere o formato antes de gravar
 *   4. TESTA contra a API de verdade
 *   5. só então grava, preservando o resto do arquivo
 *
 * Se o teste falhar, nada é gravado — o .env.local fica como estava.
 *
 * Uso:  npm run set-key
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import Anthropic from "@anthropic-ai/sdk";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const arquivo = join(raiz, ".env.local");

if (!existsSync(arquivo)) {
  console.error(`\n✗ Não achei ${arquivo}\n`);
  process.exit(1);
}

/** Lê uma linha do terminal SEM ecoar o que é digitado. */
function perguntarEmSilencio(pergunta) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = process.stdout;
    // intercepta a escrita para não repetir os caracteres digitados
    const escreverOriginal = saida.write.bind(saida);
    let silenciar = false;
    saida.write = (chunk, ...resto) => (silenciar ? true : escreverOriginal(chunk, ...resto));
    escreverOriginal(pergunta);
    silenciar = true;
    rl.question("", (resposta) => {
      silenciar = false;
      saida.write = escreverOriginal;
      escreverOriginal("\n");
      rl.close();
      resolve(resposta);
    });
  });
}

const bruto = await perguntarEmSilencio("Cole a chave da Anthropic (ela não vai aparecer): ");

/* Limpeza: tira espaços e aspas das pontas e corta qualquer coisa que venha
 * DEPOIS do fim da chave. É exatamente o defeito que existia no arquivo. */
const semAspas = bruto.trim().replace(/^["']|["']$/g, "");
const casada = semAspas.match(/sk-ant-[A-Za-z0-9_-]+/);

if (!casada) {
  console.error("\n✗ Isso não parece uma chave da Anthropic (esperado começar com 'sk-ant-').\n  Nada foi gravado.\n");
  process.exit(1);
}
const chave = casada[0];

if (semAspas !== chave) {
  console.log(`  (limpei ${semAspas.length - chave.length} caractere(s) que vieram junto no copiar-e-colar)`);
}
console.log(`  chave recebida: ${chave.length} caracteres, termina em …${chave.slice(-4)}`);

console.log("\n  testando na API antes de gravar…");
try {
  const client = new Anthropic({ apiKey: chave });
  await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4,
    messages: [{ role: "user", content: "ok" }],
  });
  console.log("  ✓ a API aceitou a chave");
} catch (e) {
  const msg = String(e?.message ?? e);
  console.error(`\n✗ A API recusou a chave. NADA foi gravado — o .env.local está intacto.\n\n  ${msg.slice(0, 160)}\n`);
  if (msg.includes("authentication_error")) {
    console.error("  'authentication_error' é chave inválida ou revogada, não falta de crédito.");
    console.error("  Crie outra em https://console.anthropic.com/settings/keys — os créditos");
    console.error("  ficam na organização e continuam valendo com uma chave nova.\n");
  }
  process.exit(1);
}

/* Grava preservando o resto do arquivo. Backup antes, porque este arquivo tem
 * as credenciais do banco e não está no git — se algo der errado aqui não há
 * de onde restaurar. */
copyFileSync(arquivo, `${arquivo}.bak`);

const linhas = readFileSync(arquivo, "utf8").split("\n");
let trocou = false;
const novas = linhas.map((l) => {
  if (!l.startsWith("ANTHROPIC_API_KEY=")) return l;
  trocou = true;
  return `ANTHROPIC_API_KEY=${chave}`;
});
if (!trocou) novas.push(`ANTHROPIC_API_KEY=${chave}`);

writeFileSync(arquivo, novas.join("\n"));
console.log(`\n✓ Gravado em .env.local (cópia do anterior em .env.local.bak).`);
console.log("  Reinicie o servidor de desenvolvimento para ele reler o arquivo.\n");
