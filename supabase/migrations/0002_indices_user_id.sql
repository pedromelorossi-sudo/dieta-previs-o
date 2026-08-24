-- 0002 — índices em user_id
--
-- Toda política de RLS deste schema filtra por `user_id`, e cinco tabelas não
-- tinham índice nessa coluna: o Postgres varria a tabela inteira para decidir
-- quais linhas o usuário pode ver. Regra da skill da Supabase: "always add
-- indexes on columns used in RLS policies".

create index if not exists diets_user_idx on public.diets (user_id, created_at desc);
create index if not exists prediction_audit_user_date_idx on public.prediction_audit (user_id, date);
create index if not exists predictions_user_idx on public.predictions (user_id, created_at desc);
create index if not exists preferences_user_idx on public.preferences (user_id);
create index if not exists training_programs_user_idx on public.training_programs (user_id, created_at desc);
