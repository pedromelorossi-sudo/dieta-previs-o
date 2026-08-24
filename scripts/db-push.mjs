#!/usr/bin/env node
/* Aplicador de migrações — para parar de copiar SQL no painel do Supabase.
 *
 * Como funciona: cada arquivo em `supabase/migrations/` roda UMA vez, na ordem
 * do nome, dentro de uma transação. O que já rodou fica registrado na tabela
 * `_migrations` do próprio banco, então rodar de novo não repete nada e não
 * quebra nada.
 *
 * Por que uma tabela de controle e não `if not exists` em tudo: `if not exists`
 * funciona para criar, mas não para ALTERAR. Uma migração que muda uma política
 * ou renomeia uma coluna não é idempotente sozinha, e sem registro não há como
 * saber o que já foi aplicado.
 *
 * Uso:
 *   npm run db:push          aplica o que estiver pendente
 *   npm run db:push -- --dry mostra o que aplicaria, sem tocar no banco
 *
 * Precisa de `DATABASE_URL` no .env.local — a string de conexão direta do
 * Supabase (Project Settings → Database → Connection string → URI). Ela contém
 * a senha do banco, então mora só no .env.local, que não vai para o git.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const dirMigracoes = join(raiz, "supabase", "migrations");
const seco = process.argv.includes("--dry");

/* Lê .env.local sem depender de biblioteca: o Next carrega esse arquivo
 * sozinho na aplicação, mas este script roda fora dela. */
function carregarEnv() {
  const caminho = join(raiz, ".env.local");
  if (!existsSync(caminho)) return;
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = valor;
  }
}

function sair(msg, codigo = 1) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(codigo);
}

carregarEnv();

/* Prefere DIRECT_URL. O painel do Supabase entrega duas strings: a
 * `DATABASE_URL` é o pooler em modo TRANSAÇÃO (porta 6543), que não suporta
 * statements de sessão nem transações longas — migração quebra nele. A
 * `DIRECT_URL` é o pooler em modo SESSÃO, que é o correto para DDL. */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  sair(
    `Nem DIRECT_URL nem DATABASE_URL estão no .env.local.

  Onde pegar: painel do Supabase → Project Settings → Database →
  Connection string → URI. Escolha a opção "Session pooler" se sua rede não
  tiver IPv6.

  Cole no .env.local como uma linha:
      DATABASE_URL=postgresql://postgres:SENHA@db.xxxx.supabase.co:5432/postgres

  A string contém a senha do banco. O .env.local já está no .gitignore.`
  );
}

if (!existsSync(dirMigracoes)) sair(`Pasta não encontrada: ${dirMigracoes}`);

const arquivos = readdirSync(dirMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort(); // a ordem é a do nome — por isso o prefixo numérico

if (arquivos.length === 0) sair("Nenhuma migração encontrada.", 0);

const cliente = new pg.Client({
  connectionString: url,
  // O Supabase exige TLS, e o certificado é de uma CA que o Node não conhece
  // por padrão. `rejectUnauthorized: false` mantém a conexão criptografada e
  // dispensa a verificação da cadeia — aceitável para uma conexão de
  // administração feita pelo dono do banco, a partir da máquina dele.
  ssl: { rejectUnauthorized: false },
});

try {
  await cliente.connect();
} catch (e) {
  sair(
    `Não consegui conectar ao banco.\n\n  ${e.message}\n\n` +
      `  Causas comuns: senha errada na DATABASE_URL, ou a rede não tem IPv6\n` +
      `  (nesse caso use a string do "Session pooler" em vez da direta).`
  );
}

await cliente.query(`
  create table if not exists public._migrations (
    nome text primary key,
    aplicada_em timestamptz not null default now()
  );
`);

const { rows } = await cliente.query("select nome from public._migrations");
const jaAplicadas = new Set(rows.map((r) => r.nome));
const pendentes = arquivos.filter((f) => !jaAplicadas.has(f));

if (pendentes.length === 0) {
  console.log(`\n✓ Nada pendente. ${arquivos.length} migração(ões) já aplicada(s).\n`);
  await cliente.end();
  process.exit(0);
}

console.log(`\n${pendentes.length} migração(ões) pendente(s):\n`);
for (const f of pendentes) console.log(`   • ${f}`);

if (seco) {
  console.log("\n(--dry: nada foi aplicado)\n");
  await cliente.end();
  process.exit(0);
}

console.log("");
for (const arquivo of pendentes) {
  const sql = readFileSync(join(dirMigracoes, arquivo), "utf8");
  process.stdout.write(`   aplicando ${arquivo} … `);
  try {
    /* Transação por migração: ou o arquivo inteiro entra, ou nada dele entra.
     * Sem isso, uma migração que falha no meio deixa o banco num estado que não
     * corresponde a nenhum arquivo — e aí ninguém sabe mais o que foi aplicado. */
    await cliente.query("begin");
    await cliente.query(sql);
    await cliente.query("insert into public._migrations (nome) values ($1)", [arquivo]);
    await cliente.query("commit");
    console.log("ok");
  } catch (e) {
    await cliente.query("rollback");
    console.log("FALHOU");
    await cliente.end();
    sair(`${arquivo} não foi aplicada e nada dela ficou no banco:\n\n  ${e.message}`);
  }
}

/* O PostgREST guarda o schema em cache; sem avisar, colunas novas só aparecem
 * para a aplicação depois de um tempo (ou de um restart). */
await cliente.query("notify pgrst, 'reload schema'");
console.log(`\n✓ ${pendentes.length} migração(ões) aplicada(s). Cache do PostgREST recarregado.\n`);
await cliente.end();
