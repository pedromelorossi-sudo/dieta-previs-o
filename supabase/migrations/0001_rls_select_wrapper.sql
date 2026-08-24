-- 0001 — RLS com chamadas de função envolvidas em (select …)
--
-- Regra da skill oficial da Supabase: `auth.uid()` e funções chamadas direto
-- numa política são executadas UMA VEZ POR LINHA. Envolvidas em `(select …)`,
-- o Postgres avalia uma vez e reutiliza — a própria documentação mede 5 a 10×
-- de diferença.
--
-- No caso deste banco o efeito é maior que o normal, porque `is_admin()` faz
-- uma CONSULTA na tabela `profiles`: sem o wrapper, ler 1.000 ciclos disparava
-- 1.000 consultas em profiles só para decidir a visibilidade.
--
-- Também trava o `search_path` da função SECURITY DEFINER: sem isso, quem chama
-- pode manipular o search_path e fazer `public.profiles` resolver para uma
-- tabela sob controle dele, executada com os privilégios do criador da função.

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

drop policy if exists "profiles: select own" on public.profiles;
drop policy if exists "profiles: select own or admin" on public.profiles;
create policy "profiles: select own or admin" on public.profiles
  for select using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using ((select auth.uid()) = id);

drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check ((select auth.uid()) = id);

drop policy if exists "cycles: all own" on public.cycles;
drop policy if exists "cycles: select own or admin" on public.cycles;
create policy "cycles: select own or admin" on public.cycles
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "cycles: insert own" on public.cycles;
create policy "cycles: insert own" on public.cycles
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "cycles: update own" on public.cycles;
create policy "cycles: update own" on public.cycles
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cycles: delete own" on public.cycles;
create policy "cycles: delete own" on public.cycles
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "diets: all own" on public.diets;
drop policy if exists "diets: select own or admin" on public.diets;
create policy "diets: select own or admin" on public.diets
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "diets: insert own" on public.diets;
create policy "diets: insert own" on public.diets
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "diets: update own" on public.diets;
drop policy if exists "diets: update own or admin" on public.diets;
create policy "diets: update own or admin" on public.diets
  for update using ((select auth.uid()) = user_id or (select public.is_admin())) with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "diets: delete own" on public.diets;
drop policy if exists "diets: delete own or admin" on public.diets;
create policy "diets: delete own or admin" on public.diets
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "admin_comments: select own or admin" on public.admin_comments;
create policy "admin_comments: select own or admin" on public.admin_comments
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "admin_comments: admin insert" on public.admin_comments;
create policy "admin_comments: admin insert" on public.admin_comments
  for insert with check ((select public.is_admin()));

drop policy if exists "admin_comments: admin update" on public.admin_comments;
create policy "admin_comments: admin update" on public.admin_comments
  for update using ((select public.is_admin()));

drop policy if exists "admin_comments: admin delete" on public.admin_comments;
create policy "admin_comments: admin delete" on public.admin_comments
  for delete using ((select public.is_admin()));

drop policy if exists "preferences: all own" on public.preferences;
drop policy if exists "preferences: select own or admin" on public.preferences;
create policy "preferences: select own or admin" on public.preferences
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "preferences: insert own" on public.preferences;
create policy "preferences: insert own" on public.preferences
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "preferences: update own" on public.preferences;
create policy "preferences: update own" on public.preferences
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "preferences: delete own" on public.preferences;
create policy "preferences: delete own" on public.preferences
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "predictions: all own" on public.predictions;
drop policy if exists "predictions: select own or admin" on public.predictions;
create policy "predictions: select own or admin" on public.predictions
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "predictions: insert own" on public.predictions;
create policy "predictions: insert own" on public.predictions
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "predictions: update own" on public.predictions;
create policy "predictions: update own" on public.predictions
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "predictions: delete own" on public.predictions;
create policy "predictions: delete own" on public.predictions
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "progress_photos: all own" on public.progress_photos;
drop policy if exists "progress_photos: select own or admin" on public.progress_photos;
create policy "progress_photos: select own or admin" on public.progress_photos
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "progress_photos: insert own" on public.progress_photos;
create policy "progress_photos: insert own" on public.progress_photos
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "progress_photos: update own" on public.progress_photos;
create policy "progress_photos: update own" on public.progress_photos
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "progress_photos: delete own" on public.progress_photos;
create policy "progress_photos: delete own" on public.progress_photos
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "training_programs: select own or admin" on public.training_programs;
create policy "training_programs: select own or admin" on public.training_programs
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_programs: insert own" on public.training_programs;
create policy "training_programs: insert own" on public.training_programs
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "training_programs: update own or admin" on public.training_programs;
create policy "training_programs: update own or admin" on public.training_programs
  for update using ((select auth.uid()) = user_id or (select public.is_admin())) with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_programs: delete own or admin" on public.training_programs;
