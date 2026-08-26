-- Previsão de Dieta — schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase (Project → SQL Editor → New query).
-- Seguro rodar mais de uma vez: tabelas e políticas usam "if exists"/"if not exists".

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- helper: true se o usuário logado é admin — usado nas políticas abaixo para dar
-- acesso de LEITURA a todos os usuários, sem nunca permitir escrever nos dados de outra pessoa
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
-- `search_path` vazio é obrigatório em SECURITY DEFINER: sem isso, quem chama a
-- função pode manipular o search_path e fazer `profiles` resolver para uma
-- tabela sob controle dele, com os privilégios do criador da função.
set search_path = ''
as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;

alter table public.profiles enable row level security;

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

-- trava de segurança: a política de update acima não restringe colunas, então sem isso
-- qualquer usuário logado poderia rodar update profiles set is_admin=true na própria linha
-- e se promover sozinho. Este trigger reverte qualquer mudança em is_admin feita por quem
-- não é admin (a checagem interna usa is_admin(), que é security definer e ignora RLS).
-- auth.uid() só existe em requisições autenticadas do app (via PostgREST) — quando é null,
-- a query está rodando direto no SQL Editor como superusuário, um contexto já confiável,
-- então a trava não se aplica (senão você mesmo não conseguiria se marcar como admin).
create or replace function public.prevent_is_admin_escalation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not (select public.is_admin()) then
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_is_admin_escalation on public.profiles;
create trigger prevent_is_admin_escalation
  before update on public.profiles
  for each row execute procedure public.prevent_is_admin_escalation();

-- cria a linha em profiles automaticamente quando alguém se cadastra
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============ CYCLES ============
create table if not exists public.cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric not null check (weight_kg > 0 and weight_kg < 500),
  body_fat_percent numeric check (body_fat_percent is null or (body_fat_percent > 0 and body_fat_percent < 70)),
  kcal numeric not null check (kcal > 0),
  protein_g numeric not null,
  fat_g numeric not null,
  carb_g numeric not null,
  is_prediction boolean not null default false,
  created_at timestamptz not null default now()
);

-- ingestão real relatada nesse ciclo, quando diferente da prescrita (kcal) — null significa que a
-- prescrição foi seguida de perto; usado pra não calcular TDEE a partir de calorias que a pessoa não
-- comeu de verdade
alter table public.cycles add column if not exists actual_kcal numeric;

-- leitura visual por grupo muscular desse ciclo (muscleGroupAssessment da análise de foto) — guardada
-- junto do ciclo pra dar pra montar a evolução por grupo ao longo do tempo (ver muscleEvolution.ts)
alter table public.cycles add column if not exists muscle_assessment jsonb;

-- De onde veio o ciclo. Existe porque as perguntas de adesão ("você seguiu de perto as X kcal
-- prescritas?") só fazem sentido se o app REALMENTE prescreveu algo pra pessoa seguir:
--   'ia'          -> fluxo de fotos + previsão; prescrição de verdade, pergunta adesão
--   'consultoria' -> prescrição real registrada à mão; pergunta adesão
--   'estimativa'  -> calculadora rápida em /estimar; é um número de referência, não um plano
--   null          -> linha anterior a esta coluna; assume o comportamento antigo (pergunta)
-- `is_prediction` não serve pra isso: tanto o fluxo de IA quanto a calculadora marcam true.
alter table public.cycles add column if not exists origin text;

-- Estratégia prescrita neste ciclo: bulking | cutting | normocalorico. Alimenta a histerese de
-- classifyPathFromBf no ciclo seguinte — sem ela a fase é readivinhada pelo %BF sozinho e alterna
-- por ruído de leitura (ver migração 0005_cycles_path.sql).
alter table public.cycles add column if not exists path text;

alter table public.cycles enable row level security;

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

create index if not exists cycles_user_date_idx on public.cycles (user_id, date);

-- ============ DIETS ============
create table if not exists public.diets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_kcal numeric not null default 0,
  target_protein_g numeric not null default 0,
  target_fat_g numeric not null default 0,
  target_carb_g numeric not null default 0,
  meals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.diets enable row level security;

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

-- ============ ADMIN COMMENTS ============
-- recados que o admin deixa pro usuário — só admin escreve/apaga, o próprio usuário só lê
create table if not exists public.admin_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.admin_comments enable row level security;

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

create index if not exists admin_comments_user_idx on public.admin_comments (user_id, created_at);

-- ============ PREFERENCES ============
create table if not exists public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  diet_goal text not null default 'manutencao',
  activity_level text not null default 'moderado',
  meals_per_day int not null default 4,
  cooking_time text not null default 'medio',
  restrictions jsonb not null default '[]'::jsonb,
  disliked_food_ids jsonb not null default '[]'::jsonb,
  favorite_food_ids jsonb not null default '[]'::jsonb,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- dados básicos do usuário — adicionados para o assistente guiado (passo 1) não precisar
-- perguntar de novo em cada página; ficam null até o usuário passar pelo passo 1 uma vez
alter table public.preferences add column if not exists sex text;
alter table public.preferences add column if not exists height_cm numeric;
alter table public.preferences add column if not exists age int;

-- grupos musculares em prioridade agora (ex: definido pela consultoria) — usado pela divisão de treino
-- sugerida em trainingSplitBuilder.ts pra dar mais volume e ordem de prioridade na sessão
alter table public.preferences add column if not exists priority_muscles jsonb not null default '[]'::jsonb;

alter table public.preferences enable row level security;

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

-- ============ PREDICTIONS (última previsão salva) ============
create table if not exists public.predictions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  target_date date not null,
  kcal_min numeric not null,
  kcal_max numeric not null,
  protein_min numeric not null,
  protein_max numeric not null,
  fat_min numeric not null,
  fat_max numeric not null,
  carb_min numeric not null,
  carb_max numeric not null,
  weight_min numeric not null,
  weight_max numeric not null
);

