-- One read rule for signed-in people on reviews, instead of two.
--
-- Signed-in people could read a review through either of two policies ("published, or you are an admin" and "it is
-- yours"). Postgres has to evaluate every permissive policy for each row, so two for the same role and action is slower
-- than one (the Supabase linter flags it). They are merged into one rule that says exactly the same thing:
-- a signed-in person reads a review that is published and whose product still exists, or any review if they are an admin,
-- or their own (even one an admin hid, so "Pesanan saya" can show what they wrote).
--
-- Visitors who are not signed in keep their own policy. Safe to run twice.

drop policy if exists "product_reviews_select_own" on public.product_reviews;
drop policy if exists "product_reviews_select_authenticated" on public.product_reviews;
create policy "product_reviews_select_authenticated" on public.product_reviews
  for select to authenticated
  using (
    (status = 'published' and exists (select 1 from public.products p where p.id = product_id))
    or (select public.is_admin())
    or user_id = (select auth.uid())
  );
