-- =============================================================
-- WIW — Fase 3: procesamiento de fondo para prendas
-- Añade la columna storage_path del recorte sin fondo para poder
-- firmar URLs y borrar el objeto al eliminar la prenda.
-- Se apoya en el bucket `wardrobe-images` ya creado (mismas RLS,
-- objetos guardados bajo el subprefijo `<user_id>/<wardrobe_id>/bg/`).
-- =============================================================

alter table public.clothing_items
  add column if not exists background_removed_storage_path text;

comment on column public.clothing_items.background_removed_image_url is
  'Signed URL cacheada de la versión sin fondo. Puede caducar; regenerar desde storage_path.';
comment on column public.clothing_items.background_removed_storage_path is
  'Ruta en el bucket wardrobe-images del recorte sin fondo (<user>/<wardrobe>/bg/<item>.png).';
