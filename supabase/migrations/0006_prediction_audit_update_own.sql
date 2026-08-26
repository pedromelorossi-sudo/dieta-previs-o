-- Faltava a política de UPDATE em prediction_audit.
--
-- A tabela tem `insert own`, `select own or admin` e `delete own`, mas nunca
-- teve `update own` — porque a rota só fazia `insert`. Reanalisar no mesmo
-- dia batia na constraint única (user_id, date) e o insert simples falhava,
-- descartando os dados da tentativa nova em silêncio (a auditoria continuava
-- gravada com o valor da 1ª tentativa do dia).
--
-- A correção na rota trocou os dois `insert` por `upsert` com
-- `onConflict: "user_id,date"`. Sem esta política, o upsert continuaria
-- falhando: o INSERT ... ON CONFLICT DO UPDATE que o upsert gera por baixo
-- precisa de uma política de UPDATE pra ter permissão de atualizar a linha
-- em conflito, e RLS sem essa política rejeita a operação inteira — só
-- trocaria "erro de chave duplicada" por "erro de política".

drop policy if exists "prediction_audit: update own" on public.prediction_audit;
create policy "prediction_audit: update own" on public.prediction_audit
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
