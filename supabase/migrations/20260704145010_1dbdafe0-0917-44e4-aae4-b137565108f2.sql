
create policy "public-outfits read for all"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'public-outfits');

create policy "public-outfits owner upload"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'public-outfits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "public-outfits owner update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'public-outfits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "public-outfits owner delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'public-outfits'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