alter table public.predictions enable row level security;

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

-- ============ PROGRESS PHOTOS ============
create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  date date not null,
  photo_path text not null,
  waist_cm numeric,
  neck_cm numeric,
  hip_cm numeric,
  sex text,
  estimated_bf_percent numeric,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table public.progress_photos enable row level security;

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

create index if not exists progress_photos_user_date_idx on public.progress_photos (user_id, date);

-- ============ TRAINING PROGRAMS ============
-- sessions é jsonb (array de {label, items: [{exerciseId, blocks: [{reserveType, sets, repRange, loadKg}]}]}) —
-- mesmo espírito de diets.meals ser jsonb em vez de tabelas normalizadas, consistente com o resto do app
create table if not exists public.training_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sessions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_programs enable row level security;

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

-- ============ TRAINING LOGS ============
-- registro de sessões efetivamente realizadas — sets_logged é jsonb no formato LoggedSet[] de
-- trainingVolume.ts (+ carga real por bloco); injury_note marca quando um grupo foi reduzido por lesão
-- nesse log específico, alimentando adjustLandmarkForInjury
create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid references public.training_programs(id) on delete set null,
  date date not null,
  session_label text not null,
  sets_logged jsonb not null default '[]'::jsonb,
  injury_note text,
  created_at timestamptz not null default now()
);

alter table public.training_logs enable row level security;

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

create index if not exists training_logs_user_date_idx on public.training_logs (user_id, date);

-- ============ STORAGE (bucket de fotos) ============
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "progress-photos: read own" on storage.objects;
drop policy if exists "progress-photos: read own or admin" on storage.objects;
create policy "progress-photos: read own or admin" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );
drop policy if exists "progress-photos: insert own" on storage.objects;
create policy "progress-photos: insert own" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
/* Sem esta política o Postgres nega qualquer atualização de objeto (falha fechada, nunca foi
   brecha), mas trocar a foto de uma data virava apagar-e-subir em vez de substituir. */
drop policy if exists "progress-photos: update own" on storage.objects;
create policy "progress-photos: update own" on storage.objects
  for update using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "progress-photos: delete own" on storage.objects;
create policy "progress-photos: delete own" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============ PREDICTION AUDIT (calibração contínua) ============
-- registra, a cada ciclo recorrente, fórmula vs. realidade (TDEE) e a consistência da leitura visual de
-- %BF/composição do ganho — junto com sinais de adesão já coletados, pra saber se uma divergência é
-- erro da fórmula ou só adesão ruim antes de deixar isso "aprender" e ajustar a fórmula (ver
-- src/lib/calibration.ts). Um `upsert` com `onConflict: "user_id,date"` reescreve a linha do dia quando a
-- pessoa reanalisa no mesmo dia — sem isso a constraint única abaixo rejeitava a 2ª tentativa e os dados
-- dela eram perdidos em silêncio. Fora essa reescrita pontual, a linha não é editada por nenhum outro fluxo.
create table if not exists public.prediction_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id uuid references public.cycles(id) on delete set null,
  date date not null,
  formula_tdee numeric,
  empirical_tdee numeric,
  bf_percent_visual numeric,
  bf_confidence text,
  gain_composition text,
  weight_delta_kg numeric,
  diet_clean boolean not null default false,
  training_clean boolean not null default false,
  bf_consistent boolean,
  notes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.prediction_audit enable row level security;

