-- Catalog: categories, products, and product photos.
--
-- Single-seller shop. The public can read what is on sale; only an admin can change anything. Admin is decided by
-- public.is_admin() (see the profiles migration), never by anything the client sends.
--
-- Money is whole rupiah in a bigint (IDR has no minor unit in practice). Weight is in grams: automatic shipping rates
-- (PRD 10.2) need it, and adding it later would mean editing every product by hand.
--
-- Photos live in Storage (see the product_images_bucket migration). This schema stores only the object key.
--
-- Safe to run more than once. Run it with `supabase db push` or in the SQL editor.

-- ---------------------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.categories (
  id         bigint generated always as identity primary key,
  name       text        not null check (char_length(name) between 1 and 60),
  slug       text        not null check (char_length(slug) <= 60 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order integer     not null default 0,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_slug_key on public.categories (slug);
create unique index if not exists categories_name_key on public.categories (lower(name));

create table if not exists public.products (
  id               bigint generated always as identity primary key,
  slug             text        not null check (char_length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name             text        not null check (char_length(name) between 1 and 160),
  description      text        not null default '' check (char_length(description) <= 5000),
  -- A category cannot be deleted while products use it. Deactivate it instead.
  category_id      bigint      not null references public.categories (id) on delete restrict,
  price            bigint      not null check (price >= 0),
  -- "Harga coret": the old price shown struck through. Must be higher than the price to mean anything.
  compare_at_price bigint      check (compare_at_price is null or compare_at_price > price),
  stock            integer     not null default 0 check (stock >= 0),
  weight_gram      integer     not null check (weight_gram between 1 and 1000000),
  -- Short label on the product card, such as "Best seller" or "Limited".
  badge            text        check (badge is null or char_length(badge) between 1 and 40),
  -- draft: not visible to buyers. active: on sale. archived: hidden but kept, because old orders point at it.
  status           text        not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists products_slug_key on public.products (slug);
-- Foreign keys are not indexed by Postgres on their own.
create index if not exists products_category_id_idx on public.products (category_id);
-- The storefront list: active products in display order.
create index if not exists products_active_order_idx on public.products (sort_order, id) where status = 'active';

create table if not exists public.product_images (
  id         bigint generated always as identity primary key,
  product_id bigint      not null references public.products (id) on delete cascade,
  -- Base key of the photo in Storage. Each size is stored next to it as a separate WebP file (400, 800, 1600 px).
  object_key text        not null check (char_length(object_key) between 1 and 300),
  alt        text        not null default '' check (char_length(alt) <= 160),
  sort_order integer     not null default 0,
  -- Pixel size of the largest stored variant, so the page can reserve space before the image loads.
  width      integer     check (width is null or width > 0),
  height     integer     check (height is null or height > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists product_images_object_key_key on public.product_images (object_key);
create index if not exists product_images_product_order_idx on public.product_images (product_id, sort_order);

-- ---------------------------------------------------------------------------------------------------------------
-- updated_at (public.set_updated_at() comes from the profiles migration)
-- ---------------------------------------------------------------------------------------------------------------
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges
--
-- Supabase gives API roles full access to new public tables by default, so remove it first and grant back only what
-- is needed. RLS below then decides which rows. Products have no DELETE: an old order may point at one, so it is
-- archived instead of removed.
-- ---------------------------------------------------------------------------------------------------------------
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.product_images enable row level security;

revoke all on public.categories, public.products, public.product_images from anon, authenticated;

grant select on public.categories, public.products, public.product_images to anon, authenticated;
grant insert, update, delete on public.categories     to authenticated;
grant insert, update         on public.products       to authenticated;
grant insert, update, delete on public.product_images to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Policies
--
-- Reading is split per role on purpose. `anon` has no EXECUTE on is_admin(), and a policy that mentions a function the
-- role cannot execute makes the whole query fail, even when the other half of the OR would have matched.
-- Writing is for admins only; a signed-in buyer has the table privilege but no policy lets them through.
-- ---------------------------------------------------------------------------------------------------------------

-- categories
drop policy if exists "categories_select_public" on public.categories;
create policy "categories_select_public" on public.categories
  for select to anon
  using (is_active);

drop policy if exists "categories_select_authenticated" on public.categories;
create policy "categories_select_authenticated" on public.categories
  for select to authenticated
  using (is_active or (select public.is_admin()));

drop policy if exists "categories_insert_admin" on public.categories;
create policy "categories_insert_admin" on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "categories_update_admin" on public.categories;
create policy "categories_update_admin" on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "categories_delete_admin" on public.categories;
create policy "categories_delete_admin" on public.categories
  for delete to authenticated
  using ((select public.is_admin()));

-- products
drop policy if exists "products_select_public" on public.products;
create policy "products_select_public" on public.products
  for select to anon
  using (status = 'active');

drop policy if exists "products_select_authenticated" on public.products;
create policy "products_select_authenticated" on public.products
  for select to authenticated
  using (status = 'active' or (select public.is_admin()));

drop policy if exists "products_insert_admin" on public.products;
create policy "products_insert_admin" on public.products
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "products_update_admin" on public.products;
create policy "products_update_admin" on public.products
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- product_images: visible exactly when the product is. The subquery runs under the caller's own products policy,
-- so a draft or archived product's photos stay hidden from buyers without repeating the rule here.
drop policy if exists "product_images_select" on public.product_images;
create policy "product_images_select" on public.product_images
  for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_images.product_id));

drop policy if exists "product_images_insert_admin" on public.product_images;
create policy "product_images_insert_admin" on public.product_images
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "product_images_update_admin" on public.product_images;
create policy "product_images_update_admin" on public.product_images
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "product_images_delete_admin" on public.product_images;
create policy "product_images_delete_admin" on public.product_images
  for delete to authenticated
  using ((select public.is_admin()));
