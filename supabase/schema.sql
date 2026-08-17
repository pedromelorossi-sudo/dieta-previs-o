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
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
drop policy if exists "profiles: select own or admin" on public.profiles;
create policy "profiles: select own or admin" on public.profiles
  for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

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
     and not public.is_admin() then
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
  weight_kg numeric not null,
  body_fat_percent numeric,
  kcal numeric not null,
  protein_g numeric not null,
  fat_g numeric not null,
  carb_g numeric not null,
  is_prediction boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.cycles enable row level security;

drop policy if exists "cycles: all own" on public.cycles;
drop policy if exists "cycles: select own or admin" on public.cycles;
create policy "cycles: select own or admin" on public.cycles
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "cycles: insert own" on public.cycles;
create policy "cycles: insert own" on public.cycles
  for insert with check (auth.uid() = user_id);
drop policy if exists "cycles: update own" on public.cycles;
create policy "cycles: update own" on public.cycles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cycles: delete own" on public.cycles;
create policy "cycles: delete own" on public.cycles
  for delete using (auth.uid() = user_id);

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
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "diets: insert own" on public.diets;
create policy "diets: insert own" on public.diets
  for insert with check (auth.uid() = user_id);
drop policy if exists "diets: update own" on public.diets;
create policy "diets: update own" on public.diets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "diets: delete own" on public.diets;
create policy "diets: delete own" on public.diets
  for delete using (auth.uid() = user_id);

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

alter table public.preferences enable row level security;

drop policy if exists "preferences: all own" on public.preferences;
drop policy if exists "preferences: select own or admin" on public.preferences;
create policy "preferences: select own or admin" on public.preferences
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "preferences: insert own" on public.preferences;
create policy "preferences: insert own" on public.preferences
  for insert with check (auth.uid() = user_id);
drop policy if exists "preferences: update own" on public.preferences;
create policy "preferences: update own" on public.preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "preferences: delete own" on public.preferences;
create policy "preferences: delete own" on public.preferences
  for delete using (auth.uid() = user_id);

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
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "predictions: insert own" on public.predictions;
create policy "predictions: insert own" on public.predictions
  for insert with check (auth.uid() = user_id);
drop policy if exists "predictions: update own" on public.predictions;
create policy "predictions: update own" on public.predictions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "predictions: delete own" on public.predictions;
create policy "predictions: delete own" on public.predictions
  for delete using (auth.uid() = user_id);

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
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "progress_photos: insert own" on public.progress_photos;
create policy "progress_photos: insert own" on public.progress_photos
  for insert with check (auth.uid() = user_id);
drop policy if exists "progress_photos: update own" on public.progress_photos;
create policy "progress_photos: update own" on public.progress_photos
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "progress_photos: delete own" on public.progress_photos;
create policy "progress_photos: delete own" on public.progress_photos
  for delete using (auth.uid() = user_id);

create index if not exists progress_photos_user_date_idx on public.progress_photos (user_id, date);

-- ============ STORAGE (bucket de fotos) ============
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "progress-photos: read own" on storage.objects;
drop policy if exists "progress-photos: read own or admin" on storage.objects;
create policy "progress-photos: read own or admin" on storage.objects
  for select using (
    bucket_id = 'progress-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
drop policy if exists "progress-photos: insert own" on storage.objects;
create policy "progress-photos: insert own" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress-photos: delete own" on storage.objects;
create policy "progress-photos: delete own" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- força o PostgREST a recarregar o cache do schema com as tabelas/colunas novas
notify pgrst, 'reload schema';

-- ============ MARQUE VOCÊ MESMO COMO ADMIN ============
-- Depois de rodar o script inteiro, rode esta linha separadamente (troque o email):
-- update public.profiles set is_admin = true
--   where id = (select id from auth.users where email = 'seu-email@aqui.com');
