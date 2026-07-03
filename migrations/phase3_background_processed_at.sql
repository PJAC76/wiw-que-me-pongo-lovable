-- =============================================================
-- WIW — Fase 3: timestamp de "procesado" para el fondo.
-- Marca cuándo se completó el último procesamiento de fondo,
-- para verificar en UI/tests que el flujo terminó y para poder
-- ordenar/expirar caches por antigüedad.
-- =============================================================

alter table public.clothing_items
  add column if not exists background_processed_at timestamptz;

comment on column public.clothing_items.background_processed_at is
  'Timestamp UTC de la última ejecución exitosa del procesamiento de fondo. Nulo si nunca se ha procesado.';
