-- Notifications that are done with disappear, instead of staying as stale instructions.
--
-- A notification that asked the buyer to do something ("send your transfer proof") used to stay in the list, marked
-- read, after the buyer had done it, still saying "Selesaikan pembayaran". Reading a notification and finishing the
-- thing it asks are different, so they are now kept apart: `read_at` is "the buyer has seen it", `resolved_at` is "there
-- is nothing left to do about it". The bell hides resolved notifications.
--
-- A request is resolved when the proof arrives, the order is cancelled or expires, and an invitation to review is
-- resolved once every item of the order has a review. (Resolving also marks it read, so it leaves the count.)
--
-- Safe to run twice.

alter table public.notifications add column if not exists resolved_at timestamptz;

-- Requests from before this column existed: resolved when the order is no longer in the state they asked about.
update public.notifications n
   set resolved_at = coalesce(n.read_at, now()), read_at = coalesce(n.read_at, now())
  from public.orders o
 where n.order_id = o.id and n.resolved_at is null
   and ((n.kind = 'payment_needed' and (o.payment_status <> 'awaiting_payment' or o.cancelled_at is not null))
     or (n.kind = 'payment_rejected' and (o.payment_status <> 'rejected' or o.cancelled_at is not null)));

create or replace function public.resolve_notifications(p_order_ids uuid[], p_kinds text[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notifications
     set resolved_at = now(), read_at = coalesce(read_at, now())
   where order_id = any (p_order_ids) and kind = any (p_kinds) and resolved_at is null;
$$;

-- The invitation to review is done once every item of the order (that still has a product) has a review.
create or replace function public.resolve_review_invite(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.order_items oi
     where oi.order_id = p_order_id and oi.product_id is not null
       and not exists (select 1 from public.product_reviews r where r.order_item_id = oi.id)
  ) then
    perform public.resolve_notifications(array[p_order_id], array['review_invite']);
  end if;
end;
$$;

revoke execute on function public.resolve_notifications(uuid[], text[]) from public, anon, authenticated;
revoke execute on function public.resolve_review_invite(uuid) from public, anon, authenticated;

-- The review function again, resolving the invitation when the last item is reviewed. Nothing else in it changes.
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
    perform public.resolve_review_invite(v_order.id);
    return v_review.id;
  end if;

  insert into public.product_reviews (product_id, user_id, order_item_id, author_name, rating, body, is_verified, status)
  values (v_item.product_id, v_uid, p_order_item_id, left(v_order.recipient_name, 60), p_rating, v_body, true, 'published')
  returning id into v_review.id;
  perform public.resolve_review_invite(v_order.id);
  return v_review.id;
end;
$$;
