-- =============================================================
-- WIW — Fase 2: Storage bucket "wardrobe-images"
-- 1) Crear el bucket desde Dashboard → Storage → New bucket
--    Nombre exacto: wardrobe-images
--    Public: OFF (privado, accederemos vía signed URLs)
-- 2) Ejecutar este SQL para las políticas de acceso.
-- =============================================================

-- Estructura esperada de paths: {user_id}/{wardrobe_id}/{filename}
-- El primer segmento del path siempre es el user_id del propietario.

drop policy if exists "wardrobe_images_select_own" on storage.objects;
create policy "wardrobe_images_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "wardrobe_images_insert_own" on storage.objects;
create policy "wardrobe_images_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wardrobe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "wardrobe_images_update_own" on storage.objects;
create policy "wardrobe_images_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wardrobe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "wardrobe_images_delete_own" on storage.objects;
create policy "wardrobe_images_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wardrobe-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
