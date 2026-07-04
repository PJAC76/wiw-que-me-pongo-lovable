
-- Roles
do $$ begin
  create type public.app_role as enum ('admin','user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
drop policy if exists "user_roles_select_self" on public.user_roles;
create policy "user_roles_select_self" on public.user_roles
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

-- Enums prenda
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

-- Wardrobes
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
create policy "wardrobes_select_own" on public.wardrobes for select to authenticated using (auth.uid() = user_id);
drop policy if exists "wardrobes_insert_own" on public.wardrobes;
create policy "wardrobes_insert_own" on public.wardrobes for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "wardrobes_update_own" on public.wardrobes;
create policy "wardrobes_update_own" on public.wardrobes for update to authenticated using (auth.uid() = user_id);
drop policy if exists "wardrobes_delete_own" on public.wardrobes;
create policy "wardrobes_delete_own" on public.wardrobes for delete to authenticated using (auth.uid() = user_id);

-- Clothing items
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
  background_removed_storage_path text,
  background_processed_at timestamptz,
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
create policy "clothing_items_select_own" on public.clothing_items for select to authenticated using (auth.uid() = user_id);
drop policy if exists "clothing_items_insert_own" on public.clothing_items;
create policy "clothing_items_insert_own" on public.clothing_items for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "clothing_items_update_own" on public.clothing_items;
create policy "clothing_items_update_own" on public.clothing_items for update to authenticated using (auth.uid() = user_id);
drop policy if exists "clothing_items_delete_own" on public.clothing_items;
create policy "clothing_items_delete_own" on public.clothing_items for delete to authenticated using (auth.uid() = user_id);

-- updated_at trigger genérico
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists wardrobes_set_updated_at on public.wardrobes;
create trigger wardrobes_set_updated_at before update on public.wardrobes
  for each row execute function public.set_updated_at();
drop trigger if exists clothing_items_set_updated_at on public.clothing_items;
create trigger clothing_items_set_updated_at before update on public.clothing_items
  for each row execute function public.set_updated_at();

-- Auto-crear armario por defecto al registrarse
create or replace function public.handle_new_user_wardrobe()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.wardrobes (user_id, name, is_default)
  values (new.id, 'Mi Armario', true) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created_wardrobe on auth.users;
create trigger on_auth_user_created_wardrobe
  after insert on auth.users for each row execute function public.handle_new_user_wardrobe();

-- App settings
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
grant select on public.app_settings to authenticated;
grant all on public.app_settings to service_role;
alter table public.app_settings enable row level security;
drop policy if exists "admins read app_settings" on public.app_settings;
create policy "admins read app_settings" on public.app_settings for select to authenticated
  using (public.has_role(auth.uid(), 'admin'));
drop policy if exists "admins write app_settings" on public.app_settings;
create policy "admins write app_settings" on public.app_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

insert into public.app_settings (key, value, description) values (
  'ai_detection',
  jsonb_build_object(
    'model','google/gemini-3-flash-preview',
    'temperature',0.2,
    'max_output_tokens',800,
    'background_removal_enabled',true,
    'background_removal_provider','none',
    'similarity_hash_enabled',true
  ),
  'AI detection config'
) on conflict (key) do nothing;

-- =============================================================
-- NUEVO: outfit_logs — historial diario
-- =============================================================
create table if not exists public.outfit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worn_on date not null default current_date,
  occasions text[] not null default '{}',
  item_ids uuid[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists outfit_logs_user_worn_idx on public.outfit_logs(user_id, worn_on desc);
create index if not exists outfit_logs_occasions_gin on public.outfit_logs using gin (occasions);
create index if not exists outfit_logs_items_gin on public.outfit_logs using gin (item_ids);

grant select, insert, update, delete on public.outfit_logs to authenticated;
grant all on public.outfit_logs to service_role;

alter table public.outfit_logs enable row level security;
drop policy if exists "outfit_logs_select_own" on public.outfit_logs;
create policy "outfit_logs_select_own" on public.outfit_logs for select to authenticated using (auth.uid() = user_id);
drop policy if exists "outfit_logs_insert_own" on public.outfit_logs;
create policy "outfit_logs_insert_own" on public.outfit_logs for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "outfit_logs_update_own" on public.outfit_logs;
create policy "outfit_logs_update_own" on public.outfit_logs for update to authenticated using (auth.uid() = user_id);
drop policy if exists "outfit_logs_delete_own" on public.outfit_logs;
create policy "outfit_logs_delete_own" on public.outfit_logs for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists outfit_logs_set_updated_at on public.outfit_logs;
create trigger outfit_logs_set_updated_at before update on public.outfit_logs
  for each row execute function public.set_updated_at();

-- Storage bucket policies (bucket se crea aparte)
drop policy if exists "wardrobe_images_select_own" on storage.objects;
create policy "wardrobe_images_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'wardrobe-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "wardrobe_images_insert_own" on storage.objects;
create policy "wardrobe_images_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'wardrobe-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "wardrobe_images_update_own" on storage.objects;
create policy "wardrobe_images_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'wardrobe-images' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "wardrobe_images_delete_own" on storage.objects;
create policy "wardrobe_images_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'wardrobe-images' and auth.uid()::text = (storage.foldername(name))[1]);
