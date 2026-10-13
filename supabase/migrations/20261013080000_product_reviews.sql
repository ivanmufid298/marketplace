-- Product reviews: what buyers say about a product, shown on its page.
--
-- Reading is public (for products that are on sale). Writing is for admins only for now: a buyer may only review a
-- product from a completed order, and orders do not live in the database yet. When they do, a later migration adds the
-- order link and a policy that lets that buyer write one review per purchased product. Until then `is_verified` stays
-- false for everything an admin enters, and nothing here can set it for a buyer.
--
-- Safe to run twice.

-- ---------------------------------------------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------------------------------------------
create table if not exists public.product_reviews (
  id          bigint generated always as identity primary key,
  product_id  bigint      not null references public.products (id) on delete cascade,
  -- The reviewer's account. Empty for rows entered by hand (test data, or an admin adding a review), and set to null
  -- when the account is deleted, so a review outlives its author's account.
  user_id     uuid        references auth.users (id) on delete set null,
  -- A copy of the name shown with the review, so it does not change or vanish with the account.
  author_name text        not null check (char_length(author_name) between 1 and 60),
  rating      smallint    not null check (rating between 1 and 5),
  body        text        not null check (char_length(body) between 1 and 2000),
  is_verified boolean     not null default false,
  -- `hidden` takes a review off the page without deleting it (moderation).
  status      text        not null default 'published' check (status in ('published', 'hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The product page lists the newest published reviews of one product.
create index if not exists product_reviews_product_idx on public.product_reviews (product_id, created_at desc) where status = 'published';
-- A foreign key without an index makes deleting the parent row scan the whole table.
create index if not exists product_reviews_user_idx on public.product_reviews (user_id);

drop trigger if exists product_reviews_set_updated_at on public.product_reviews;
create trigger product_reviews_set_updated_at
  before update on public.product_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------------------------------------
-- Privileges: start from nothing, grant only what is used (Supabase grants API roles everything on new tables).
-- ---------------------------------------------------------------------------------------------------------------
alter table public.product_reviews enable row level security;
revoke all on public.product_reviews from anon, authenticated;
grant select on public.product_reviews to anon, authenticated;
grant insert, update, delete on public.product_reviews to authenticated;

-- ---------------------------------------------------------------------------------------------------------------
-- Row Level Security. Reading is split per role because `anon` has no EXECUTE on is_admin(), and a policy that
-- mentions a function the caller cannot run fails the whole query (the same reason as in the catalog migration).
-- The products subquery runs under the caller's own products policy, so a review is visible exactly when its
-- product is: a draft's reviews stay hidden with it.
-- ---------------------------------------------------------------------------------------------------------------
drop policy if exists "product_reviews_select_public" on public.product_reviews;
create policy "product_reviews_select_public" on public.product_reviews
  for select to anon
  using (status = 'published' and exists (select 1 from public.products p where p.id = product_id));

drop policy if exists "product_reviews_select_authenticated" on public.product_reviews;
create policy "product_reviews_select_authenticated" on public.product_reviews
  for select to authenticated
  using ((status = 'published' and exists (select 1 from public.products p where p.id = product_id)) or (select public.is_admin()));

drop policy if exists "product_reviews_insert_admin" on public.product_reviews;
create policy "product_reviews_insert_admin" on public.product_reviews
  for insert to authenticated
  with check ((select public.is_admin()));

drop policy if exists "product_reviews_update_admin" on public.product_reviews;
create policy "product_reviews_update_admin" on public.product_reviews
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "product_reviews_delete_admin" on public.product_reviews;
create policy "product_reviews_delete_admin" on public.product_reviews
  for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------------------------------------------
-- Summary per product: how many reviews, the average, and how many of each star. `security_invoker` makes the view
-- obey the caller's row security on the table, so it never counts a review the caller may not read.
-- ---------------------------------------------------------------------------------------------------------------
create or replace view public.product_review_stats with (security_invoker = true) as
select
  product_id,
  count(*)::int                           as review_count,
  round(avg(rating)::numeric, 2)          as average_rating,
  (count(*) filter (where rating = 1))::int as star_1,
  (count(*) filter (where rating = 2))::int as star_2,
  (count(*) filter (where rating = 3))::int as star_3,
  (count(*) filter (where rating = 4))::int as star_4,
  (count(*) filter (where rating = 5))::int as star_5
from public.product_reviews
where status = 'published'
group by product_id;

revoke all on public.product_review_stats from anon, authenticated;
grant select on public.product_review_stats to anon, authenticated;
