-- =============================================================
-- WIW — Fase 2: Mi Armario
-- Esquema: wardrobes + clothing_items, con RLS y GRANTS.
-- Ejecutar en SQL Editor de Supabase.
-- =============================================================

-- Enums --------------------------------------------------------
do $$ begin
  create type public.clothing_category as enum (
    'tops','bottoms','dresses','outerwear','shoes','accessories','bags','underwear','sportswear','other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clothing_season as enum ('spring','summer','fall','winter','all');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.clothing_visibility as enum ('private','friends','public');
exception when duplicate_object then null; end $$;

-- Wardrobes ----------------------------------------------------
create table if not exists public.wardrobes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mi Armario',
  is_default boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wardrobes_user_id_idx on public.wardrobes(user_id);

grant select, insert, update, delete on public.wardrobes to authenticated;
grant all on public.wardrobes to service_role;

alter table public.wardrobes enable row level security;

drop policy if exists "wardrobes_select_own" on public.wardrobes;
create policy "wardrobes_select_own" on public.wardrobes
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "wardrobes_insert_own" on public.wardrobes;
create policy "wardrobes_insert_own" on public.wardrobes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "wardrobes_update_own" on public.wardrobes;
create policy "wardrobes_update_own" on public.wardrobes
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "wardrobes_delete_own" on public.wardrobes;
create policy "wardrobes_delete_own" on public.wardrobes
  for delete to authenticated using (auth.uid() = user_id);

-- Clothing items ----------------------------------------------
create table if not exists public.clothing_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wardrobe_id uuid not null references public.wardrobes(id) on delete cascade,

  name text,
  category public.clothing_category not null,
  subcategory text,
  color text,
  secondary_color text,
  brand text,
  size text,
  material text,
  price_cents integer,
  currency text default 'EUR',
  purchase_date date,

  seasons public.clothing_season[] not null default '{all}',
  occasions text[] not null default '{}',
  tags text[] not null default '{}',
  notes text,

  image_url text,
  background_removed_image_url text,
  storage_path text,
  similarity_hash text,

  visibility public.clothing_visibility not null default 'private',
  times_worn integer not null default 0,
  last_worn_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clothing_items_user_idx on public.clothing_items(user_id);
create index if not exists clothing_items_wardrobe_idx on public.clothing_items(wardrobe_id);
create index if not exists clothing_items_category_idx on public.clothing_items(category);
create index if not exists clothing_items_last_worn_idx on public.clothing_items(last_worn_at);

grant select, insert, update, delete on public.clothing_items to authenticated;
grant all on public.clothing_items to service_role;

alter table public.clothing_items enable row level security;

drop policy if exists "clothing_items_select_own" on public.clothing_items;
create policy "clothing_items_select_own" on public.clothing_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "clothing_items_insert_own" on public.clothing_items;
create policy "clothing_items_insert_own" on public.clothing_items
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "clothing_items_update_own" on public.clothing_items;
create policy "clothing_items_update_own" on public.clothing_items
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "clothing_items_delete_own" on public.clothing_items;
create policy "clothing_items_delete_own" on public.clothing_items
  for delete to authenticated using (auth.uid() = user_id);

-- updated_at trigger ------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists wardrobes_set_updated_at on public.wardrobes;
create trigger wardrobes_set_updated_at before update on public.wardrobes
  for each row execute function public.set_updated_at();

drop trigger if exists clothing_items_set_updated_at on public.clothing_items;
create trigger clothing_items_set_updated_at before update on public.clothing_items
  for each row execute function public.set_updated_at();

-- Auto-crear armario por defecto al registrarse ---------------
create or replace function public.handle_new_user_wardrobe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wardrobes (user_id, name, is_default)
  values (new.id, 'Mi Armario', true)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created_wardrobe on auth.users;
create trigger on_auth_user_created_wardrobe
  after insert on auth.users
  for each row execute function public.handle_new_user_wardrobe();

-- Backfill: crea wardrobe por defecto para usuarios existentes
insert into public.wardrobes (user_id, name, is_default)
select u.id, 'Mi Armario', true
from auth.users u
left join public.wardrobes w on w.user_id = u.id
where w.id is null;
