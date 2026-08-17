-- Previsão de Dieta — schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase (Project → SQL Editor → New query).
-- Seguro rodar mais de uma vez: tabelas e políticas usam "if exists"/"if not exists".

-- ============ PROFILES ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);

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
create policy "cycles: all own" on public.cycles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "diets: all own" on public.diets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "preferences: all own" on public.preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "predictions: all own" on public.predictions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

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
create policy "progress_photos: all own" on public.progress_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists progress_photos_user_date_idx on public.progress_photos (user_id, date);

-- ============ STORAGE (bucket de fotos) ============
insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "progress-photos: read own" on storage.objects;
create policy "progress-photos: read own" on storage.objects
  for select using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress-photos: insert own" on storage.objects;
create policy "progress-photos: insert own" on storage.objects
  for insert with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "progress-photos: delete own" on storage.objects;
create policy "progress-photos: delete own" on storage.objects
  for delete using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- força o PostgREST a recarregar o cache do schema com as tabelas novas
notify pgrst, 'reload schema';