drop policy if exists "prediction_audit: select own or admin" on public.prediction_audit;
create policy "prediction_audit: select own or admin" on public.prediction_audit
  for select using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists "prediction_audit: insert own" on public.prediction_audit;
create policy "prediction_audit: insert own" on public.prediction_audit
  for insert with check ((select auth.uid()) = user_id);
/* O `upsert` com onConflict gera um INSERT ... ON CONFLICT DO UPDATE por baixo — sem esta política o
   RLS bloqueia o ramo de UPDATE do upsert, e reanalisar no mesmo dia voltaria a falhar (agora com erro
   de política em vez de erro de chave duplicada). Ver migração 0006_prediction_audit_update_own.sql. */
drop policy if exists "prediction_audit: update own" on public.prediction_audit;
create policy "prediction_audit: update own" on public.prediction_audit
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "prediction_audit: delete own" on public.prediction_audit;
create policy "prediction_audit: delete own" on public.prediction_audit
  for delete using ((select auth.uid()) = user_id);

-- Um ciclo auditado por dia por usuário. Sem isso, uma tentativa repetida (retry de rede, duplo clique)
-- grava duas linhas do mesmo ciclo e DOBRA o peso dele na média ponderada da calibração de TDEE.
create unique index if not exists prediction_audit_user_date_uniq on public.prediction_audit (user_id, date);

-- força o PostgREST a recarregar o cache do schema com as tabelas/colunas novas
notify pgrst, 'reload schema';

-- ============ MARQUE VOCÊ MESMO COMO ADMIN ============
-- Depois de rodar o script inteiro, rode esta linha separadamente (troque o email):
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'seu-email@aqui.com');

-- ---------------------------------------------------------------------------
-- Migração incremental (rodar no SQL Editor sobre um banco que já existe)
-- ---------------------------------------------------------------------------
-- As restrições acima só valem para bancos criados do zero, porque as tabelas usam
-- "create table if not exists". Para aplicar num banco existente:

-- Memória qualitativa entre ciclos e confronto do plano com a realidade.
-- `bf_reasoning`/`evolution_note`: o que a IA de visão CONCLUIU naquele ciclo. Era exibido e descartado,
--   então no ciclo seguinte o modelo recebia só o histórico numérico e não podia comparar com a própria
--   leitura anterior ("no ciclo passado achei o ombro atrás; melhorou?").
-- `plano_projetado`: recorte do plano de fases gerado naquele ciclo, pra o ciclo seguinte poder dizer
--   "o plano previa 16% no mês 4, você está em 17,2%". Sem isso o plano era regenerado do zero toda vez
--   e nunca era confrontado com o que de fato aconteceu.
alter table public.prediction_audit add column if not exists bf_reasoning text;
alter table public.prediction_audit add column if not exists evolution_note text;
alter table public.prediction_audit add column if not exists plano_projetado jsonb;

alter table public.cycles drop constraint if exists cycles_weight_kg_check;
alter table public.cycles add constraint cycles_weight_kg_check check (weight_kg > 0 and weight_kg < 500);

alter table public.cycles drop constraint if exists cycles_body_fat_percent_check;
alter table public.cycles add constraint cycles_body_fat_percent_check
  check (body_fat_percent is null or (body_fat_percent > 0 and body_fat_percent < 70));

alter table public.cycles drop constraint if exists cycles_kcal_check;
alter table public.cycles add constraint cycles_kcal_check check (kcal > 0);

-- Deduplica antes de criar o índice único (mantém a linha mais recente de cada dia)
delete from public.prediction_audit a
  using public.prediction_audit b
  where a.user_id = b.user_id and a.date = b.date and a.created_at < b.created_at;

create unique index if not exists prediction_audit_user_date_uniq on public.prediction_audit (user_id, date);

