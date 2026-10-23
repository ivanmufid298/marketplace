-- The shop's public profile: its name and its logo.
--
-- The storefront header, the admin panel and (later) the emails the shop sends show the shop's name and logo, and the shop owner
-- changes them from the admin panel. They are not secret, so everyone can read them, and only admins can change them.
--
-- There is exactly one row (id = 1). The logo is a file in the public bucket `shop-brand`, always a PNG (the browser converts what the
-- admin picks, so email programs, which handle PNG best, can show it). Each logo is stored under a fresh random key and never
-- rewritten, so the old one is simply replaced and removed. Safe to run twice.

create table if not exists public.shop_profile (
  id         smallint    primary key default 1 check (id = 1),
  -- What the shop is called. No spaces around it, 1 to 60 characters.
  shop_name  text        not null default 'Market by Kith' check (shop_name = btrim(shop_name) and char_length(shop_name) between 1 and 60),
  -- Where the logo is in the bucket (logo/<uuid>.png); empty means no logo yet.
  logo_key   text        check (logo_key is null or logo_key ~ '^logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$'),
  updated_at timestamptz not null default now()
);

insert into public.shop_profile (id) values (1) on conflict (id) do nothing;

drop trigger if exists shop_profile_set_updated_at on public.shop_profile;
create trigger shop_profile_set_updated_at before update on public.shop_profile for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges and Row Level Security: everyone reads the row (visitors included), only admins change the two fields, nobody adds or
-- deletes the one row.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.shop_profile enable row level security;
revoke all on public.shop_profile from anon, authenticated;
grant select on public.shop_profile to anon, authenticated;
grant update (shop_name, logo_key) on public.shop_profile to authenticated;

drop policy if exists "shop_profile_select" on public.shop_profile;
create policy "shop_profile_select" on public.shop_profile for select to anon, authenticated using (true);

drop policy if exists "shop_profile_update_admin" on public.shop_profile;
create policy "shop_profile_update_admin" on public.shop_profile for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------------------------
-- The logo's bucket. Public, so the logo is fetched by its address with no policy involved (the storefront and emails need that) and
-- the CDN can keep it. Only an admin may add, replace, or remove files. PNG only, up to 1 MB.
-- ---------------------------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shop-brand', 'shop-brand', true, 1048576, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "shop_brand_objects_select_admin" on storage.objects;
create policy "shop_brand_objects_select_admin" on storage.objects
  for select to authenticated
  using (bucket_id = 'shop-brand' and (select public.is_admin()));

drop policy if exists "shop_brand_objects_insert_admin" on storage.objects;
create policy "shop_brand_objects_insert_admin" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'shop-brand' and (select public.is_admin()));

drop policy if exists "shop_brand_objects_update_admin" on storage.objects;
create policy "shop_brand_objects_update_admin" on storage.objects
  for update to authenticated
  using (bucket_id = 'shop-brand' and (select public.is_admin()))
  with check (bucket_id = 'shop-brand' and (select public.is_admin()));

drop policy if exists "shop_brand_objects_delete_admin" on storage.objects;
create policy "shop_brand_objects_delete_admin" on storage.objects
  for delete to authenticated
  using (bucket_id = 'shop-brand' and (select public.is_admin()));