create policy "training_programs: delete own or admin" on public.training_programs
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_logs: select own or admin" on public.training_logs;
create policy "training_logs: select own or admin" on public.training_logs
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_logs: insert own" on public.training_logs;
create policy "training_logs: insert own" on public.training_logs
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "training_logs: update own" on public.training_logs;
create policy "training_logs: update own" on public.training_logs
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "training_logs: delete own" on public.training_logs;
create policy "training_logs: delete own" on public.training_logs
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "prediction_audit: select own or admin" on public.prediction_audit;
create policy "prediction_audit: select own or admin" on public.prediction_audit
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "prediction_audit: insert own" on public.prediction_audit;
create policy "prediction_audit: insert own" on public.prediction_audit
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "prediction_audit: delete own" on public.prediction_audit;
create policy "prediction_audit: delete own" on public.prediction_audit
  for delete using ((select auth.uid()) = user_id);

drop policy if exists "cycles: update own" on public.cycles;
drop policy if exists "cycles: update own or admin" on public.cycles;
create policy "cycles: update own or admin" on public.cycles
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "cycles: delete own" on public.cycles;
drop policy if exists "cycles: delete own or admin" on public.cycles;
create policy "cycles: delete own or admin" on public.cycles
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "cycles: insert own" on public.cycles;
drop policy if exists "cycles: insert own or admin" on public.cycles;
create policy "cycles: insert own or admin" on public.cycles
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "preferences: insert own" on public.preferences;
drop policy if exists "preferences: insert own or admin" on public.preferences;
create policy "preferences: insert own or admin" on public.preferences
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "preferences: update own" on public.preferences;
drop policy if exists "preferences: update own or admin" on public.preferences;
create policy "preferences: update own or admin" on public.preferences
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_logs: insert own" on public.training_logs;
drop policy if exists "training_logs: insert own or admin" on public.training_logs;
create policy "training_logs: insert own or admin" on public.training_logs
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_logs: update own" on public.training_logs;
drop policy if exists "training_logs: update own or admin" on public.training_logs;
create policy "training_logs: update own or admin" on public.training_logs
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_logs: delete own" on public.training_logs;
drop policy if exists "training_logs: delete own or admin" on public.training_logs;
create policy "training_logs: delete own or admin" on public.training_logs
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "training_programs: insert own" on public.training_programs;
drop policy if exists "training_programs: insert own or admin" on public.training_programs;
create policy "training_programs: insert own or admin" on public.training_programs
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "diets: insert own" on public.diets;
drop policy if exists "diets: insert own or admin" on public.diets;
create policy "diets: insert own or admin" on public.diets
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "predictions: insert own" on public.predictions;
drop policy if exists "predictions: insert own or admin" on public.predictions;
create policy "predictions: insert own or admin" on public.predictions
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "predictions: update own" on public.predictions;
drop policy if exists "predictions: update own or admin" on public.predictions;
create policy "predictions: update own or admin" on public.predictions
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "predictions: delete own" on public.predictions;
drop policy if exists "predictions: delete own or admin" on public.predictions;
create policy "predictions: delete own or admin" on public.predictions
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "progress_photos: update own" on public.progress_photos;
drop policy if exists "progress_photos: update own or admin" on public.progress_photos;
create policy "progress_photos: update own or admin" on public.progress_photos
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "progress_photos: delete own" on public.progress_photos;
drop policy if exists "progress_photos: delete own or admin" on public.progress_photos;
create policy "progress_photos: delete own or admin" on public.progress_photos
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update using ((select auth.uid()) = id or (select public.is_admin()));

notify pgrst, 'reload schema';
