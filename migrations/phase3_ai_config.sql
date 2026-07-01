-- Phase 3 — AI detection config
-- Runtime-editable settings for the AI clothing detection pipeline.
-- Stored as a single-row JSONB per key so we can tweak the model,
-- temperature and vocabularies without a redeploy.

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

-- Only admins can read/write settings from the client.
-- Server code uses service_role and bypasses RLS.
drop policy if exists "admins read app_settings" on public.app_settings;
create policy "admins read app_settings"
on public.app_settings for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admins write app_settings" on public.app_settings;
create policy "admins write app_settings"
on public.app_settings for all
to authenticated
using (public.has_role(auth.uid(), 'admin'))
with check (public.has_role(auth.uid(), 'admin'));

create or replace function public.touch_app_settings()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists trg_touch_app_settings on public.app_settings;
create trigger trg_touch_app_settings
before update on public.app_settings
for each row execute function public.touch_app_settings();

-- Seed AI detection config. Update via:
--   update public.app_settings set value = value || '{"temperature":0.1}'::jsonb where key = 'ai_detection';
insert into public.app_settings (key, value, description)
values (
  'ai_detection',
  jsonb_build_object(
    'model', 'google/gemini-3-flash-preview',
    'temperature', 0.2,
    'max_output_tokens', 800,
    'background_removal_enabled', true,
    'background_removal_provider', 'none',
    'similarity_hash_enabled', true,
    'allowed_categories', jsonb_build_array(
      'tops','bottoms','dresses','outerwear','shoes',
      'accessories','bags','underwear','sportswear','other'
    ),
    'allowed_seasons', jsonb_build_array('spring','summer','fall','winter','all'),
    'allowed_occasions', jsonb_build_array(
      'casual','trabajo','formal','deporte','fiesta','playa','viaje','hogar'
    ),
    'allowed_colors', jsonb_build_array(
      'negro','blanco','gris','beige','marrón','azul','azul marino',
      'verde','oliva','rojo','burdeos','rosa','morado','amarillo',
      'naranja','crema','camel','multicolor'
    ),
    'system_prompt',
      'Eres un asistente experto en moda. Analiza la imagen de una prenda y devuelve SOLO JSON válido con los campos: category, subcategory, primary_color, secondary_colors[], season, occasions[], material, pattern, brand_guess, confidence (0-1). Usa únicamente valores de las listas permitidas que te doy. Si no puedes inferir un campo, usa null.',
    'user_prompt_template',
      'Detecta la prenda en la imagen. Categorías permitidas: {{categories}}. Colores: {{colors}}. Temporadas: {{seasons}}. Ocasiones: {{occasions}}. Responde solo JSON.'
  ),
  'Parámetros del modelo y vocabularios permitidos para la detección IA de prendas.'
)
on conflict (key) do nothing;
