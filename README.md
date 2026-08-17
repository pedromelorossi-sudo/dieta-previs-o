# Previsão de Dieta

App pessoal para prever peso e macros a partir do histórico de ciclos de prescrição, montar dietas com substituições de alimentos, gerar PDF, e acompanhar progresso com fotos + %BF (método Navy). Autenticação e dados via Supabase.

## 1. Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No painel do projeto, vá em **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql) e rode. Isso cria as tabelas, as políticas de RLS (cada pessoa só vê os próprios dados) e o bucket de storage para as fotos.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Em **Authentication → Providers**, confirme que **Email** está habilitado (é o padrão). Se preferir pular a confirmação por email durante os testes, desative "Confirm email" em **Authentication → Settings**.

## 2. Chave da Anthropic (opcional — só para a página "Análise do Claude")

1. Crie uma conta em [console.anthropic.com](https://console.anthropic.com) e gere uma chave em **Settings → API Keys**.
2. Essa chave fica só no servidor (`ANTHROPIC_API_KEY`, sem prefixo `NEXT_PUBLIC_`) — nunca é exposta ao navegador.
3. Sem essa chave, o resto do site funciona normalmente; só a página **Análise do Claude** fica indisponível.

## 3. Rodar localmente

```bash
cp .env.local.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e (opcional) ANTHROPIC_API_KEY

npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000), crie uma conta em `/cadastro` e comece a usar.

## 4. Deploy na Vercel

1. Suba este repositório para o GitHub (crie um repo novo e faça `git push`).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Em **Environment Variables**, adicione as mesmas variáveis do `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (opcional)
4. Clique em **Deploy**.
5. Depois do primeiro deploy, volte no Supabase em **Authentication → URL Configuration** e adicione a URL pública da Vercel (ex: `https://seu-projeto.vercel.app`) em **Site URL** e **Redirect URLs**, para o link de confirmação de email funcionar em produção.

## Estrutura

- `src/lib/dietEngine.ts` — motor de previsão (taxa de peso, TDEE, superávit, extrapolação de regras).
- `src/lib/bodyComposition.ts` — estimador de dieta inicial (Katch-McArdle + Mifflin-St Jeor) e cálculo de %BF pelo método Navy.
- `src/lib/foods.ts` / `src/lib/dietBuilder.ts` — banco de alimentos e montador de refeições com substituições.
- `src/lib/pdf.ts` — geração do PDF do plano alimentar.
- `src/lib/supabase/` — clients Supabase (browser, server, middleware de sessão).
- `src/app/api/analise/route.ts` — chama a API do Claude (`claude-opus-5`) com o histórico do usuário para uma análise qualitativa (Passo 7 do algoritmo original: julgamento humano que os números sozinhos não capturam).
- `supabase/schema.sql` — schema completo (tabelas + RLS + bucket de fotos).
- Autenticação: `src/context/AuthContext.tsx`, páginas `/login` e `/cadastro`, `middleware.ts` protege as rotas.

## Importar o histórico real (opcional)

Os 3 ciclos reais de consultoria usados para construir o algoritmo não são mais semeados automaticamente (cada conta nova começa vazia). Depois de criar sua conta, registre-os manualmente em **Registrar ciclo**:

| Data | Peso | %BF | Kcal | Proteína | Gordura | Carbo |
|---|---|---|---|---|---|---|
| 16/06 | 79,0 | 14% | 2.520 | 169,5g | 49,7g | 369,1g |
| 15/07 | 83,4 | ~14-15% | 2.762 | 172,4g | 51,3g | 424,8g |
| 13/08 | 84,5 | ~14-15% | 2.941 | 183,7g | 54,0g | 453,8g |
