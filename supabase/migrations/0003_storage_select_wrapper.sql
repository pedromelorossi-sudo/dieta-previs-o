-- 0003 — as políticas do STORAGE também precisam do (select …)
--
-- A migração 0001 corrigiu as 38 políticas do schema `public` e deixou as três
-- do bucket de fotos de fora: minha extração filtrava por `on public.<tabela>`,
-- e as de storage são `on storage.objects`. Mesmo problema, mesmo custo — e
-- aqui pesa na listagem de fotos, que é justamente onde há muitas linhas.
--
-- Também acrescenta a política de UPDATE, que não existia. Sem ela o Postgres
-- nega qualquer atualização de objeto (falha fechada, então nunca foi brecha),
-- mas trocar a foto de uma data virava apagar-e-subir em vez de substituir.

drop policy if exists "progress-photos: read own" on storage.objects;
drop policy if exists "progress-photos: read own or admin" on storage.objects;
create policy "progress-photos: read own or admin" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

drop policy if exists "progress-photos: insert own" on storage.objects;
create policy "progress-photos: insert own" on storage.objects
  for insert with check (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "progress-photos: update own" on storage.objects;
create policy "progress-photos: update own" on storage.objects
  for update using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "progress-photos: delete own" on storage.objects;
create policy "progress-photos: delete own" on storage.objects
  for delete using (
    bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