-- ============================================================================
-- ADMIN COM PODER DE ESCRITA TOTAL  (2026-08-21)
--
-- Até aqui o admin LIA tudo (todas as tabelas já tinham "select own or admin")
-- e escrevia só em `diets`, `training_programs` e `admin_comments`. Ciclos,
-- preferências, logs de treino, previsões e fotos eram somente leitura para
-- ele — a tela de admin mostrava o histórico do usuário sem poder corrigir.
--
-- Estas políticas estendem update/delete/insert do administrador às tabelas
-- que faltavam. O `insert` importa para o admin poder CRIAR em nome de alguém
-- (ex: lançar o ciclo de uma consultoria que chegou por fora do app).
--
-- A checagem é `(select public.is_admin())`, que lê `profiles.is_admin` do usuário
-- autenticado — a autorização mora no BANCO, não no cliente. Uma tela de admin
-- alcançada indevidamente continua esbarrando aqui.
-- ============================================================================

-- cycles
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

-- preferences
drop policy if exists "preferences: insert own" on public.preferences;
drop policy if exists "preferences: insert own or admin" on public.preferences;
create policy "preferences: insert own or admin" on public.preferences
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "preferences: update own" on public.preferences;
drop policy if exists "preferences: update own or admin" on public.preferences;
create policy "preferences: update own or admin" on public.preferences
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

-- training_logs
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

-- training_programs: faltava o insert (update/delete já eram do admin)
drop policy if exists "training_programs: insert own" on public.training_programs;
drop policy if exists "training_programs: insert own or admin" on public.training_programs;
create policy "training_programs: insert own or admin" on public.training_programs
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

-- diets: faltava o insert (update/delete já eram do admin)
drop policy if exists "diets: insert own" on public.diets;
drop policy if exists "diets: insert own or admin" on public.diets;
create policy "diets: insert own or admin" on public.diets
  for insert with check ((select auth.uid()) = user_id or (select public.is_admin()));

-- predictions
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

-- progress_photos
drop policy if exists "progress_photos: update own" on public.progress_photos;
drop policy if exists "progress_photos: update own or admin" on public.progress_photos;
create policy "progress_photos: update own or admin" on public.progress_photos
  for update using ((select auth.uid()) = user_id or (select public.is_admin()));

drop policy if exists "progress_photos: delete own" on public.progress_photos;
drop policy if exists "progress_photos: delete own or admin" on public.progress_photos;
create policy "progress_photos: delete own or admin" on public.progress_photos
  for delete using ((select auth.uid()) = user_id or (select public.is_admin()));

-- profiles: admin pode corrigir o nome de alguém (e promover outro admin)
drop policy if exists "profiles: update own" on public.profiles;
drop policy if exists "profiles: update own or admin" on public.profiles;
create policy "profiles: update own or admin" on public.profiles
  for update using ((select auth.uid()) = id or (select public.is_admin()));

notify pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICES QUE FALTAVAM EM user_id  (2026-08-24)
--
-- Toda política de RLS deste schema filtra por `user_id`, e cinco tabelas não
-- tinham índice nessa coluna: o Postgres varria a tabela inteira para decidir
-- quais linhas o usuário pode ver. Regra da skill oficial da Supabase:
-- "always add indexes on columns used in RLS policies".
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists diets_user_idx on public.diets (user_id, created_at desc);
create index if not exists prediction_audit_user_date_idx on public.prediction_audit (user_id, date);
create index if not exists predictions_user_idx on public.predictions (user_id, created_at desc);
create index if not exists preferences_user_idx on public.preferences (user_id);
create index if not exists training_programs_user_idx on public.training_programs (user_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- %BF MEDIDO POR EXAME  (2026-08-21)
--
-- Quem fez DEXA, bioimpedância ou adipometria tem um número melhor que a
-- estimativa por foto, e usar a estimativa nesse caso é jogar informação fora.
-- Mas o Claude CONTINUA estimando mesmo assim, e as duas leituras ficam
-- gravadas lado a lado: cada exame vira um ponto de aferição da leitura visual,
-- do mesmo jeito que `prediction_audit` já confronta TDEE previsto × realizado.
--
-- Sem guardar as duas, não há como saber se a estimativa por foto tem viés
-- (corrigível) ou só ruído (não corrigível).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.cycles add column if not exists bf_medido_percent numeric
  check (bf_medido_percent is null or (bf_medido_percent > 0 and bf_medido_percent < 70));
alter table public.cycles add column if not exists bf_medido_metodo text
  check (bf_medido_metodo is null or bf_medido_metodo in ('dexa','bioimpedancia','adipometria','ultrassom','outro'));

alter table public.prediction_audit add column if not exists bf_medido_percent numeric;
alter table public.prediction_audit add column if not exists bf_medido_metodo text;
-- erro com SINAL (estimado − medido): o sinal é o que distingue viés de ruído
alter table public.prediction_audit add column if not exists bf_erro_pp numeric;

notify pgrst, 'reload schema';
