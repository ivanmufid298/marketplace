-- Storage bucket for product photos.
--
-- Public bucket: a photo is fetched by its URL with no policy involved, which is what the storefront needs and what
-- lets the CDN cache it. Only an admin may add, replace, or remove files; nobody else can even list them.
--
-- The browser resizes each photo into a few WebP files before uploading (400, 800, 1600 px), so files are small and
-- the limits below are generous on purpose. JPEG is allowed as a fallback for browsers that cannot encode WebP.
--
-- Safe to run more than once. Run it with `supabase db push` or in the SQL editor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product_images_objects_select_admin" on storage.objects;
create policy "product_images_objects_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists "product_images_objects_insert_admin" on storage.objects;
create policy "product_images_objects_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists "product_images_objects_update_admin" on storage.objects;
create policy "product_images_objects_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()))
  with check (bucket_id = 'product-images' and (select public.is_admin()));

drop policy if exists "product_images_objects_delete_admin" on storage.objects;
create policy "product_images_objects_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images' and (select public.is_admin()));
