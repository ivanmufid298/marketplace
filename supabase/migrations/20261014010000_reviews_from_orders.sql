-- Reviews written by buyers, from a completed order.
--
-- A review belongs to one item of one order, so it can only come from someone who bought the product, and only after
-- they confirmed the goods arrived ("Pesanan selesai"). It is marked verified because of that. A buyer writes and edits
-- it through submit_review(); nobody writes the table directly (admins still moderate it: hide, show, delete).
--
-- Errors are short codes, like the order functions: not_signed_in, item_not_found, not_reviewable, invalid_rating,
-- invalid_review.
--
-- Safe to run twice.

-- One review per bought item. Empty for reviews an admin entered by hand; set to null if the order item is ever removed.
alter table public.product_reviews add column if not exists order_item_id bigint references public.order_items (id) on delete set null;
create unique index if not exists product_reviews_order_item_key on public.product_reviews (order_item_id) where order_item_id is not null;

-- A buyer can always read their own reviews, even one an admin hid, so "Pesanan saya" can show what they wrote.
drop policy if exists "product_reviews_select_own" on public.product_reviews;
create policy "product_reviews_select_own" on public.product_reviews
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.submit_review(p_order_item_id bigint, p_rating integer, p_body text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_body   text := btrim(coalesce(p_body, ''));
  v_item   public.order_items;
  v_order  public.orders;
  v_review public.product_reviews;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '28000';
  end if;

  -- Only the buyer's own order item is visible to them here; anything else looks like it does not exist.
  select oi.* into v_item
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
   where oi.id = p_order_item_id and o.buyer_id = v_uid;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = v_item.order_id for update;

  -- Paid, confirmed received, not cancelled, and the product still exists to attach the review to.
  if v_order.payment_status <> 'paid' or v_order.received_at is null or v_order.cancelled_at is not null or v_item.product_id is null then
    raise exception 'not_reviewable' using errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 2000 then
    raise exception 'invalid_review' using errcode = 'P0001';
  end if;

  select * into v_review from public.product_reviews where order_item_id = p_order_item_id for update;
  if found then
    -- The buyer edits their own review. A review an admin hid stays hidden.
    update public.product_reviews set rating = p_rating, body = v_body where id = v_review.id;
    return v_review.id;
  end if;

  insert into public.product_reviews (product_id, user_id, order_item_id, author_name, rating, body, is_verified, status)
  values (v_item.product_id, v_uid, p_order_item_id, left(v_order.recipient_name, 60), p_rating, v_body, true, 'published')
  returning id into v_review.id;
  return v_review.id;
end;
$$;

revoke execute on function public.submit_review(bigint, integer, text) from public, anon, authenticated;
grant execute on function public.submit_review(bigint, integer, text) to authenticated;
