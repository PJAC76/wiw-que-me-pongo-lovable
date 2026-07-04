
create extension if not exists citext;

------------------------------------------------------------
-- 1) profiles
------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  display_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$')
);

grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;

alter table public.profiles enable row level security;

create policy "profiles readable by anyone"
  on public.profiles for select
  to anon, authenticated using (true);

create policy "users update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "users insert own profile"
  on public.profiles for insert
  to authenticated with check (auth.uid() = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 2) trigger: crear profile + wardrobe al registrarse un usuario
------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base_username text;
begin
  base_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  insert into public.profiles (id, username, display_name)
  values (new.id, base_username,
          coalesce(new.raw_user_meta_data->>'display_name', base_username))
  on conflict (id) do nothing;
  insert into public.wardrobes (user_id, name, is_default)
  values (new.id, 'Mi Armario', true) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill perfiles para usuarios existentes
insert into public.profiles (id, username, display_name)
select u.id,
       'user_' || substr(replace(u.id::text, '-', ''), 1, 8),
       'user_' || substr(replace(u.id::text, '-', ''), 1, 8)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict do nothing;

------------------------------------------------------------
-- 3) public_outfits
------------------------------------------------------------
create table public.public_outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid references public.outfit_logs(id) on delete set null,
  image_url text not null,
  image_path text,
  title text,
  occasions text[] not null default '{}',
  item_ids uuid[] not null default '{}',
  is_hidden boolean not null default false,
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index public_outfits_feed_idx
  on public.public_outfits (published_at desc) where is_hidden = false;
create index public_outfits_user_idx
  on public.public_outfits (user_id, published_at desc);

grant select on public.public_outfits to anon, authenticated;
grant insert, update, delete on public.public_outfits to authenticated;
grant all on public.public_outfits to service_role;

alter table public.public_outfits enable row level security;

create policy "public outfits visible when not hidden"
  on public.public_outfits for select
  to anon, authenticated using (is_hidden = false);

create policy "owners see all their outfits"
  on public.public_outfits for select
  to authenticated using (auth.uid() = user_id);

create policy "owners publish outfits"
  on public.public_outfits for insert
  to authenticated with check (auth.uid() = user_id);

create policy "owners update outfits"
  on public.public_outfits for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "owners delete outfits"
  on public.public_outfits for delete
  to authenticated using (auth.uid() = user_id);

create trigger public_outfits_set_updated_at
  before update on public.public_outfits
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 4) outfit_votes
------------------------------------------------------------
create table public.outfit_votes (
  public_outfit_id uuid not null references public.public_outfits(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  score int not null check (score between 0 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (public_outfit_id, voter_id)
);

create index outfit_votes_outfit_idx on public.outfit_votes (public_outfit_id);
create index outfit_votes_voter_idx on public.outfit_votes (voter_id);

grant select on public.outfit_votes to anon, authenticated;
grant insert, update, delete on public.outfit_votes to authenticated;
grant all on public.outfit_votes to service_role;

alter table public.outfit_votes enable row level security;

create policy "votes readable by all"
  on public.outfit_votes for select
  to anon, authenticated using (true);

create policy "users cast own votes on others outfits"
  on public.outfit_votes for insert
  to authenticated with check (
    auth.uid() = voter_id
    and exists (
      select 1 from public.public_outfits po
      where po.id = public_outfit_id
        and po.user_id <> auth.uid()
        and po.is_hidden = false
    )
  );

create policy "users update own votes"
  on public.outfit_votes for update
  to authenticated using (auth.uid() = voter_id) with check (auth.uid() = voter_id);

create policy "users delete own votes"
  on public.outfit_votes for delete
  to authenticated using (auth.uid() = voter_id);

create trigger outfit_votes_set_updated_at
  before update on public.outfit_votes
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- 5) outfit_favorites
------------------------------------------------------------
create table public.outfit_favorites (
  public_outfit_id uuid not null references public.public_outfits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (public_outfit_id, user_id)
);

create index outfit_favorites_user_idx on public.outfit_favorites (user_id, created_at desc);

grant select, insert, delete on public.outfit_favorites to authenticated;
grant all on public.outfit_favorites to service_role;

alter table public.outfit_favorites enable row level security;

create policy "users see own favorites"
  on public.outfit_favorites for select
  to authenticated using (auth.uid() = user_id);

create policy "users add own favorites"
  on public.outfit_favorites for insert
  to authenticated with check (auth.uid() = user_id);

create policy "users remove own favorites"
  on public.outfit_favorites for delete
  to authenticated using (auth.uid() = user_id);

------------------------------------------------------------
-- 6) follows
------------------------------------------------------------
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint follows_no_self check (follower_id <> followee_id)
);

create index follows_followee_idx on public.follows (followee_id);

grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant all on public.follows to service_role;

alter table public.follows enable row level security;

create policy "follows readable by all"
  on public.follows for select
  to anon, authenticated using (true);

create policy "users create own follow"
  on public.follows for insert
  to authenticated with check (auth.uid() = follower_id);

create policy "users remove own follow"
  on public.follows for delete
  to authenticated using (auth.uid() = follower_id);

------------------------------------------------------------
-- 7) Vista de estadísticas para el feed
------------------------------------------------------------
create or replace view public.public_outfit_stats
with (security_invoker = true) as
select
  po.id as public_outfit_id,
  coalesce(avg(v.score)::numeric(4,2), 0)::float as avg_score,
  count(v.voter_id)::int as votes_count,
  (select count(*)::int from public.outfit_favorites f where f.public_outfit_id = po.id) as favorites_count
from public.public_outfits po
left join public.outfit_votes v on v.public_outfit_id = po.id
group by po.id;

grant select on public.public_outfit_stats to anon, authenticated;
